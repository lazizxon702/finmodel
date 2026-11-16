import { Router, Response, NextFunction } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, invalidateAuthCache } from '../middleware/auth.middleware';
import { dealScopeWhere } from '../services/access.service';
import {
  PeriodStats,
  addDealToStats,
  cleanYmd,
  emptyStats,
  ensureOperatorsForAgent,
  statsForOperators,
  todayTashkentYmd,
} from '../services/team.service';
import { operatorShareRuleFor, tashkentDayRange } from '../services/calculation.service';
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
 *   GET  /api/team/operators          — jamoadagi operatorlar ro'yxati (+ davr statistikasi: ?from=&to=&q=)
 *   GET  /api/team/summary            — jamoa jami (shu filtrlar bilan, bitim bir marta sanaladi)
 *   GET  /api/team/my-summary         — kirgan foydalanuvchi (OPERATOR/AGENT) o'z bitimlari bo'yicha jami
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
  initialPassword: true,
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
    // Agent o'z operatorlariga bergan parolni ko'rib turadi (route faqat O'Z jamoasini qaytaradi)
    visiblePassword: o.initialPassword || null,
  };
}

/** Filtrlar: ?from=YYYY-MM-DD&to=YYYY-MM-DD (Toshkent kunlari), ?q= (ism yoki login bo'yicha qidiruv) */
function parseTeamFilters(req: TeamRequest) {
  const from = cleanYmd(req.query.from);
  const to = cleanYmd(req.query.to);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  return { from, to, q };
}

