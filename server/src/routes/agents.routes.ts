import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// GET /api/agents/deals (Sheet: Агент & Agent CRM)
router.get('/deals', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      agencyId,
      agentId,
      startDate,
      endDate,
      search,
      status,
      page = '1',
      limit = '50',
    } = req.query as any;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (agencyId) {
      where.agencyId = agencyId;
    }
    if (agentId) {
      where.agentId = agentId;
    }
    if (!agencyId && !agentId) {
      where.OR = [{ agencyId: { not: null } }, { agentId: { not: null } }];
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        const startIso = String(startDate).length === 10 ? `${startDate}T00:00:00.000+05:00` : startDate;
        where.date.gte = new Date(startIso);
      }
      if (endDate) {
        const endIso = String(endDate).length === 10 ? `${endDate}T23:59:59.999+05:00` : endDate;
        where.date.lte = new Date(endIso);
      }
    }

    if (search && String(search).trim()) {
      const s = String(search).trim();
      const isNum = !isNaN(Number(s));
      const searchConditions: any[] = [
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone1: { contains: s, mode: 'insensitive' } },
        { productName: { contains: s, mode: 'insensitive' } },
        { agent: { name: { contains: s, mode: 'insensitive' } } },
        { agency: { name: { contains: s, mode: 'insensitive' } } },
      ];
      if (isNum) searchConditions.push({ dealNumber: Number(s) });

      if (where.OR) {
        where.AND = [{ OR: searchConditions }];
      } else {
        where.OR = searchConditions;
      }
    }

    const [totalCount, deals, allMatching, agentsList, agenciesList, selectedAgent] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        include: { agency: true, agent: true, store: true, provider: true },
        orderBy: { date: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.deal.findMany({
        where,
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
        include: { agency: true, _count: { select: { deals: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.agency.findMany({
        include: { _count: { select: { deals: true } } },
        orderBy: { name: 'asc' },
      }),
      agentId
        ? prisma.agent.findUnique({
            where: { id: agentId },
            include: { agency: true },
          })
        : null,
    ]);

    const formatted = deals.map((d, idx) => ({
      index: skip + idx + 1,
      id: d.id,
      dealNumber: d.dealNumber,
      date: d.date,
      agencyName: d.agency?.name || '-',
      agentName: d.agent?.name || '-',
      customerName: d.customerName || 'Mijoz',
      customerPhone1: d.customerPhone1 || '-',
      productName: d.productName || '-',
      status: d.status,
      withdrawnLimit: Number(d.withdrawnLimit) || 0,
      calculatedAmount: Number(d.calculatedAmount) || 0,
      purchaseDiscountPct: Number(d.purchaseDiscountPct) || 0,
      agentAmount: Number(d.agentAmount) || 0,
      agentPct: Number(d.agentPct) || 0,
      profit: Number(d.profit) || 0,
      marginPct: Number(d.marginPct) || 0,
    }));

    // Calculate CRM aggregations
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
      const w = Number(d.withdrawnLimit) || 0;
      const c = Number(d.calculatedAmount) || 0;
      const a = Number(d.agentAmount) || 0;
      const p = Number(d.profit) || 0;

      totalWithdrawn += w;
      totalCalculated += c;
      totalAgentCommission += a;
      totalProfit += p;
      sumAgentPct += Number(d.agentPct) || 0;
      sumDiscountPct += Number(d.purchaseDiscountPct) || 0;

      if (d.status && byStatus[d.status]) {
        byStatus[d.status].count++;
        byStatus[d.status].volume += w;
      }
    });

    const matchCount = allMatching.length;
    const avgAgentPct = matchCount > 0 ? Number((sumAgentPct / matchCount).toFixed(2)) : 0;
    const avgDiscountPct = matchCount > 0 ? Number((sumDiscountPct / matchCount).toFixed(2)) : 0;

    const totals = {
      dealCount: matchCount,
      totalWithdrawn,
      totalCalculated,
      totalAgentCommission,
      totalProfit,
      avgAgentPct,
      avgDiscountPct,
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
        dealCount: ag._count.deals,
      })),
      agenciesList: agenciesList.map((agc) => ({
        id: agc.id,
        name: agc.name,
        dealCount: agc._count.deals,
      })),
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
    });
  } catch (error: any) {
    console.error('Agents deals error:', error);
    return res.status(500).json({ error: 'Agent bitimlarini yuklashda xatolik' });
  }
});

// GET /api/agents/swot (Sheet: SWOT_Агентства)
router.get('/swot', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const agencies = await prisma.agency.findMany({
      include: {
        deals: {
          select: {
            withdrawnLimit: true,
            calculatedAmount: true,
            agentAmount: true,
          },
        },
      },
    });

    // Total turnover across all agencies
    let totalAllTurnover = 0;
    const agencyStats = agencies.map((agency) => {
      const dealCount = agency.deals.length;
      const totalLimit = agency.deals.reduce((sum, d) => sum + (Number(d.withdrawnLimit) || 0), 0);
      const calculatedSum = agency.deals.reduce((sum, d) => sum + (Number(d.calculatedAmount) || 0), 0);
      const companyRevenue = totalLimit - calculatedSum;
      const agencyPayout = agency.deals.reduce((sum, d) => sum + (Number(d.agentAmount) || 0), 0);
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

    const finalStats = agencyStats.map((item) => ({
      ...item,
      turnoverSharePct: totalAllTurnover > 0 ? item.totalLimit / totalAllTurnover : 0,
    }));

    // Fetch SWOT analysis texts
    const swotTexts = await prisma.swotAgencyAnalysis.findMany();
    const swotMap = new Map(swotTexts.map((s) => [s.agencyName, s]));

    const result = finalStats.map((stat) => {
      const sw = swotMap.get(stat.agencyName) || {};
      return {
        ...stat,
        swot: sw,
      };
    });

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
    console.error('Agency SWOT error:', error);
    return res.status(500).json({ error: 'Agentliklar SWOT tahlilini yuklashda xatolik' });
  }
});

// POST /api/agents/swot/:agencyName (Update SWOT text fields)
router.post('/swot/:agencyName', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { agencyName } = req.params;
    const { strengths, weaknesses, opportunities, threats } = req.body;

    const updated = await prisma.swotAgencyAnalysis.upsert({
      where: { agencyName },
      update: { strengths, weaknesses, opportunities, threats },
      create: { agencyName, strengths, weaknesses, opportunities, threats },
    });

    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'SWOT matnini saqlashda xatolik' });
  }
});

export default router;
