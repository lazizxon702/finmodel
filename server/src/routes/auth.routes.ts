import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, invalidateAuthCache, requireRoles } from '../middleware/auth.middleware';
import { Prisma, Role } from '@prisma/client';
import { getJwtSecret, verifyAdminOverride } from '../lib/security';

const router = Router();

// ─────────────────────────── Umumiy yordamchilar (team.routes va skriptlar ham ishlatadi) ───────────────────────────

/** Xato + HTTP status (route ichida throw qilinadi, pastda javobga aylantiriladi) */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt faqat birinchi 72 baytni hisobga oladi
export const PASSWORD_MAX_LENGTH = 72;
// O'xshash belgilarsiz (0/O, 1/l/I) — qo'lda ko'chirishda adashmaslik uchun
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Kriptografik tasodifiy parol (crypto.randomBytes, modulo og'ishisiz) */
export function generatePassword(length = 12): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return out;
}

/** Parol talablarga mosmi. Mos bo'lsa null, aks holda xato matni. */
export function passwordError(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo'lishi kerak`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_LENGTH) {
    return `Parol ${PASSWORD_MAX_LENGTH} baytdan uzun bo'lmasligi kerak`;
  }
  return null;
}

/** Login: 3–32 belgi, bo'shliqsiz. Mos bo'lsa tozalangan qiymat, aks holda HttpError(400). */
export function cleanUsername(value: unknown): string {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!/^[^\s]{3,32}$/.test(username)) {
    throw new HttpError(400, "Login 3–32 belgidan iborat bo'lishi va bo'shliqsiz yozilishi kerak");
  }
  return username;
}

export function cleanFullName(value: unknown): string {
  const fullName = typeof value === 'string' ? value.trim() : '';
  if (!fullName || fullName.length > 120) {
    throw new HttpError(400, "Ism-familiya kiritilishi shart (120 belgigacha)");
  }
  return fullName;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Xatoni HTTP javobga aylantiradi (HttpError, Prisma noyoblik/bog'liqlik xatolari, qolgani 500) */
export function sendRouteError(res: Response, error: any, fallback = 'Server xatoligi') {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = String((error.meta as any)?.target || '');
      const what = target.includes('telegramId') ? 'Telegram ID' : target.includes('username') ? 'login' : 'qiymat';
      return res.status(409).json({ error: `Bunday ${what} boshqa foydalanuvchida allaqachon mavjud` });
    }
    if (error.code === 'P2003') {
      return res
        .status(409)
        .json({ error: "Foydalanuvchiga bog'liq yozuvlar (bitimlar, tranzaksiyalar, jamoa) bor — o'chirish o'rniga bloklang" });
    }
    if (error.code === 'P2025') return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
  }
  console.error(fallback + ':', error?.message || error);
  return res.status(500).json({ error: fallback });
}

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  telegramId: true,
  isActive: true,
  createdAt: true,
  agencyId: true,
  parentAgentId: true,
  agency: { select: { name: true } },
  parentAgent: { select: { fullName: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

/** Javobga chiqadigan foydalanuvchi ko'rinishi — parol xeshi ham, ochiq parol ham HECH QACHON kirmaydi */
function toUserDto(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    telegramId: u.telegramId != null ? u.telegramId.toString() : null,
    telegramLinked: u.telegramId != null,
    agencyId: u.agencyId,
    agencyName: u.agency?.name ?? null,
    parentAgentId: u.parentAgentId,
    parentAgentName: u.parentAgent?.fullName ?? null,
  };
}

const ROLE_VALUES = Object.values(Role) as string[];

function parseRole(value: unknown): Role {
  const role = String(value || '').toUpperCase();
  if (!ROLE_VALUES.includes(role)) throw new HttpError(400, "Rol noto'g'ri");
  return role as Role;
}

/** Bo'sh satr / null → null (bog'lanishni olib tashlash), satr → tozalangan ID */
function optionalId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function parseTelegramId(value: unknown): bigint | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const s = String(value).trim();
  if (!/^-?\d{1,19}$/.test(s)) throw new HttpError(400, "Telegram ID faqat raqamlardan iborat bo'lishi kerak");
  return BigInt(s);
}

