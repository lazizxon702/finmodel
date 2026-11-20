import { Router, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, invalidateAuthCache, requireRoles } from '../middleware/auth.middleware';
import { cleanYmd, ensureRegistraturaRecord } from '../services/team.service';
import {
  HttpError,
  cleanFullName,
  cleanUsername,
  generatePassword,
  hashPassword,
  passwordError,
  sendRouteError,
} from './auth.routes';

/**
 * Registratura jamoasi (egasi, 16.11.2026) — o'zi kelgan mijozlarga chek uradigan xodimlar. FAQAT ADMIN boshqaradi:
 *   GET  /api/registratura/staff?from=&to=&q=   — xodimlar + davr statistikasi + jami
 *   POST /api/registratura/staff                — yangi xodim {fullName, username, password?}
 *   PUT  /api/registratura/staff/:id            — ism / bloklash / parolni tiklash
 * Xodim (REGISTRATURA roli): butun Registratura bitimlarini ko'radi, yangi bitim kiritadi (admin tasdiqlaydi),
 * tahrirlash va o'chirish huquqi yo'q; agent ulushi hisoblanmaydi (kompaniyada qoladi).
 */
const router = Router();
const adminOnly = [authenticateToken, requireRoles([Role.ADMIN])];

const STAFF_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  initialPassword: true,
} satisfies Prisma.UserSelect;

type StaffUser = Prisma.UserGetPayload<{ select: typeof STAFF_SELECT }>;

interface StaffStats {
  dealsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalWithdrawnLimit: number;
}
const emptyStats = (): StaffStats => ({ dealsCount: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0, totalWithdrawnLimit: 0 });

function toStaffDto(u: StaffUser, stats: StaffStats = emptyStats()) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    isActive: u.isActive,
    createdAt: u.createdAt,
    // Parolni faqat ADMIN ko'radi (route ADMIN uchun)
    visiblePassword: u.initialPassword || null,
    ...stats,
  };
}

// GET /api/registratura/staff
router.get('/staff', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const from = cleanYmd(req.query.from);
    const to = cleanYmd(req.query.to);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';

    const where: Prisma.UserWhereInput = { role: Role.REGISTRATURA };
    if (q) where.OR = [{ fullName: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }];
    const users = await prisma.user.findMany({ where, select: STAFF_SELECT, orderBy: { createdAt: 'asc' } });

    const dealWhere: Prisma.DealWhereInput = { createdById: { in: users.map((u) => u.id) } };
    if (from || to) {
      dealWhere.date = {
        ...(from ? { gte: new Date(`${from}T00:00:00+05:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999+05:00`) } : {}),
      };
    }
    const groups = users.length
      ? await prisma.deal.groupBy({
          by: ['createdById', 'approvalStatus'],
          where: dealWhere,
          _count: { _all: true },
          _sum: { withdrawnLimit: true },
        })
      : [];

    const byUser = new Map<string, StaffStats>();
    const summary = { staffCount: users.length, ...emptyStats() };
    for (const g of groups) {
      if (!g.createdById) continue;
      const s = byUser.get(g.createdById) || emptyStats();
      const count = g._count._all;
      const limit = Number(g._sum.withdrawnLimit) || 0;
      for (const target of [s, summary]) {
        target.dealsCount += count;
        if (g.approvalStatus === 'APPROVED') {
          target.approvedCount += count;
          // Yechilgan limit jamiga faqat tasdiqlangan bitimlar kiradi
          target.totalWithdrawnLimit += limit;
        } else if (g.approvalStatus === 'PENDING_APPROVAL') target.pendingCount += count;
        else if (g.approvalStatus === 'REJECTED') target.rejectedCount += count;
      }
      byUser.set(g.createdById, s);
    }

    return res.json({ staff: users.map((u) => toStaffDto(u, byUser.get(u.id))), summary });
  } catch (error: any) {
    return sendRouteError(res, error, 'Registratura xodimlarini yuklashda xatolik');
  }
});

// GET /api/registratura/options — chek formasida registrator tanlash uchun qisqa ro'yxat (parolsiz)
router.get('/options', ...adminOnly, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({ where: { role: Role.REGISTRATURA, isActive: true }, select: { id: true, fullName: true, username: true }, orderBy: { fullName: 'asc' } });
    return res.json(users);
  } catch (error: any) {
    return sendRouteError(res, error, "Registratorlar ro'yxatini yuklashda xatolik");
  }
});

