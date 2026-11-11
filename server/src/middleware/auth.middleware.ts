import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { getJwtSecret } from '../lib/security';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: Role;
    fullName: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Also support token in query parameter for direct downloads / exports
  if (!token && req.query?.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi (Token yo\'q)' });
  }

  const secret = getJwtSecret();
  jwt.verify(token, secret, (err: any, decoded: any) => {
    if (err) {
      // 401 — klient avtomatik ravishda qayta kirish sahifasiga yo'naltiradi
      return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
    }
    req.user = decoded;
    next();
  });
};

export const requireRoles = (roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Ushbu amalni bajarish uchun huquqingiz yetarli emas' });
    }
    next();
  };
};
