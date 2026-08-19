import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/tokens";
import { extractToken } from "../utils/extractToken";
import User from "../schema/userSchema";

export interface AdminRequest extends Request {
  user?: any;
}

export async function adminAuthentication(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ message: "Authorization header missing" });
    return;
  }

  const { valid, isVerified } = verifyToken(token);

  if (!valid || !isVerified) {
    res.status(401).json({ message: "Token not valid" });
    return;
  }

  const user = await User.findOne({ email: isVerified.email });

  if (!user) {
    res.status(401).json({ message: "User not found" });
    return;
  }

  if (user.is_deleted) {
    res.status(403).json({ message: "Admin account has been deactivated" });
    return;
  }

  if (!user.is_admin) {
    res.status(403).json({ message: "Admin access required" });
    return;
  }

  req.user = user;
  next();
}
