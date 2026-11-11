import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { requireAdminConfirm } from '../lib/security';
import { Role } from '@prisma/client';
import { CalculationService } from '../services/calculation.service';
import { DealStatus } from '@prisma/client';
import { webhookCallback } from 'grammy';
import { bot } from '../bot/telegram.bot';

const router = Router();

// Telegram Webhook endpoints
router.post('/webhook', webhookCallback(bot, 'express'));
router.get('/webhook', (req, res) => {
  res.json({ status: 'ok', bot: '@HisobchiMobiBot', time: new Date() });
});

// Setup webhook helper
router.get('/setup-webhook', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const webhookUrl = (process.env.PUBLIC_SERVER_URL || 'https://server-ecru-three-97.vercel.app') + '/api/bot/webhook';
    await bot.api.setWebhook(webhookUrl);
    const info = await bot.api.getWebhookInfo();
    return res.json({ status: 'ok', webhookUrl, info });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/bot/deals
router.get('/deals', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const deals = await prisma.botDeal.findMany({
      include: { payments: true, deal: true },
      orderBy: { dateTime: 'desc' },
    });
    return res.json(deals);
  } catch (error: any) {
    console.error('Bot deals error:', error);
    return res.status(500).json({ error: 'Bot bitimlarini yuklashda xatolik: ' + (error.message || error) });
  }
});

// POST /api/bot/deals/:id/approve (Migrate to main Deals)
router.post('/deals/:id/approve', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const botDeal = await prisma.botDeal.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!botDeal) return res.status(404).json({ error: 'Bot bitimi topilmadi' });
    if (botDeal.isApproved) return res.status(400).json({ error: 'Bu bitim allaqachon tasdiqlangan' });

    // Store & Provider lookups
    const store = await prisma.store.upsert({
      where: { name: botDeal.storeName?.trim() || 'Do\'kon' },
      update: {},
      create: { name: botDeal.storeName?.trim() || 'Do\'kon' },
    });

    const provider = await prisma.provider.upsert({
      where: { name: botDeal.providerName?.trim() || 'Boshqa' },
      update: {},
      create: { name: botDeal.providerName?.trim() || 'Boshqa' },
    });

    // Agency & Agent
    let agencyId: string | null = null;
    let agentId: string | null = null;
    if (botDeal.agencyName) {
      const agc = await prisma.agency.upsert({
        where: { name: botDeal.agencyName.trim() },
        update: {},
        create: { name: botDeal.agencyName.trim() },
      });
      agencyId = agc.id;

      if (botDeal.agentName) {
        let agt = await prisma.agent.findFirst({
          where: { agencyId: agc.id, name: botDeal.agentName.trim() },
        });
        if (!agt) {
          agt = await prisma.agent.create({
            data: { agencyId: agc.id, name: botDeal.agentName.trim() },
          });
        }
        agentId = agt.id;
      }
    }

    const rules = await prisma.commissionRule.findMany({
      where: { isActive: true },
      include: { store: true, provider: true },
    });
    const mappedRules = rules.map((r) => ({
      storeName: r.store?.name || null,
      providerName: r.provider?.name || null,
      ratePercent: Number(r.ratePercent),
      priority: r.priority,
    }));

    const withdrawn = Number(botDeal.withdrawnLimit) || 0;
    const calculatedAmount = withdrawn * 0.70; // 30% standard discount estimate if not given

    const calcResult = CalculationService.calculateDeal(
      {
        customerLimit: Number(botDeal.customerLimit) || withdrawn,
        withdrawnLimit: withdrawn,
        calculatedAmount,
        storeName: store.name,
        providerName: provider.name,
        isDaftarManual: botDeal.isDaftar,
        productName: botDeal.productName || undefined,
        quantity: botDeal.quantity,
        imeiBarcode: botDeal.imeiBarcode || undefined,
      },
      mappedRules
    );

    const lastDeal = await prisma.deal.findFirst({ orderBy: { dealNumber: 'desc' } });
    const dealNumber = (lastDeal?.dealNumber || 3500) + 1;

    const mainDeal = await prisma.deal.create({
      data: {
        dealNumber,
        date: botDeal.dateTime,
        sellerName: botDeal.telegramUsername || 'Telegram Bot',
        createdById: req.user!.id,
        providerId: provider.id,
        isDaftar: calcResult.isDaftar,
        customerName: botDeal.customerName,
        customerPhone1: botDeal.customerPhone1,
        customerPhone2: botDeal.customerPhone2,
        contractUrl: botDeal.contractUrl,
        passportPhotoUrl: botDeal.passportPhotoUrl,
        storeId: store.id,
        customerLimit: botDeal.customerLimit,
        withdrawnLimit: botDeal.withdrawnLimit,
        agentAmount: calcResult.agentAmount,
        totalPurchaseCost: calcResult.totalPurchaseCost,
        purchaseDiscountPct: calcResult.purchaseDiscountPct,
        agentPct: calcResult.agentPct,
        calculatedAmount,
        remainingLimit: calcResult.remainingLimit,
        differenceAmount: calcResult.differenceAmount,
        isActualDeviceSale: calcResult.isActualDeviceSale,
        productName: botDeal.productName,
        quantity: botDeal.quantity,
        imeiBarcode: botDeal.imeiBarcode,
        status: calcResult.status,
        agencyId,
        agentId,
        extraDaftar: calcResult.extraDaftar,
        qodirDebt: calcResult.qodirDebt,
        qodirBalance: calcResult.qodirBalance,
        greenBazarBalance: calcResult.greenBazarBalance,
        trustBalance: calcResult.trustBalance,
        totalExtraBalance: calcResult.totalExtraBalance,
        botDealId: botDeal.id,
      },
    });

    await prisma.botDeal.update({
      where: { id: botDeal.id },
      data: { isApproved: true },
    });

    return res.json({ success: true, mainDeal });
  } catch (error: any) {
    console.error('Approve bot deal error:', error);
    return res.status(500).json({ error: 'Bitimni tasdiqlashda xatolik: ' + error.message });
  }
});