/**
 * Rolga bog'liq maydonlar: AGENT → agencyId (agentlik), OPERATOR → parentAgentId (agent jamoasi).
 * Boshqa rolda bu maydonlar bo'sh bo'ladi; noto'g'ri rol uchun yuborilsa 400.
 */
async function resolveRoleLinks(
  role: Role,
  agencyId: string | null,
  parentAgentId: string | null,
  selfId?: string
): Promise<{ agencyId: string | null; parentAgentId: string | null }> {
  if (agencyId && role !== Role.AGENT) {
    throw new HttpError(400, 'agencyId faqat AGENT roli uchun beriladi');
  }
  if (parentAgentId && role !== Role.OPERATOR) {
    throw new HttpError(400, 'parentAgentId faqat OPERATOR roli uchun beriladi');
  }
  if (agencyId) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true } });
    if (!agency) throw new HttpError(400, 'Agentlik topilmadi (agencyId noto\'g\'ri)');
  }
  if (parentAgentId) {
    if (selfId && parentAgentId === selfId) throw new HttpError(400, "Foydalanuvchi o'zining agenti bo'la olmaydi");
    const agent = await prisma.user.findUnique({ where: { id: parentAgentId }, select: { role: true } });
    if (!agent || agent.role !== Role.AGENT) {
      throw new HttpError(400, 'Agent topilmadi (parentAgentId AGENT rolidagi foydalanuvchi bo\'lishi kerak)');
    }
  }
  return { agencyId, parentAgentId };
}

// ─────────────────────────── Kirish va profil ───────────────────────────

