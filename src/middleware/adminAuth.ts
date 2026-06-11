import { Request, Response, NextFunction } from "express";

/** Require ADMIN_API_KEY in body.confirm_key or header x-admin-key. */
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key =
    req.body?.confirm_key ||
    req.headers["x-admin-key"];

  const adminKey = process.env.ADMIN_API_KEY || process.env.ADMIN_RESET_KEY;

  if (!adminKey || key !== adminKey) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  next();
}
