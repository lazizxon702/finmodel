import { Router, Response } from 'express';
import { DdsSource, ExpenseCategoryType, Role, TransactionType } from '@prisma/client';
import { authenticateToken, requireRoles, AuthRequest } from '../middleware/auth.middleware';
import { TRUST_INCOME_CATEGORY, TRUST_RATE, formatTashkentDateTime, tashkentDayRange } from '../services/calculation.service';
import { LedgerError, createDds, getAccountBalances, getTrustLedger } from '../services/ledger.service';

/**
 * Trust hisob-kitobi:
 *   GET  /api/trust?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  — Jami qarz, Trust bergan pul, Qoldiq + yozuvlar
 *   POST /api/trust/payment                                   — Trust pul berdi → DDS KIRIMI ("Trust 1 daromadi")
 *                                                              va shu summa Trust qarzidan ayiriladi
 */
const router = Router();

const VIEW_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO, Role.COO, Role.CASHIER, Role.VIEWER];
const WRITE_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO, Role.CASHIER];

router.get('/', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const range = tashkentDayRange(req.query.startDate as string, req.query.endDate as string);
    const ledger = await getTrustLedger(range);

    return res.json({
      ratePercent: TRUST_RATE * 100,
      // Tanlangan davr bo'yicha
      period: ledger.period,
      // Butun davr bo'yicha (joriy haqiqiy qoldiq)
      overall: ledger.overall,
      entries: ledger.entries.map((e) => ({
        id: e.id,
        type: e.type, // DEBT — Trust qarzi (bitim), PAYMENT — Trust bergan pul
        amount: Number(e.amount),
        dateTime: e.dateTime,
        dateTimeLabel: formatTashkentDateTime(e.dateTime), // DD.MM.YYYY HH:mm (Asia/Tashkent)
        note: e.note,
        deal: e.deal
          ? {
              id: e.deal.id,
              dealNumber: e.deal.dealNumber,
              customerName: e.deal.customerName,
              withdrawnLimit: Number(e.deal.withdrawnLimit),
              storeName: e.deal.store?.name || null,
              providerName: e.deal.provider?.name || null,
            }
          : null,
        ddsTransaction: e.ddsTransaction,
      })),
    });
  } catch (error: any) {
    console.error('Trust ledger error:', error);
    return res.status(500).json({ error: 'Trust hisob-kitobini yuklashda xatolik: ' + (error.message || error) });
  }
});

router.post('/payment', authenticateToken, requireRoles(WRITE_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const { amount, account, dateTime, description } = req.body || {};
    const tx = await createDds({
      dateTime,
      type: TransactionType.INCOME,
      account: account || 'CASH',
      expenseType: ExpenseCategoryType.INCOME_TRANSFER,
      categoryName: TRUST_INCOME_CATEGORY,
      sourcePerson: 'Trust',
      amount,
      description: description || 'Trust bergan pul',
      createdById: req.user!.id,
      source: DdsSource.TRUST_PAYMENT,
    });
    const [ledger, balances] = await Promise.all([getTrustLedger(), getAccountBalances()]);
    return res.status(201).json({ transaction: tx, overall: ledger.overall, balances });
  } catch (error: any) {
    if (error instanceof LedgerError) return res.status(error.status).json({ error: error.message });
    console.error('Trust payment error:', error);
    return res.status(500).json({ error: "Trust to'lovini yozishda xatolik: " + (error.message || error) });
  }
});

export default router;
