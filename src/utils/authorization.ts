import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./tokens";

const checkAuth = async( req: Request, res: Response, next: NextFunction ) => {
    const { authorization } = req.headers;

    if(!authorization) return res.status(404).send("Unauthorized, kindly login as an admin");

    const isVerified = verifyToken(authorization);

    if(!isVerified.valid) return res.status(401).send("Invalid token, kindly login as an admin")

    if(isVerified.valid) {
        next();
    }
}

export default checkAuth;