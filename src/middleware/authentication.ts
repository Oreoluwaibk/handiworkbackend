import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/tokens';
import User from '../schema/userSchema';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export async function authentication(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { authorization } = req.headers;

  if (!authorization) {
    res.status(401).json({ message: 'Authorization header missing' });
    return;
  }

  const { valid, isVerified } = verifyToken(authorization);

  if (!valid || !isVerified) {
    res.status(401).json({ message: 'Token not valid' });
    return;
  }

  const user = await User.findOne({ email: isVerified.email })
  req.user = user;
  next();
}
