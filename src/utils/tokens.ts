import { config } from "dotenv";
import { sign, verify } from "jsonwebtoken";

config();

const privateKey = process.env.JWT_SECRET;

export type SafeTokenUser = {
  _id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
};

export const createToken = (user: SafeTokenUser) => {
  if (!privateKey) {
    throw new Error("JWT_SECRET is not configured");
  }

  const payload: SafeTokenUser = {
    _id: user._id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone_number: user.phone_number,
  };

  return sign(payload, privateKey, { expiresIn: "30d" });
};

export const resetToken = (user: Pick<SafeTokenUser, "email" | "first_name">) => {
  if (!privateKey) {
    throw new Error("JWT_SECRET is not configured");
  }

  return sign(
    { email: user.email, first_name: user.first_name },
    privateKey,
    { expiresIn: 300 }
  );
};

export const verifyToken = (token: string | null | undefined): any => {
  if (!privateKey) {
    return { valid: false, error: new Error("JWT_SECRET is not configured"), isVerified: null };
  }

  if (!token) {
    return { valid: false, error: new Error("Token missing"), isVerified: null };
  }

  try {
    const isVerified = verify(token, privateKey);
    return {
      valid: true,
      isVerified,
      error: null,
    };
  } catch (error) {
    return {
      valid: false,
      error,
      isVerified: null,
    };
  }
};

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000);
};
