import { dbQueue } from "../constants";
import redisInstance from "../redisInstance";

async function dbQueueConsumer() {
  const client = await redisInstance();

  try {
    while (1) {
      const dbData = await client.xRead(
        {
          key: dbQueue,
          id: "$", 
        },
        { BLOCK: 5000 } 
      );
      console.log("messageskkk", dbData);

      if(dbData){
       console.log(dbData?.messages); 
      }
    }
  } catch (err) {
    console.log(err);
    console.log("error while reading form db queue", err);
  }
}

export default dbQueueConsumer;
