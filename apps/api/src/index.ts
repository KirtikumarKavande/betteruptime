import { prismaClient } from "@repo/db/client";
import express from "express";
const app=express()
prismaClient.website.create({
    data:{
        url: "https://example.com",
    }
})

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});

