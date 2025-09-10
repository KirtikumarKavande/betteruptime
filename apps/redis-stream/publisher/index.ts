import { websiteStream } from "../constants";
import redisInstance from "../redisInstance";
import { prismaClient } from "@repo/db/client";

type RedisMultiResult = string[];

type QueueOperationResult = RedisMultiResult | never;

// Define batch processing result
interface BatchResult {
  batchNumber: number;
  success: number;
  failed: number;
  errors: Array<{ website: Website; error: string }>;
}

type SettledResult<T> = 
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: any };

  

interface WEBSITEPUBLISHER {
  batchSize: number;
  maxConcurrentRequest: number;
  result: BatchResult[]; 
}

interface Website {
  id: string;
  url: string;
  user_id: string;
  time_added: Date;
}

class WebsitePublisher implements WEBSITEPUBLISHER {
  batchSize: number;
  maxConcurrentRequest: number;
  streamName: string;
  timeoutExceededTime: number;
  result: BatchResult[];

  constructor(
    streamName: string,
    batchSize?: number,
    maxConcurrentRequest?: number,
    timeoutExceededTime?: number
  ) {
    this.streamName = streamName;
    this.batchSize = batchSize || 100;
    this.maxConcurrentRequest = maxConcurrentRequest || 10;
    this.result = [];
    this.timeoutExceededTime = timeoutExceededTime || 8000;
  }

  
  batchData(data: Website[]): void {
    const batches: Website[][] = [];

    for (let index = 0; index < data.length; index += this.batchSize) {
      batches.push(data.slice(index, index + this.batchSize));
    }
    this.makeConcurrentRequests(batches);
  }


  async addDataToQueue(batchChunk: Website[]): Promise<QueueOperationResult> {
    try {
      const client = await redisInstance();
      const multi = client.multi();

      batchChunk.forEach((website: Website) => {
        multi.xAdd(this.streamName, "*", {
          id: website.id,
          url: website.url,
          user_id: website.user_id,
          time_added: website.time_added.toISOString(),
        });
      });

      const timeoutExceededPromise = this.timeoutExceeded();
      const multiPromise = multi.exec();

      const promiseResult = await Promise.race([
        timeoutExceededPromise,
        multiPromise,
      ]);

      return promiseResult as QueueOperationResult;
    } catch (error) {
      console.log("error while adding data to queue", error);
      throw error; 
    }
  }


  async timeoutExceeded(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("adding batch inside stream failed"));
      }, this.timeoutExceededTime);
    });
  }


  async makeConcurrentRequests(batches: Website[][]): Promise<void> {
    for (
      let index = 0;
      index < batches.length;
      index += this.maxConcurrentRequest
    ) {
      const batchChunk: Website[][] = batches.slice(
        index,
        index + this.maxConcurrentRequest
      );

      const batchPromises: Promise<QueueOperationResult>[] = batchChunk.map(
        (batch: Website[]) => this.addDataToQueue(batch)
      );

      const results: SettledResult<RedisMultiResult>[] = await Promise.allSettled(batchPromises);
      
      console.log("final response", results);
      
      const batchResult = this.processBatchResults(results, index / this.maxConcurrentRequest);
      this.result.push(batchResult);
    }
  }


  private processBatchResults(
    results: SettledResult<QueueOperationResult>[], 
    batchNumber: number
  ): BatchResult {
    let success = 0;
    let failed = 0;
    const errors: Array<{ website: Website; error: string }> = [];  

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        failed++;
        errors.push({
          website: {} as Website, 
          error: result.reason.message || 'Unknown error'
        });
      }
    });

    return {
      batchNumber,
      success,
      failed,
      errors
    };
  }
}

const websiteData = new WebsitePublisher(websiteStream);

prismaClient.website
  .findMany()
  .then((websites: Website[]) => {
    websiteData.batchData(websites);
  })
  .catch((error: Error) => {
    console.log("error while importing data from db", error.message);
  });


