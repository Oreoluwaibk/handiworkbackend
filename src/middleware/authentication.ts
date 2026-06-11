import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/tokens';
import { extractToken } from '../utils/extractToken';
import User from '../schema/userSchema';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export async function authentication(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ message: 'Authorization header missing' });
    return;
  }

  const { valid, isVerified } = verifyToken(token);

  if (!valid || !isVerified) {
    res.status(401).json({ message: 'Token not valid' });
    return;
  }

  const user = await User.findOne({ email: isVerified.email });

  if (!user) {
    res.status(401).json({ message: 'User not found' });
    return;
  }

  if (user.is_deleted) {
    res.status(404).json({ message: 'User has been deactivated, kindly activate or contact admin' });
    return;
  }

  req.user = user;
  next();
}
