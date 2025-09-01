import redisInstance from "../redisInstance";

// info:create consumer group if not exists


async function createConsumerGroups() {
  const client = await redisInstance();

  const streamKey = "website_stream";

  async function ensureGroup(groupName: string) {
    try {
        // notes: MKSTREAM: true → creates the stream automatically if it doesn’t exist.
      await client.xGroupCreate(streamKey, groupName, "0", { MKSTREAM: true });
      console.log(`✅ Consumer group '${groupName}' created`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("BUSYGROUP")) {
        console.log(`ℹ️ Consumer group '${groupName}' already exists`);
      } else {
        console.error(`❌ Error creating group '${groupName}':`, err);
      }
    }
  }

  await ensureGroup("US");
  await ensureGroup("INDIA");

  await client.quit();
}

createConsumerGroups();



