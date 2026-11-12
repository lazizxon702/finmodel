import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { getJwtSecret } from '../lib/security';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: Role;
    fullName: string;
    /** AGENT: qaysi agentlikka tegishli */
    agencyId?: string | null;
    /** OPERATOR: qaysi agent jamoasida */
    parentAgentId?: string | null;
  };
}

type CachedUser = NonNullable<AuthRequest['user']>;

/**
 * Foydalanuvchi holati keshi. Token 30 kun yashaydi, shuning uchun har so'rovda foydalanuvchi
 * bazada hali mavjud va faol (isActive) ekani tekshiriladi; rol ham tokendan emas, bazadan olinadi.
 * Bazaga har so'rovda murojaat qilmaslik uchun natija qisqa muddat xotirada saqlanadi.
 */
export const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_CACHE_MAX = 5000;
const authCache = new Map<string, { expires: number; user: CachedUser | null }>();

/** Foydalanuvchi o'zgarganda (bloklash, rol, o'chirish) keshni darhol tozalash. ID berilmasa — hammasi. */
export function invalidateAuthCache(userId?: string) {
  if (userId) authCache.delete(userId);
  else authCache.clear();
}

async function loadActiveUser(userId: string): Promise<CachedUser | null> {
  const now = Date.now();
  const hit = authCache.get(userId);
  if (hit && hit.expires > now) return hit.user;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, fullName: true, role: true, isActive: true, agencyId: true, parentAgentId: true },
  });
  const user: CachedUser | null =
    row && row.isActive
      ? {
          id: row.id,
          username: row.username,
          fullName: row.fullName,
          role: row.role,
          agencyId: row.agencyId,
          parentAgentId: row.parentAgentId,
        }
      : null;

  if (authCache.size >= AUTH_CACHE_MAX) {
    // Avval muddati o'tganlarni, yetmasa hammasini tozalaymiz (kesh cheksiz o'smasin)
    for (const [key, value] of authCache) if (value.expires <= now) authCache.delete(key);
    if (authCache.size >= AUTH_CACHE_MAX) authCache.clear();
  }
  authCache.set(userId, { expires: now + AUTH_CACHE_TTL_MS, user });
  return user;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // Also support token in query parameter for direct downloads / exports
  if (!token && req.query?.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi (Token yo\'q)' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch {
    // 401 — klient avtomatik ravishda qayta kirish sahifasiga yo'naltiradi
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }

  const userId = decoded && typeof decoded === 'object' ? decoded.id : null;
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati o\'tgan' });
  }

  let user: CachedUser | null;
  try {
    user = await loadActiveUser(userId);
  } catch (e) {
    // Baza vaqtincha ishlamasa 401 emas — aks holda klient foydalanuvchini tizimdan chiqarib yuboradi
    console.error('Auth: foydalanuvchini tekshirishda xatolik:', (e as Error).message);
    return res.status(503).json({ error: 'Server vaqtincha band. Birozdan so\'ng qayta urinib ko\'ring.' });
  }

  if (!user) {
    return res
      .status(401)
      .json({ error: 'Foydalanuvchi bloklangan yoki o\'chirilgan. Administratorga murojaat qiling.', code: 'USER_BLOCKED' });
  }

  // Rol va ism tokendan emas, bazadagi joriy qiymatdan olinadi
  req.user = { ...user };
  next();
};

export const requireRoles = (roles: Role[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Ushbu amalni bajarish uchun huquqingiz yetarli emas' });
    }
    next();
  };
};
