import { Router, Response, NextFunction } from 'express';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { APPROVED_ONLY, dealScopeWhere, isScopedRole } from '../services/access.service';
import {
  HttpError,
  cleanCustomerText,
  dateRangeWhere,
  dealDateTimeLabel,
  parseApprovalFilter,
  tashkentYmd,
} from './deals.routes';

const router = Router();

/** Agentlar bo'limi OPERATOR uchun yopiq (u faqat o'z bitimlarini "Bitimlar" sahifasida ko'radi) */
function denyOperator(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role === Role.OPERATOR) {
    return res.status(403).json({ error: "Agentlar bo'limini ko'rish uchun huquqingiz yetarli emas" });
  }
  next();
}

/** AGENT rolidagi foydalanuvchining o'z agentligi (User.agencyId) */
async function ownAgencyId(userId: string): Promise<string | null> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { agencyId: true } });
  return me?.agencyId || null;
}

function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error(fallback + ':', error);
  return res.status(500).json({ error: fallback });
}

const num = (v: unknown) => Number(v) || 0;

// GET /api/agents/deals (Sheet: Агент & Agent CRM)
// Doira: AGENT — faqat o'z agentligi va jamoasi; OPERATOR — 403. Yig'malar — faqat tasdiqlangan bitimlar.
router.get('/deals', authenticateToken, denyOperator, async (req: AuthRequest, res: Response) => {
  try {
    const { agencyId, agentId, startDate, endDate, search, status, page = '1', limit = '50' } = req.query as any;
    const user = req.user!;
    const isAgent = user.role === Role.AGENT;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(5000, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [scope, myAgencyId] = await Promise.all([
      dealScopeWhere(user),
      isAgent ? ownAgencyId(user.id) : Promise.resolve(null),
    ]);

    const base: Prisma.DealWhereInput[] = [scope];
    if (agencyId) base.push({ agencyId: String(agencyId) });
    if (agentId) base.push({ agentId: String(agentId) });
    // Agentlik/agent tanlanmagan bo'lsa — faqat agentga bog'langan bitimlar (AGENT uchun butun doirasi)
    if (!agencyId && !agentId && !isAgent) {
      base.push({ OR: [{ agencyId: { not: null } }, { agentId: { not: null } }] });
    }
    if (status) base.push({ status });
    const range = dateRangeWhere(startDate, endDate);
    if (range) base.push({ date: range });

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const or: Prisma.DealWhereInput[] = [
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone1: { contains: s, mode: 'insensitive' } },
        { customerPhone2: { contains: s, mode: 'insensitive' } },
        { productName: { contains: s, mode: 'insensitive' } },
        { agent: { name: { contains: s, mode: 'insensitive' } } },
        { agency: { name: { contains: s, mode: 'insensitive' } } },
      ];
      if (/^\d{1,9}$/.test(s)) or.push({ dealNumber: Number(s) });
      base.push({ OR: or });
    }

    // Ro'yxat: sukut bo'yicha faqat tasdiqlangan (approvalStatus=all | PENDING_APPROVAL | REJECTED bilan o'zgartiriladi)
    const approvalFilter = parseApprovalFilter((req.query as any).approvalStatus, APPROVED_ONLY);
    const listWhere: Prisma.DealWhereInput = { AND: approvalFilter ? [...base, approvalFilter] : base };
    // Yig'ma hisoblar: har doim faqat tasdiqlangan bitimlar
    const totalsWhere: Prisma.DealWhereInput = { AND: [...base, APPROVED_ONLY] };
    const countScope: Prisma.DealWhereInput = { AND: [scope, APPROVED_ONLY] };

    const [totalCount, deals, allMatching, agentsList, agenciesList, agentCounts, agencyCounts, selectedAgent] =
      await Promise.all([
        prisma.deal.count({ where: listWhere }),
        prisma.deal.findMany({
          where: listWhere,
          include: { agency: true, agent: true, store: true, provider: true },
          orderBy: { date: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.deal.findMany({
          where: totalsWhere,
          select: {
            withdrawnLimit: true,
            calculatedAmount: true,
            agentAmount: true,
            profit: true,
            agentPct: true,
            purchaseDiscountPct: true,
            status: true,
          },
        }),
        prisma.agent.findMany({
          where: isAgent ? { agencyId: myAgencyId || '__none__' } : undefined,
          include: { agency: true },
          orderBy: { name: 'asc' },
        }),
        prisma.agency.findMany({
          where: isAgent ? { id: myAgencyId || '__none__' } : undefined,
          orderBy: { name: 'asc' },
        }),
        prisma.deal.groupBy({ by: ['agentId'], where: countScope, _count: { _all: true } }),
        prisma.deal.groupBy({ by: ['agencyId'], where: countScope, _count: { _all: true } }),
        agentId
          ? prisma.agent.findFirst({
              where: { id: String(agentId), ...(isAgent ? { agencyId: myAgencyId || '__none__' } : {}) },
              include: { agency: true },
            })
          : null,
      ]);

    const agentCountMap = new Map(agentCounts.map((g) => [g.agentId, g._count._all]));
    const agencyCountMap = new Map(agencyCounts.map((g) => [g.agencyId, g._count._all]));

    const formatted = deals.map((d, idx) => ({
      index: skip + idx + 1,
      id: d.id,
      dealNumber: d.dealNumber,
      date: d.date,
      dateTimeLabel: dealDateTimeLabel(d),
      approvalStatus: d.approvalStatus,
      agencyId: d.agencyId,
      agentId: d.agentId,
      agencyName: d.agency?.name || '-',
      agentName: d.agent?.name || '-',
      // Mijoz ismi/telefoni to'ldirgichsiz ("Mijoz", "-" emas) — yo'q bo'lsa bo'sh satr
      customerName: cleanCustomerText(d.customerName) || '',
      customerPhone1: cleanCustomerText(d.customerPhone1) || '',
      customerPhone2: cleanCustomerText(d.customerPhone2) || '',
      storeName: d.store?.name || '',
      providerName: d.provider?.name || '',
      productName: d.productName || '-',
      status: d.status,
      withdrawnLimit: num(d.withdrawnLimit),
      calculatedAmount: num(d.calculatedAmount),
      purchaseDiscountPct: num(d.purchaseDiscountPct),
      // Agent foydasi = Yechilgan limit × (Xarid diskonti − Agent foizi)
      agentAmount: num(d.agentAmount),
      agentPct: num(d.agentPct),
      profit: num(d.profit),
      marginPct: num(d.marginPct),
    }));

    let totalWithdrawn = 0;
    let totalCalculated = 0;
    let totalAgentCommission = 0;
    let totalProfit = 0;
    let sumAgentPct = 0;
    let sumDiscountPct = 0;

    const byStatus: Record<string, { count: number; volume: number }> = {
      PENDING: { count: 0, volume: 0 },
      IN_WAREHOUSE: { count: 0, volume: 0 },
      SOLD: { count: 0, volume: 0 },
      NEED_TO_BUY: { count: 0, volume: 0 },
    };

    allMatching.forEach((d) => {
      const w = num(d.withdrawnLimit);
      totalWithdrawn += w;
      totalCalculated += num(d.calculatedAmount);
      totalAgentCommission += num(d.agentAmount);
      totalProfit += num(d.profit);
      sumAgentPct += num(d.agentPct);
      sumDiscountPct += num(d.purchaseDiscountPct);

      if (d.status && byStatus[d.status]) {
        byStatus[d.status].count++;
        byStatus[d.status].volume += w;
      }
    });

    const matchCount = allMatching.length;
    const totals = {
      dealCount: matchCount,
      totalWithdrawn,
      totalCalculated,
      totalAgentCommission,
      totalProfit,
      avgAgentPct: matchCount > 0 ? Number((sumAgentPct / matchCount).toFixed(2)) : 0,
      avgDiscountPct: matchCount > 0 ? Number((sumDiscountPct / matchCount).toFixed(2)) : 0,
      byStatus,
    };

    return res.json({
      items: formatted,
      totals,
      selectedAgent,
      agentsList: agentsList.map((ag) => ({
        id: ag.id,
        name: ag.name,
        agencyId: ag.agencyId,
        agencyName: ag.agency?.name || '',
        dealCount: agentCountMap.get(ag.id) || 0,
      })),
      agenciesList: agenciesList.map((agc) => ({
        id: agc.id,
        name: agc.name,
        dealCount: agencyCountMap.get(agc.id) || 0,
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    return sendError(res, error, 'Agent bitimlarini yuklashda xatolik');
  }
});

// GET /api/agents/commission-summary
// Agent foydasi (Deal.agentAmount = Yechilgan limit × (Xarid diskonti − Agent foizi)) — har agentlik bo'yicha
// bugun / shu oy / jami. Kun va oy Asia/Tashkent bo'yicha; faqat tasdiqlangan bitimlar.
// AGENT — faqat o'z agentligi (o'zi va jamoasi bitimlari bilan); OPERATOR — 403.
router.get('/commission-summary', authenticateToken, denyOperator, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const isAgent = user.role === Role.AGENT;
    const todayStr = tashkentYmd(new Date());
    const monthStr = todayStr.slice(0, 7);
    const todayRange = dateRangeWhere(todayStr, todayStr)!;
    // Joriy Toshkent oyi: oyning 1-kuni 00:00 dan keyingi oyning 1-kuni 00:00 gacha (UTC+5)
    const [year, month] = monthStr.split('-').map(Number);
    const monthRange = {
      gte: new Date(`${monthStr}-01T00:00:00.000+05:00`),
      lt: new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000),
    };

    const scope = await dealScopeWhere(user);
    const base: Prisma.DealWhereInput[] = [scope, APPROVED_ONLY];

    type Row = {
      agencyId: string | null;
      agencyName: string;
      today: number;
      month: number;
      total: number;
      dealsToday: number;
      dealsMonth: number;
      dealsTotal: number;
    };
    const emptyRow = (agencyId: string | null, agencyName: string): Row => ({
      agencyId,
      agencyName,
      today: 0,
      month: 0,
      total: 0,
      dealsToday: 0,
      dealsMonth: 0,
      dealsTotal: 0,
    });

    let rows: Row[];

    if (isAgent) {
      // Agent: bitta qator — o'z agentligi; unga doirasidagi (o'zi + jamoasi + agentligi) barcha bitimlar kiradi
      const me = await prisma.user.findUnique({
        where: { id: user.id },
        select: { agencyId: true, fullName: true, agency: { select: { name: true } } },
      });
      const agg = (extra?: Prisma.DealWhereInput) =>
        prisma.deal.aggregate({
          where: { AND: extra ? [...base, extra] : base },
          _sum: { agentAmount: true },
          _count: { _all: true },
        });
      const [t, m, all] = await Promise.all([agg({ date: todayRange }), agg({ date: monthRange }), agg()]);
      rows = [
        {
          agencyId: me?.agencyId || null,
          agencyName: me?.agency?.name || me?.fullName || user.fullName,
          today: num(t._sum.agentAmount),
          month: num(m._sum.agentAmount),
          total: num(all._sum.agentAmount),
          dealsToday: t._count._all,
          dealsMonth: m._count._all,
          dealsTotal: all._count._all,
        },
      ];
    } else {
      const withAgency: Prisma.DealWhereInput = { agencyId: { not: null } };
      const group = (extra?: Prisma.DealWhereInput) =>
        prisma.deal.groupBy({
          by: ['agencyId'],
          where: { AND: extra ? [...base, withAgency, extra] : [...base, withAgency] },
          _sum: { agentAmount: true },
          _count: { _all: true },
        });
      const [agencies, t, m, all] = await Promise.all([
        prisma.agency.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        group({ date: todayRange }),
        group({ date: monthRange }),
        group(),
      ]);
      const map = new Map<string, Row>(agencies.map((a) => [a.id, emptyRow(a.id, a.name)]));
      for (const g of all) {
        const r = map.get(g.agencyId!);
        if (r) {
          r.total = num(g._sum.agentAmount);
          r.dealsTotal = g._count._all;
        }
      }
      for (const g of m) {
        const r = map.get(g.agencyId!);
        if (r) {
          r.month = num(g._sum.agentAmount);
          r.dealsMonth = g._count._all;
        }
      }
      for (const g of t) {
        const r = map.get(g.agencyId!);
        if (r) {
          r.today = num(g._sum.agentAmount);
          r.dealsToday = g._count._all;
        }
      }
      rows = Array.from(map.values()).sort((a, b) => b.total - a.total || a.agencyName.localeCompare(b.agencyName));
    }

    const totals = rows.reduce(
      (acc, r) => {
        acc.today += r.today;
        acc.month += r.month;
        acc.total += r.total;
        acc.dealsToday += r.dealsToday;
        acc.dealsMonth += r.dealsMonth;
        acc.dealsTotal += r.dealsTotal;
        return acc;
      },
      { today: 0, month: 0, total: 0, dealsToday: 0, dealsMonth: 0, dealsTotal: 0 }
    );

    return res.json({
      formula: 'Yechilgan limit × (Xarid diskonti − Agent foizi)',
      todayStr,
      monthStr,
      agencies: rows,
      totals,
    });
  } catch (error: any) {
    return sendError(res, error, 'Agent foydasi yig\'masini yuklashda xatolik');
  }
});

// GET /api/agents/swot (Sheet: SWOT_Агентства) — doira + faqat tasdiqlangan bitimlar
router.get('/swot', authenticateToken, denyOperator, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const isAgent = user.role === Role.AGENT;
    const [scope, myAgencyId] = await Promise.all([
      dealScopeWhere(user),
      isAgent ? ownAgencyId(user.id) : Promise.resolve(null),
    ]);

    const [agencies, grouped] = await Promise.all([
      prisma.agency.findMany({ where: isAgent ? { id: myAgencyId || '__none__' } : undefined }),
      prisma.deal.groupBy({
        by: ['agencyId'],
        where: { AND: [scope, APPROVED_ONLY, { agencyId: { not: null } }] },
        _sum: { withdrawnLimit: true, calculatedAmount: true, agentAmount: true },
        _count: { _all: true },
      }),
    ]);
    const byAgency = new Map(grouped.map((g) => [g.agencyId, g]));

    let totalAllTurnover = 0;
    const agencyStats = agencies.map((agency) => {
      const g = byAgency.get(agency.id);
      const dealCount = g?._count._all || 0;
      const totalLimit = num(g?._sum.withdrawnLimit);
      const calculatedSum = num(g?._sum.calculatedAmount);
      const companyRevenue = totalLimit - calculatedSum;
      const agencyPayout = num(g?._sum.agentAmount);
      const netProfit = companyRevenue - agencyPayout;
      const commissionSharePct = totalLimit > 0 ? agencyPayout / totalLimit : 0;

      totalAllTurnover += totalLimit;

      return {
        id: agency.id,
        agencyName: agency.name,
        dealCount,
        totalLimit,
        calculatedSum,
        companyRevenue,
        agencyPayout,
        netProfit,
        commissionSharePct,
      };
    });

    const swotTexts = await prisma.swotAgencyAnalysis.findMany();
    const swotMap = new Map(swotTexts.map((s) => [s.agencyName, s]));

    const result = agencyStats.map((stat) => ({
      ...stat,
      turnoverSharePct: totalAllTurnover > 0 ? stat.totalLimit / totalAllTurnover : 0,
      swot: swotMap.get(stat.agencyName) || {},
    }));

    const totals = {
      dealCount: result.reduce((s, a) => s + a.dealCount, 0),
      totalLimit: result.reduce((s, a) => s + a.totalLimit, 0),
      calculatedSum: result.reduce((s, a) => s + a.calculatedSum, 0),
      companyRevenue: result.reduce((s, a) => s + a.companyRevenue, 0),
      agencyPayout: result.reduce((s, a) => s + a.agencyPayout, 0),
      netProfit: result.reduce((s, a) => s + a.netProfit, 0),
    };

    return res.json({ agencies: result, totals });
  } catch (error: any) {
    return sendError(res, error, 'Agentliklar SWOT tahlilini yuklashda xatolik');
  }
});

// POST /api/agents/swot/:agencyName (SWOT matnlarini yangilash) — OPERATOR/AGENT uchun yopiq
router.post('/swot/:agencyName', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (isScopedRole(req.user!.role)) {
      return res.status(403).json({ error: 'Ushbu amalni bajarish uchun huquqingiz yetarli emas' });
    }
    const { agencyName } = req.params;
    const { strengths, weaknesses, opportunities, threats } = req.body;

    const updated = await prisma.swotAgencyAnalysis.upsert({
      where: { agencyName },
      update: { strengths, weaknesses, opportunities, threats },
      create: { agencyName, strengths, weaknesses, opportunities, threats },
    });

    return res.json(updated);
  } catch (error: any) {
    return sendError(res, error, 'SWOT matnini saqlashda xatolik');
  }
});

export default router;
