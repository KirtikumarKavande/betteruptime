import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization!;
    console.log("header", header);
    try {
        let data = jwt.verify(header, "dummySecrete123eb3ejk");
        req.userId = data.sub as string;
        next();
    } catch(e) {
        console.log(e);
        res.status(403).send("");
    }
}