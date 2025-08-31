import { createClient } from "redis";

async function redisInstance(): Promise<any>{
    const client = await createClient()
      .on("error", (err) => console.log("Redis Client Error", err))
      .connect();

    return client;
}
export default redisInstance;