import redisInstance from "../redisInstance";
import { websiteStream, dbQueue } from "../constants";
import axios, { AxiosError } from "axios";

// Types
interface Website {
  id?: string;
  url: string;
  time_added?: Date;
}

enum status {
  "Up" = "Up",
  "Down" = "Down",
}

interface WebsiteWithStatus extends Website {
  status?: status.Down | status.Up;
  error_message?: string;
}

interface ConsumerManager {
  groupName: string;
  consumers: Map<string, AbortController>;
  isScaling: boolean;
}

interface webStatusPromise {
  status: string;
  value: WebsiteWithStatus;
}

// Configuration
const CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  requestTimeout: 10000,
  scaleUpThreshold: 100,
  scaleDownThreshold: 10,
  maxConsumers: 10,
  minConsumers: 1,
  scaleInterval: 60000, // 1 minute
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  blockTimeout: 5000,
  streamCleanupThreshold: 1000,
  cleanupBufferTime: 60 * 60 * 1000, // 1 hour buffer
};

class WebsiteMonitorConsumer {
  private managers = new Map<string, ConsumerManager>();
  private dbConsumerRunning = false;
  private shutdownSignal = new AbortController();
  private cleanupIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.setupGracefulShutdown();
  }

  async initialize(groups: string[]) {
    const client = await redisInstance();

    try {
      // Create consumer groups
      for (const groupName of groups) {
        await this.ensureGroup(client, groupName);
        this.managers.set(groupName, {
          groupName,
          consumers: new Map(),
          isScaling: false,
        });
      }

      // Start DB consumer once
      this.startDbConsumer();

      // Start scaling, consuming, and cleanup for each group
      for (const groupName of groups) {
        await this.scaleConsumer(groupName);
        this.startPeriodicScaling(groupName);
        this.startCleanupProcess(groupName);
      }
    } finally {
      await client.quit();
    }
  }

  private async ensureGroup(client: any, groupName: string) {
    try {
      await client.xGroupCreate(websiteStream, groupName, "0", {
        MKSTREAM: true,
      });
      console.log(`✅ Consumer group '${groupName}' created`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("BUSYGROUP")) {
        console.log(`Consumer group '${groupName}' already exists`);
      } else {
        console.error(`Error creating group '${groupName}':`, err);
        throw err;
      }
    }
  }

  private async scaleConsumer(groupName: string) {
    const manager = this.managers.get(groupName);
    if (!manager || manager.isScaling) return;

    manager.isScaling = true;
    const client = await redisInstance();

    try {
      const [groupInfo, streamInfo] = await Promise.all([
        client.xInfoGroups(websiteStream),
        client.xInfoStream(websiteStream),
      ]);

      const ourGroup = groupInfo.find((item: any) => item.name === groupName);
      if (!ourGroup) {
        console.error(`Group ${groupName} not found`);
        return;
      }

      const unprocessedCount = await this.calculateUnprocessedMessages(
        client,
        ourGroup["last-delivered-id"],
        streamInfo["last-generated-id"]
      );

      const desiredConsumers = this.calculateDesiredConsumers(unprocessedCount);
      const currentConsumers = manager.consumers.size;

      console.log(
        `📊 Group: ${groupName}, Unprocessed: ${unprocessedCount}, Current: ${currentConsumers}, Desired: ${desiredConsumers}`
      );

      if (desiredConsumers > currentConsumers) {
        await this.scaleUp(manager, desiredConsumers - currentConsumers);
      } else if (desiredConsumers < currentConsumers) {
        await this.scaleDown(manager, currentConsumers - desiredConsumers);
      }
    } catch (error) {
      console.error(`❌ Error scaling consumer group ${groupName}:`, error);
    } finally {
      manager.isScaling = false;
      await client.quit();
    }
  }

  private calculateDesiredConsumers(unprocessedCount: number): number {
    if (unprocessedCount > CONFIG.scaleUpThreshold)
      return Math.min(5, CONFIG.maxConsumers);
    if (unprocessedCount > CONFIG.scaleDownThreshold)
      return Math.min(3, CONFIG.maxConsumers);
    return CONFIG.minConsumers;
  }

  private async calculateUnprocessedMessages(
    client: any,
    lastDeliveredId: string,
    lastGeneratedId: string
  ): Promise<number> {
    try {
      if (lastDeliveredId === "0-0") {
        return await client.xLen(websiteStream);
      }
      if (lastDeliveredId === lastGeneratedId) {
        return 0;
      }

      const messages = await client.xRange(
        websiteStream,
        `(${lastDeliveredId}`, // Exclude lastDeliveredId
        "+",
        { COUNT: 1000 }
      );
      return messages.length;
    } catch (error) {
      console.error("Error calculating unprocessed messages:", error);
      return 0;
    }
  }

  private async scaleUp(manager: ConsumerManager, count: number) {
    for (let i = 0; i < count; i++) {
      const consumerId = `consumer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const abortController = new AbortController();

      manager.consumers.set(consumerId, abortController);

      // Start consumer without awaiting (fire and forget)
      this.startConsumer(
        manager.groupName,
        consumerId,
        abortController.signal
      ).catch((error) => {
        console.error(`❌ Consumer ${consumerId} failed:`, error);
        manager.consumers.delete(consumerId);
      });
    }
    console.log(`📈 Scaled up ${manager.groupName} by ${count} consumers`);
  }

  private async scaleDown(manager: ConsumerManager, count: number) {
    const consumersToRemove = Array.from(manager.consumers.entries()).slice(
      0,
      count
    );

    for (const [consumerId, controller] of consumersToRemove) {
      controller.abort();
      manager.consumers.delete(consumerId);
    }
    console.log(`📉 Scaled down ${manager.groupName} by ${count} consumers`);
  }

  private async startConsumer(
    groupName: string,
    consumerId: string,
    signal: AbortSignal
  ) {
    const client = await redisInstance();

    try {
      while (!signal.aborted && !this.shutdownSignal.signal.aborted) {
        try {
          const res = await client.xReadGroup(
            groupName,
            consumerId,
            [{ key: websiteStream, id: ">" }],
            {
              COUNT: 10,
              BLOCK: CONFIG.blockTimeout,
            }
          );

          if (res && res.length > 0) {
            const messages = res[0].messages;
            await this.checkWebsiteStatus(messages, client, groupName);
          }
        } catch (error) {
          if (signal.aborted) break;
          console.error(`❌ Error in consumer ${consumerId}:`, error);
          await this.sleep(1000); // Brief pause before retry
        }
      }
    } finally {
      console.log(`🛑 Consumer ${consumerId} stopped`);
      await client.quit();
    }
  }


  async removeMessageFromStream(
    websiteStream: string,
    client: any,
    groupName: string,
    messageId: string
  ) {
    try {
      await client.xAck(websiteStream, groupName, messageId);
    } catch (error) {
      console.error(`❌ Failed to acknowledge message ${messageId}:`, error);
    }
  }
  private async checkWebsiteStatus(
    messages: any[],
    client: any,
    groupName: string
  ) {
    const res = messages.map(async (message) => {
      const { id: messageId, message: websiteData } = message;

      try {
        if (websiteData) {
          await this.makeRequest(websiteData.url);
        }
        return {
          id: websiteData.id,
          url: websiteData.url,
          status: status.Up,
        };
      } catch (error) {
        return {
          id: websiteData.id,
          url: websiteData.url,
          status: status.Down,
        };
      } finally {
        this.removeMessageFromStream(
          websiteStream,
          client,
          groupName,
          messageId
        );
      }
    });

    const response: PromiseSettledResult<WebsiteWithStatus>[] =
      await Promise.allSettled(res);

    response.forEach(async (item) => {
      if (item.status === "fulfilled") {
        try {
          await client.xAdd(dbQueue, "*", {
            ...item.value,
            processed_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error(`❌ Failed to add to DB queue:`, error);
        }
      }
    });
  }

  private async makeRequest(url: string, retries = 0): Promise<any> {
    try {
      return axios.get(url, {
        // timeout: CONFIG.requestTimeout,
        // validateStatus: status => status < 500 // Don't retry 4xx errors
      });
    } catch (error) {
      // if (retries < CONFIG.maxRetries && this.isRetryableError(error)) {
      //   console.log(`🔄 Retrying ${url} (attempt ${retries + 1})`);
      //   await this.sleep(CONFIG.retryDelay * Math.pow(2, retries)); // Exponential backoff
      //   return this.makeRequest(url, retries + 1);
      // }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    if (error.code === "ECONNABORTED") return false; // Timeout
    if (error.response?.status >= 400 && error.response?.status < 500)
      return false; // Client errors
    return true; // Network errors, 5xx errors
  }

  private startDbConsumer() {
    if (this.dbConsumerRunning) return;

    this.dbConsumerRunning = true;
    this.runDbConsumer().catch((error) => {
      console.error("❌ DB Consumer failed:", error);
      this.dbConsumerRunning = false;
    });
  }

  private async runDbConsumer() {
    const client = await redisInstance();
    console.log("🚀 Starting DB consumer");

    try {
      while (!this.shutdownSignal.signal.aborted) {
        try {
          const result = await client.xRead(
            { key: dbQueue, id: "$" },
            { BLOCK: CONFIG.blockTimeout }
          );

          if (result && result.length > 0) {
            const messages = result[0].messages;
            console.log(`📊 DB Consumer received ${messages.length} messages`);

            // Process DB messages here
            for (const message of messages) {
              console.log("clear", message);
              // TODO: Insert into actual database
            }
          }
        } catch (error) {
          if (this.shutdownSignal.signal.aborted) break;
          console.error("❌ Error in DB consumer:", error);
          await this.sleep(1000);
        }
      }
    } finally {
      console.log("🛑 DB consumer stopped");
      await client.quit();
    }
  }

  private startPeriodicScaling(groupName: string) {
    const interval = setInterval(async () => {
      if (this.shutdownSignal.signal.aborted) {
        clearInterval(interval);
        return;
      }

      try {
        await this.scaleConsumer(groupName);
      } catch (error) {
        console.error(`❌ Periodic scaling failed for ${groupName}:`, error);
      }
    }, CONFIG.scaleInterval);

    // Clean up on shutdown
    this.shutdownSignal.signal.addEventListener("abort", () => {
      clearInterval(interval);
    });
  }

  private startCleanupProcess(groupName: string) {
    // Prevent multiple cleanup processes for the same group
    if (this.cleanupIntervals.has(groupName)) {
      console.log(`Cleanup already running for group ${groupName}`);
      return;
    }

    const interval = setInterval(async () => {
      if (this.shutdownSignal.signal.aborted) {
        this.stopCleanupProcess(groupName);
        return;
      }
      await this.runCleanupForGroup(groupName);
    }, CONFIG.cleanupInterval);

    this.cleanupIntervals.set(groupName, interval);
    console.log(`🧹 Started cleanup process for group ${groupName}`);
  }

  private stopCleanupProcess(groupName: string) {
    const interval = this.cleanupIntervals.get(groupName);
    if (interval) {
      clearInterval(interval);
      this.cleanupIntervals.delete(groupName);
      console.log(`🛑 Stopped cleanup process for group ${groupName}`);
    }
  }

  private async runCleanupForGroup(groupName: string) {
    const client = await redisInstance();

    try {
      console.log(` Starting cleanup for group ${groupName}`);

      const [streamLength, groupInfo] = await Promise.all([
        client.xLen(websiteStream),
        client.xInfoGroups(websiteStream),
      ]);

      const ourGroup = groupInfo.find((item: any) => item.name === groupName);
      if (!ourGroup) {
        console.error(`Group ${groupName} not found during cleanup`);
        return;
      }

      // Only cleanup if stream is large enough
      if (streamLength <= CONFIG.streamCleanupThreshold) {
        console.log(
          ` Stream length (${streamLength}) below cleanup threshold (${CONFIG.streamCleanupThreshold})`
        );
        return;
      }

      // Check if group has processed any messages
      if (ourGroup["last-delivered-id"] === "0-0") {
        console.log(
          `Group ${groupName} hasn't processed any messages yet, skipping cleanup`
        );
        return;
      }

      // Calculate safe cleanup point
      const lastDeliveredTimestamp = parseInt(
        ourGroup["last-delivered-id"].split("-")[0]
      );
      const safeCleanupTimestamp =
        lastDeliveredTimestamp - CONFIG.cleanupBufferTime;
      const safeStreamId = `${safeCleanupTimestamp}-0`;

      try {
        const trimmed = await client.xTrim(
          websiteStream,
          "MINID",
          safeStreamId
        );

        if (trimmed > 0) {
          console.log(
            `✅ Successfully trimmed ${trimmed} old messages from stream for group ${groupName}`
          );
        } else {
          console.log(
            `ℹ️ No messages were trimmed for group ${groupName} - all messages are within buffer time`
          );
        }
      } catch (trimError) {
        console.error(
          `Could not trim stream for group ${groupName}:`,
          trimError
        );
      }
    } catch (error) {
      console.error(`Error during cleanup for group ${groupName}:`, error);
    } finally {
      await client.quit();
    }
  }

  private setupGracefulShutdown() {
    const shutdown = async () => {
      console.log("Shutting down gracefully...");
      this.shutdownSignal.abort();

      // Stop all consumers
      for (const manager of this.managers.values()) {
        for (const controller of manager.consumers.values()) {
          controller.abort();
        }
      }

      // Stop all cleanup processes
      for (const groupName of this.cleanupIntervals.keys()) {
        this.stopCleanupProcess(groupName);
      }

      // Wait a bit for cleanup
      await this.sleep(2000);
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    process.on("SIGQUIT", shutdown); // Additional signal for completeness
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
const monitor = new WebsiteMonitorConsumer();
monitor
  .initialize(["INDIA"])
  .then(() => console.log("Website monitor initialized with cleanup process"))
  .catch((error) => {
    console.error("❌ Failed to initialize:", error);
    process.exit(1);
  });
