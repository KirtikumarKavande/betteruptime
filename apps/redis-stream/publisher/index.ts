import redisInstance from "../redisInstance";
import { prismaClient } from "@repo/db/client";

async function websitePublisher() {
  console.log("Starting website publisher");
  let client = await redisInstance();

  //info: get all websites from db and put into queue

  try {
    const websites = await prismaClient.website.findMany();
    websites.forEach(async (website) => { 
      await client.xAdd("website_stream", "*", {
        id: website.id,
        url: website.url,
        user_id: website.user_id,
        time_added: website.time_added.toISOString(),
      });
      console.log("Publishing website", website);
    });
  } catch (e) {
    console.error("Error publishing websites", e);
  }
}

websitePublisher();