async function listTeamOperators(teamAgentId: string, q: string) {
  const where: Prisma.UserWhereInput = { parentAgentId: teamAgentId, role: Role.OPERATOR };
  if (q) {
    where.OR = [{ fullName: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }];
  }
  return prisma.user.findMany({
    where,
    select: { ...OPERATOR_SELECT, agentId: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Agent foydalanuvchisining jamoasi uchun operator ulushi qoidasi (faqat Jahongir jamoasi) yoki null */
async function shareRuleForAgentUser(agentUserId?: string | null) {
  if (!agentUserId) return null;
  const agent = await prisma.user.findUnique({ where: { id: agentUserId }, select: { agency: { select: { name: true } } } });
  return operatorShareRuleFor(agent?.agency?.name);
}

/** Spravochnikdagi operatorlar uchun loginlar yetishmasa avtomatik yaratadi (hech narsa yetishmasa — bitta COUNT). Xato ro'yxatni to'xtatmaydi. */
async function ensureOperatorsSafe(agentUserId: string) {
  try {
    await ensureOperatorsForAgent(agentUserId);
  } catch (error: any) {
    console.error('Operator loginlarini avtomatik yaratishda xatolik:', error?.message || error);
  }
}

// GET /api/team/operators — jamoadagi operatorlar + davr statistikasi
//   Javob: [{ id, username, fullName, isActive, createdAt, visiblePassword, agentId,
//             dealsCount, approvedCount, pendingCount, rejectedCount, totalWithdrawnLimit, totalAgentAmount }]
//   Statistika "operatorniki" bitimlar bo'yicha: operator kiritgan YOKI uning Agent yozuviga bog'langan (bir marta sanaladi).
//   Summalar faqat TASDIQLANGAN bitimlardan.
router.get('/operators', authenticateToken, resolveTeamAgent, async (req: TeamRequest, res: Response) => {
  try {
    const { from, to, q } = parseTeamFilters(req);
    await ensureOperatorsSafe(req.teamAgentId!);
    const operators = await listTeamOperators(req.teamAgentId!, q);
    const { perOperator } = await statsForOperators(
      operators.map((o) => ({ id: o.id, agentId: o.agentId ?? null })),
      from,
      to,
      await shareRuleForAgentUser(req.teamAgentId)
    );
    return res.json(
      operators.map((o) => {
        const { dealsCount: _allTime, ...dto } = toOperatorDto(o);
        return { ...dto, agentId: o.agentId ?? null, ...(perOperator.get(o.id) ?? emptyStats()) };
      })
    );
  } catch (error: any) {
    return sendRouteError(res, error, 'Jamoani yuklashda xatolik');
  }
});

// GET /api/team/summary — jamoa jami (shu davr va qidiruv bo'yicha)
//   Javob: { from, to, operatorsCount, activeCount, dealsCount, approvedCount, pendingCount, rejectedCount, totalWithdrawnLimit, totalAgentAmount }
router.get('/summary', authenticateToken, resolveTeamAgent, async (req: TeamRequest, res: Response) => {
  try {
    const { from, to, q } = parseTeamFilters(req);
    const operators = await listTeamOperators(req.teamAgentId!, q);
    const shareRule = await shareRuleForAgentUser(req.teamAgentId);
    const { total } = await statsForOperators(
      operators.map((o) => ({ id: o.id, agentId: o.agentId ?? null })),
      from,
      to,
      shareRule
    );
    return res.json({
      // Operator ulushi qoidasi (faqat Jahongir jamoasida) — klient ustunni shunga qarab ko'rsatadi
      operatorShareRule: shareRule,
      from: from ?? null,
      to: to ?? null,
      operatorsCount: operators.length,
      activeCount: operators.filter((o) => o.isActive).length,
      ...total,
    });
  } catch (error: any) {
    return sendRouteError(res, error, 'Jamoa yig\'masini yuklashda xatolik');
  }
});

// GET /api/team/my-summary — OPERATOR / AGENT o'z bitimlari bo'yicha jami (dealScopeWhere doirasi)
//   ?from=&to= berilmasa: 2026-11-01 dan bugungacha (Toshkent).
//   Javob: { from, to, dealsCount, approvedCount, pendingCount, rejectedCount, totalWithdrawnLimit, totalAgentAmount }
router.get('/my-summary', authenticateToken, async (req: TeamRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== Role.OPERATOR && user.role !== Role.AGENT) {
      return res.status(403).json({ error: 'Bu yig\'ma faqat operator yoki agent uchun' });
    }
    const from = cleanYmd(req.query.from) ?? '2026-11-01';
    const to = cleanYmd(req.query.to) ?? todayTashkentYmd();
    const { start, end } = tashkentDayRange(from, to);

    const scope = await dealScopeWhere(user);
    const rows = await prisma.deal.findMany({
      where: { AND: [scope, { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }] },
      select: { approvalStatus: true, withdrawnLimit: true, agentAmount: true },
    });
    const stats: PeriodStats = emptyStats();
    for (const r of rows) {
      addDealToStats(stats, {
        approvalStatus: r.approvalStatus,
        withdrawnLimit: Number(r.withdrawnLimit),
        agentAmount: Number(r.agentAmount),
      });
    }
    // Operator ulushi (faqat qoida bor jamoa operatori uchun): o'z bitimlari bo'yicha, oylik chegara bilan
    let operatorShareRule = null;
    if (user.role === Role.OPERATOR) {
      const me = await prisma.user.findUnique({ where: { id: user.id }, select: { agentId: true, parentAgentId: true } });
      operatorShareRule = await shareRuleForAgentUser(me?.parentAgentId);
      if (operatorShareRule) {
        const mine = await statsForOperators([{ id: user.id, agentId: me?.agentId ?? null }], from, to, operatorShareRule);
        stats.operatorShare = mine.total.operatorShare;
      }
    }
    return res.json({ from, to, operatorShareRule, ...stats });
  } catch (error: any) {
    return sendRouteError(res, error, 'Yig\'mani yuklashda xatolik');
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
        initialPassword: password, // faqat ADMIN Foydalanuvchilar sahifasida ko'radi
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
      data.initialPassword = password;
      changed.push('password');
    } else if (body.resetPassword === true) {
      generatedPassword = generatePassword();
      data.passwordHash = await hashPassword(generatedPassword);
      data.initialPassword = generatedPassword;
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
