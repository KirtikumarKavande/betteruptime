import {prismaClient}  from "@repo/db/client";
import express from "express";

const app = express();
app.use(express.json());

app.post('/register',async(req,res)=>{
const {url} = req.body;
await prismaClient.website.create({
            data: {
                url: url,
            }
        });

        res.send("post is working")
})

app.get('/health',(req,res)=>{
    res.send("ok")
})

app.listen(3001,()=>{
    console.log("server is running")
})