// DELETE /api/bot/deals/:id (Delete bot deal and associated records)
router.delete('/deals/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const botDeal = await prisma.botDeal.findUnique({
      where: { id },
      include: { payments: true, deal: true },
    });

    if (!botDeal) {
      return res.status(404).json({ error: 'Bot bitimi topilmadi' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Delete associated bot payments (by botDealId and checkNumber)
      await tx.botPayment.deleteMany({
        where: {
          OR: [
            { botDealId: id },
            ...(botDeal.checkNumber ? [{ checkNumber: botDeal.checkNumber }] : []),
          ],
        },
      });

      // 2. If main deal exists, delete it
      if (botDeal.deal) {
        await tx.deal.delete({
          where: { id: botDeal.deal.id },
        });
      }

      // 3. Delete the bot deal itself
      await tx.botDeal.delete({
        where: { id },
      });
    });

    return res.json({
      success: true,
      message: `Chek №${botDeal.checkNumber || ''} muvaffaqiyatli o'chirildi`,
    });
  } catch (error: any) {
    console.error('Delete bot deal error:', error);
    return res.status(500).json({ error: 'Bot bitimini o\'chirishda xatolik: ' + (error.message || error) });
  }
});

// GET /api/bot/payments
router.get('/payments', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const payments = await prisma.botPayment.findMany({
      include: { botDeal: true },
      orderBy: { dateTime: 'desc' },
    });
    return res.json(payments);
  } catch (error: any) {
    console.error('Bot payments error:', error);
    return res.status(500).json({ error: 'Bot to\'lovlarini yuklashda xatolik: ' + (error.message || error) });
  }
});

// POST /api/bot/payments/:id/verify
router.post('/payments/:id/verify', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isVerified } = req.body;
    const updated = await prisma.botPayment.update({
      where: { id },
      data: { isVerified: isVerified !== undefined ? isVerified : true },
    });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'To\'lovni tasdiqlashda xatolik' });
  }
});

// GET /api/bot/operator-reports (Sheet: БОТ ТР)
router.get('/operator-reports', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const reports = await prisma.botOperatorReport.findMany({
      orderBy: { date: 'desc' },
    });

    const totals = reports.reduce(
      (acc, r) => {
        acc.totalActual += Number(r.actualPrice) || 0;
        acc.totalPurchase += Number(r.purchasePrice) || 0;
        acc.totalPaid += Number(r.paidAmount) || 0;
        acc.totalProfit += Number(r.profit) || 0;
        return acc;
      },
      { totalActual: 0, totalPurchase: 0, totalPaid: 0, totalProfit: 0 }
    );

    return res.json({ reports, totals });
  } catch (error: any) {
    return res.status(500).json({ error: 'Operatorlar hisobotini yuklashda xatolik' });
  }
});

// POST /api/bot/operator-reports
router.post('/operator-reports', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { agentName, date, operatorName, appName, calculatedPct, productName, actualPrice, storeName, checkNumber, responsible } = req.body;

    const actual = Number(actualPrice) || 0;
    const pct = Number(calculatedPct) || 0;
    const purchasePrice = actual * (1 - pct);
    const paidAmount = actual * 0.70; // 70% paid after agent cut
    const profit = purchasePrice - paidAmount;

    const newRecord = await prisma.botOperatorReport.create({
      data: {
        agentName: agentName || 'Asadbek',
        date: date ? new Date(date) : new Date(),
        operatorName,
        appName,
        calculatedPct: pct,
        productName,
        actualPrice: actual,
        purchasePrice,
        paidAmount,
        profit,
        storeName: storeName || 'Denov',
        checkNumber: checkNumber || null,
        responsible: responsible || null,
      },
    });

    return res.status(201).json(newRecord);
  } catch (error: any) {
    return res.status(500).json({ error: 'Hisobot qatorini qo\'shishda xatolik' });
  }
});

// DELETE /api/bot/operator-reports/all (Clear all check reports)
router.delete('/operator-reports/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.botOperatorReport.deleteMany({});
    return res.json({
      success: true,
      deletedCount: result.count,
      message: 'Barcha chek hisobotlari o\'chirildi',
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Cheklarni tozalashda xatolik: ' + error.message });
  }
});

// DELETE /api/bot/operator-reports/:id
router.delete('/operator-reports/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.botOperatorReport.delete({ where: { id } });
    return res.json({ success: true, message: 'Chek hisoboti o\'chirildi' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Chek hisobotini o\'chirishda xatolik: ' + error.message });
  }
});

// DELETE /api/bot/payments/all (Clear all bot payments)
router.delete('/payments/all', authenticateToken, requireRoles([Role.ADMIN]), requireAdminConfirm, async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.botPayment.deleteMany({});
    return res.json({
      success: true,
      deletedCount: result.count,
      message: 'Barcha bot to\'lov cheklari o\'chirildi',
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'To\'lovlarni tozalashda xatolik: ' + error.message });
  }
});

export default router;
