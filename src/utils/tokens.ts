import { config } from "dotenv";
import { sign, verify } from "jsonwebtoken";

config();

const privateKey = process.env.JWT_SECRET;
export const createToken = (user: any) => {
    const token =  sign({...user}, privateKey as any, { expiresIn: "30d" })

    return token;
}

export const resetToken = (user:any) => {
    const token = sign({...user}, privateKey as any, { expiresIn: 300 })

    return token;
}

export const verifyToken = (token: any): any => {
    try {
        const isVerified = verify(token, privateKey as any);
        return {
            valid: true,
            isVerified,
            error: null
        };
    } catch (error) {
        return {
            valid: false,
            error,
            isVerified: null
        }
    }
}

export const generateOtp = () => {
    const number = Math.round(Math.random() * 1000000)

    return number;
}