// POST /api/registratura/staff {fullName, username, password?}
//   Parol berilmasa tasodifiy yaratiladi va javobda BIR MARTA `generatedPassword` bo'lib qaytadi.
router.post('/staff', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body || {};
    const username = cleanUsername(body.username);
    const fullName = cleanFullName(body.fullName);

    let password: string;
    let generatedPassword: string | undefined;
    if (typeof body.password === 'string' && body.password.trim()) {
      password = body.password.trim();
      const err = passwordError(password);
      if (err) throw new HttpError(400, err);
    } else {
      password = generatedPassword = generatePassword();
    }

    const taken = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (taken) throw new HttpError(409, 'Bunday login band — boshqa login tanlang');

    const created = await prisma.user.create({
      data: { username, fullName, passwordHash: await hashPassword(password), initialPassword: password, role: Role.REGISTRATURA },
      select: STAFF_SELECT,
    });
    // "Registratura" agentligi va xodimning operator yozuvi (bitimlari shunga yoziladi)
    await ensureRegistraturaRecord(created.id);

    await prisma.auditLog
      .create({
        data: {
          userId: req.user!.id,
          entity: 'User',
          entityId: created.id,
          action: 'REGISTRATURA_STAFF_CREATE',
          newValues: { username, fullName },
          ipAddress: req.ip || '',
        },
      })
      .catch(() => undefined);

    return res.status(201).json({ ...toStaffDto(created), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error, 'Registratura xodimini yaratishda xatolik');
  }
});

// PUT /api/registratura/staff/:id {fullName?, isActive?, resetPassword?: true | "<yangi parol>"}
router.put('/staff/:id', ...adminOnly, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const staff = await prisma.user.findFirst({ where: { id, role: Role.REGISTRATURA }, select: { id: true, agentId: true } });
    if (!staff) throw new HttpError(404, 'Registratura xodimi topilmadi');

    const data: Prisma.UserUncheckedUpdateInput = {};
    const changed: string[] = [];

    if (body.fullName !== undefined) {
      data.fullName = cleanFullName(body.fullName);
      changed.push('fullName');
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new HttpError(400, "isActive true yoki false bo'lishi kerak");
      data.isActive = body.isActive;
      changed.push(body.isActive ? 'unblock' : 'block');
    }

    let generatedPassword: string | undefined;
    const explicitPassword =
      typeof body.resetPassword === 'string' ? body.resetPassword : typeof body.password === 'string' ? body.password : '';
    if (explicitPassword.trim()) {
      const password = explicitPassword.trim();
      const err = passwordError(password);
      if (err) throw new HttpError(400, err);
      data.passwordHash = await hashPassword(password);
      data.initialPassword = password;
      changed.push('password');
    } else if (body.resetPassword === true) {
      generatedPassword = generatePassword();
      data.passwordHash = await hashPassword(generatedPassword);
      data.initialPassword = generatedPassword;
      changed.push('password');
    }

    if (!changed.length) throw new HttpError(400, "O'zgartirish uchun maydon berilmagan (fullName, isActive yoki resetPassword)");

    const updated = await prisma.user.update({ where: { id }, data, select: STAFF_SELECT });
    // Ism o'zgarsa spravochnikdagi operator yozuvi ham shu nomga keltiriladi (bitimlarda ko'rinadigan ism)
    if (typeof data.fullName === 'string' && staff.agentId) {
      await prisma.agent.update({ where: { id: staff.agentId }, data: { name: data.fullName } }).catch(() => undefined);
    }
    // Bloklash keyingi so'rovdayoq kuchga kirsin
    invalidateAuthCache(id);

    await prisma.auditLog
      .create({
        data: {
          userId: req.user!.id,
          entity: 'User',
          entityId: id,
          action: 'REGISTRATURA_STAFF_UPDATE',
          newValues: { changed },
          ipAddress: req.ip || '',
        },
      })
      .catch(() => undefined);

    return res.json({ ...toStaffDto(updated), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error, 'Registratura xodimini yangilashda xatolik');
  }
});

export default router;
