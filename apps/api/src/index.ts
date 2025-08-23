import {prismaClient}  from "@repo/db/client";
import express from "express";

// require("dotenv").config();
import jwt from "jsonwebtoken";
const app = express();
import { AuthInput } from "./types";
import { authMiddleware } from "./middleware";

app.use(express.json());


app.post("/website", authMiddleware, async (req, res) => {
    
    if (!req.body.url) {
        res.status(411).json({});
        return
    }
    const website = await prismaClient.website.create({
        data: {
            url: req.body.url,
            user_id: req.userId!
        }
    })

    res.json({
        id: website.id
    })
});

app.get("/status/:websiteId", authMiddleware, async (req, res) => {
    const website = await prismaClient.website.findFirst({
        where: {
            user_id: req.userId!,
            id: req.params.websiteId,
        },
        include: {
            ticks: {
                orderBy: [{
                    createdAt: 'desc',
                }],
                take: 1
            }
        }
    })

    if (!website) {
        res.status(409).json({
            message: "Not found"
        })
        return;
    }

    res.json({
        url: website.url,
        id: website.id,
        user_id: website.user_id
    })

})

app.post("/user/signup", async (req, res) => {
    const data = AuthInput.safeParse(req.body);
    if (!data.success) {
        console.log(data.error.toString());
        res.status(403).send("");
        return;
    }

    try {
        let user = await prismaClient.user.create({
            data: {
                username: data.data.username,
                password: data.data.password
            }
    })
        res.json({
            id: user.id
        })
    } catch(e) {
        console.log(e);
        res.status(403).send("");
    }
})

app.post("/user/signin", async (req, res) => {
    console.log(req.body)
    const data = AuthInput.safeParse(req.body);
    console.log("data",data);
    if (!data.success) {
        res.status(403).send("");
        return;
    }

    let user = await prismaClient.user.findFirst({
        where: {
            username: data.data.username
        }
    })

    if (user?.password !== data.data.password) {
        res.status(403).send("");
        return;
    }

    let token = jwt.sign({
        sub: user.id
    }, "dummySecrete123eb3ejk")


    res.json({
        jwt: token
    })
})

app.listen(process.env.PORT || 3001);
