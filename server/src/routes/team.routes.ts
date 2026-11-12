import { Router, Response, NextFunction } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, invalidateAuthCache } from '../middleware/auth.middleware';
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
 * Agent jamoasi (operatorlar):
 *   GET  /api/team/operators          — jamoadagi operatorlar ro'yxati
 *   POST /api/team/operators          — yangi operator (parentAgentId = agent)
 *   PUT  /api/team/operators/:id      — ism / bloklash / parolni tiklash (faqat O'Z jamoasidagi operator)
 *
 * AGENT faqat o'z jamoasini boshqaradi. ADMIN `?agentId=<agent user id>` bilan istalgan agent jamoasini boshqaradi.
 * Boshqa rollar — 403.
 */
const router = Router();

interface TeamRequest extends AuthRequest {
  /** Jamoasi boshqarilayotgan agentning foydalanuvchi ID si */
  teamAgentId?: string;
}

/** Kimning jamoasi boshqarilayotganini aniqlaydi va huquqni tekshiradi */
async function resolveTeamAgent(req: TeamRequest, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    if (user.role === Role.AGENT) {
      // Agent uchun ?agentId e'tiborga olinmaydi — u faqat o'z jamoasini ko'radi
      req.teamAgentId = user.id;
      return next();
    }
    if (user.role === Role.ADMIN) {
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : '';
      if (!agentId) {
        return res.status(400).json({ error: 'Administrator uchun ?agentId= (agent foydalanuvchi ID si) ko\'rsatilishi shart' });
      }
      const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { role: true } });
      if (!agent || agent.role !== Role.AGENT) {
        return res.status(404).json({ error: 'Agent topilmadi' });
      }
      req.teamAgentId = agentId;
      return next();
    }
    return res.status(403).json({ error: 'Jamoani faqat agent yoki administrator boshqaradi' });
  } catch (error: any) {
    return sendRouteError(res, error);
  }
}

const OPERATOR_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  createdAt: true,
  _count: { select: { dealsCreated: true } },
} satisfies Prisma.UserSelect;

type OperatorRow = Prisma.UserGetPayload<{ select: typeof OPERATOR_SELECT }>;

function toOperatorDto(o: OperatorRow) {
  return {
    id: o.id,
    username: o.username,
    fullName: o.fullName,
    isActive: o.isActive,
    createdAt: o.createdAt,
    dealsCount: o._count.dealsCreated,
  };
}

// GET /api/team/operators — jamoadagi operatorlar
router.get('/operators', authenticateToken, resolveTeamAgent, async (req: TeamRequest, res: Response) => {
  try {
    const operators = await prisma.user.findMany({
      where: { parentAgentId: req.teamAgentId, role: Role.OPERATOR },
      select: OPERATOR_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return res.json(operators.map(toOperatorDto));
  } catch (error: any) {
    return sendRouteError(res, error, 'Jamoani yuklashda xatolik');
  }
});

// POST /api/team/operators {username, fullName, password?}
//   Parol berilmasa tasodifiy yaratiladi va javobda BIR MARTA `generatedPassword` bo'lib qaytadi.
router.post('/operators', authenticateToken, resolveTeamAgent, async (req: TeamRequest, res: Response) => {
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
      data: {
        username,
        fullName,
        passwordHash: await hashPassword(password),
        role: Role.OPERATOR,
        parentAgentId: req.teamAgentId,
      },
      select: OPERATOR_SELECT,
    });

    await prisma.auditLog
      .create({
        data: {
          userId: req.user!.id,
          entity: 'User',
          entityId: created.id,
          action: 'TEAM_OPERATOR_CREATE',
          newValues: { username, fullName, parentAgentId: req.teamAgentId },
          ipAddress: req.ip || '',
        },
      })
      .catch(() => undefined);

    return res.status(201).json({ ...toOperatorDto(created), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error, 'Operator yaratishda xatolik');
  }
});

// PUT /api/team/operators/:id {fullName?, isActive?, resetPassword?}
//   resetPassword: true → yangi tasodifiy parol (javobda bir marta `generatedPassword`);
//   resetPassword: "<yangi parol>" (yoki password: "...") → shu parol o'rnatiladi (kamida 8 belgi).
//   Boshqa jamoaning operatori → 404 (mavjudligi ham oshkor qilinmaydi).
router.put('/operators/:id', authenticateToken, resolveTeamAgent, async (req: TeamRequest, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const operator = await prisma.user.findFirst({
      where: { id, parentAgentId: req.teamAgentId, role: Role.OPERATOR },
      select: { id: true },
    });
    if (!operator) throw new HttpError(404, 'Operator topilmadi');

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
      data.initialPassword = null;
      changed.push('password');
    } else if (body.resetPassword === true) {
      generatedPassword = generatePassword();
      data.passwordHash = await hashPassword(generatedPassword);
      data.initialPassword = null;
      changed.push('password');
    }

    if (!changed.length) throw new HttpError(400, "O'zgartirish uchun maydon berilmagan (fullName, isActive yoki resetPassword)");

    const updated = await prisma.user.update({ where: { id }, data, select: OPERATOR_SELECT });
    // Bloklash keyingi so'rovdayoq kuchga kirsin
    invalidateAuthCache(id);

    await prisma.auditLog
      .create({
        data: {
          userId: req.user!.id,
          entity: 'User',
          entityId: id,
          action: 'TEAM_OPERATOR_UPDATE',
          newValues: { changed },
          ipAddress: req.ip || '',
        },
      })
      .catch(() => undefined);

    return res.json({ ...toOperatorDto(updated), ...(generatedPassword ? { generatedPassword } : {}) });
  } catch (error: any) {
    return sendRouteError(res, error, 'Operatorni yangilashda xatolik');
  }
});

export default router;