// Login
router.post('/login', async (req, res: Response) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password || typeof username !== 'string') {
      return res.status(400).json({ error: 'Foydalanuvchi nomi va parol kiritilishi shart' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { ...USER_SELECT, passwordHash: true },
    });

    // Bir xil xabar: login mavjudligini tashqaridan aniqlab bo'lmasin
    if (!user || !user.isActive || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri (yoki foydalanuvchi bloklangan)' });
    }

    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      secret,
      { expiresIn: '30d' }
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip || '',
      },
    });

    const { passwordHash: _hash, ...safe } = user;
    return res.json({ token, user: toUserDto(safe) });
  } catch (error: any) {
    console.error('Login error:', error?.message || error);
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// Current User Profile
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: USER_SELECT });
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }
    return res.json(toUserDto(user));
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// Verify administrator override code (debt block, bulk delete, etc.)
router.post('/verify-override', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ok = await verifyAdminOverride(req.body?.code);
    if (!ok) return res.status(403).json({ valid: false, error: 'Administrator kodi noto\'g\'ri' });
    return res.json({ valid: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// ─────────────────────────── Foydalanuvchilar (faqat ADMIN) ───────────────────────────

// List Users (Admin only)
router.get('/users', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    // visiblePassword — FAQAT shu (ADMIN uchun) ro'yxatda qaytadi; /me, login va jamoa javoblarida yo'q
    const users = await prisma.user.findMany({
      select: { ...USER_SELECT, initialPassword: true },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(users.map(({ initialPassword, ...u }) => ({ ...toUserDto(u as any), visiblePassword: initialPassword || null })));
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

// Create User (Admin only)
//   AGENT → agencyId (ixtiyoriy, tekshiriladi);  OPERATOR → parentAgentId (ixtiyoriy, tekshiriladi)
//   password berilmasa tasodifiy yaratiladi va javobda BIR MARTA `generatedPassword` bo'lib qaytadi
router.post('/users', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const username = cleanUsername(body.username);
    const fullName = cleanFullName(body.fullName);
    const role = body.role ? parseRole(body.role) : Role.OPERATOR;
    const telegramId = parseTelegramId(body.telegramId);

    let password: string;
    let generatedPassword: string | undefined;
    if (typeof body.password === 'string' && body.password.trim()) {
      password = body.password.trim();
      const err = passwordError(password);
      if (err) throw new HttpError(400, err);
    } else {
      password = generatedPassword = generatePassword();
    }

    const existing = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existing) throw new HttpError(409, 'Bunday loginli foydalanuvchi allaqachon mavjud');

    const links = await resolveRoleLinks(role, optionalId(body.agencyId), optionalId(body.parentAgentId));

    const created = await prisma.user.create({
      data: {
        username,
        fullName,
        passwordHash: await hashPassword(password),
        // Egasi talabi: ADMIN parollarni Foydalanuvchilar sahifasida ko'rib turadi (faqat GET /users da qaytadi)
        initialPassword: password,
        role,
        telegramId,
        agencyId: links.agencyId,
        parentAgentId: links.parentAgentId,
      },
      select: USER_SELECT,
    });

    return res.status(201).json({ ...toUserDto(created), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

// Update User (Admin only)
//   {fullName?, role?, isActive?, telegramId?, agencyId?, parentAgentId?, password?, resetPassword?: true}
router.put('/users/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, agencyId: true, parentAgentId: true },
    });
    if (!existing) throw new HttpError(404, 'Foydalanuvchi topilmadi');

    const data: Prisma.UserUncheckedUpdateInput = {};

    if (body.fullName !== undefined && body.fullName !== null && String(body.fullName).trim()) {
      data.fullName = cleanFullName(body.fullName);
    }

    const role = body.role ? parseRole(body.role) : existing.role;
    if (role !== existing.role) data.role = role;

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new HttpError(400, "isActive true yoki false bo'lishi kerak");
      data.isActive = body.isActive;
    }

    // O'zini bloklash yoki o'z rolini o'zgartirish — tizimda administratorsiz qolish xavfi
    if (id === req.user!.id && (body.isActive === false || role !== existing.role)) {
      throw new HttpError(400, "O'zingizni bloklay olmaysiz va o'z rolingizni o'zgartira olmaysiz");
    }

    if (body.telegramId !== undefined) data.telegramId = parseTelegramId(body.telegramId);

    // Rolga bog'liq maydonlar. Rol o'zgarsa, mos kelmaydigan bog'lanish avtomatik tozalanadi.
    let agencyId = 'agencyId' in body ? optionalId(body.agencyId) : existing.agencyId;
    let parentAgentId = 'parentAgentId' in body ? optionalId(body.parentAgentId) : existing.parentAgentId;
    if (role !== Role.AGENT && !('agencyId' in body)) agencyId = null;
    if (role !== Role.OPERATOR && !('parentAgentId' in body)) parentAgentId = null;
    const links = await resolveRoleLinks(role, agencyId, parentAgentId, id);
    if (links.agencyId !== existing.agencyId) data.agencyId = links.agencyId;
    if (links.parentAgentId !== existing.parentAgentId) data.parentAgentId = links.parentAgentId;

    if (existing.role === Role.AGENT && role !== Role.AGENT) {
      const teamSize = await prisma.user.count({ where: { parentAgentId: id } });
      if (teamSize > 0) {
        throw new HttpError(
          409,
          `Bu agent jamoasida ${teamSize} ta operator bor — avval ularni boshqa agentga o'tkazing yoki jamoadan chiqaring`
        );
      }
    }

    let generatedPassword: string | undefined;
    if (body.resetPassword === true) {
      generatedPassword = generatePassword();
      data.passwordHash = await hashPassword(generatedPassword);
      data.initialPassword = generatedPassword;
    } else if (typeof body.password === 'string' && body.password.trim()) {
      const password = body.password.trim();
      const err = passwordError(password);
      if (err) throw new HttpError(400, err);
      data.passwordHash = await hashPassword(password);
      data.initialPassword = password;
    }

    const updated = await prisma.user.update({ where: { id }, data, select: USER_SELECT });
    // Bloklash / rol o'zgarishi keyingi so'rovdayoq kuchga kirsin
    invalidateAuthCache(id);

    return res.json({ ...toUserDto(updated), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
});

// Delete User (Admin only)
router.delete('/users/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'O\'zingizning profilingizni o\'chira olmaysiz!' });
    }

    await prisma.user.delete({ where: { id } });
    invalidateAuthCache(id);
    return res.json({ success: true, message: 'Foydalanuvchi muvaffaqiyatli o\'chirildi' });
  } catch (error: any) {
    return sendRouteError(res, error, "O'chirishda xatolik");
  }
});

export default router;
