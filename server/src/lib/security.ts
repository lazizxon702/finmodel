import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from './prisma';

const DEFAULT_JWT_SECRET = 'finmodel-secret';
let warnedAboutJwt = false;

/**
 * JWT kaliti. Productionda JWT_SECRET muhit o'zgaruvchisi albatta o'rnatilishi kerak,
 * aks holda har kim standart kalit bilan soxta admin token yasay oladi.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim()) return secret;
  if (!warnedAboutJwt) {
    warnedAboutJwt = true;
    console.error(
      '⚠️  JWT_SECRET o\'rnatilmagan! Standart kalit ishlatilmoqda — bu xavfli. ' +
        'Vercel > Settings > Environment Variables bo\'limida JWT_SECRET ni uzun tasodifiy qiymat bilan qo\'shing.'
    );
  }
  return DEFAULT_JWT_SECRET;
}

/**
 * Administrator tasdiqlash kodini tekshiradi.
 * - Agar ADMIN_OVERRIDE_CODE muhit o'zgaruvchisi bo'lsa — shu kod bilan solishtiriladi.
 * - Aks holda istalgan faol ADMIN foydalanuvchining paroli qabul qilinadi.
 * Kod endi brauzer kodida (JS) saqlanmaydi, shuning uchun uni ko'rib bo'lmaydi.
 */
export async function verifyAdminOverride(code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !code.trim()) return false;
  const value = code.trim();

  const envCode = process.env.ADMIN_OVERRIDE_CODE;
  if (envCode && envCode.trim()) {
    return value === envCode.trim();
  }

  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { passwordHash: true },
  });
  for (const a of admins) {
    if (await bcrypt.compare(value, a.passwordHash)) return true;
  }
  return false;
}

/**
 * Xavfli (ommaviy o'chirish) amallar uchun middleware:
 * so'rov tanasida yoki "x-confirm-code" sarlavhasida administrator kodi bo'lishi shart.
 */
export const requireAdminConfirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = (req.body && (req.body.confirmCode as string)) || (req.headers['x-confirm-code'] as string);
    if (!(await verifyAdminOverride(code))) {
      return res.status(403).json({ error: 'Administrator kodi noto\'g\'ri' });
    }
    next();
  } catch (e: any) {
    return res.status(500).json({ error: 'Tasdiqlashda xatolik: ' + e.message });
  }
};
