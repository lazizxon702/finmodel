import { Router, Response } from 'express';
import { Role } from '@prisma/client';
import { authenticateToken, requireRoles, AuthRequest } from '../middleware/auth.middleware';
import { STORE_LEDGER_START_YMD, formatTashkentDateTime, tashkentDayRange } from '../services/calculation.service';
import { LedgerError, findQodirStore, getStoreLedger, getStoresReport } from '../services/ledger.service';

/**
 * Do'konlar bo'yicha hisobot va do'konlar bilan hisob-kitob (do'kon daftari). Faqat o'qish.
 *   GET /api/store-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD   — barcha do'konlar yig'masi
 *   GET /api/store-reports/qodir?startDate&endDate                   — "Qodir aka" do'koni (batafsil)
 *   GET /api/store-reports/:storeId?startDate&endDate                — bitta do'kon (batafsil)
 *
 * Qoldiq (balance) = qarz − to'langan. Ma'nosi `settlement` ga bog'liq:
 *   STORE_OWES — do'kon bizdan qarzdor (Qodir aka ham; manfiy qoldiq = depozit);  TRUST — do'kon daftari yuritilmaydi (Trust daftari bor).
 * Daftar `ledgerStart` kunidan boshlanadi — undan oldingi bitimlarga qarz yozilmagan.
 */
const router = Router();

const VIEW_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.CFO, Role.COO, Role.CASHIER, Role.VIEWER];

/** Eski yozuvlardagi to'ldirgichlar ("Mijoz", "-") ism sifatida ko'rsatilmaydi */
const cleanName = (v?: string | null) => {
  const t = (v || '').trim();
  return !t || t === '-' || t.toLowerCase() === 'mijoz' ? null : t;
};

/** ?startDate / ?endDate — ikkalasi ixtiyoriy, YYYY-MM-DD; noto'g'ri bo'lsa 400 */
function parsePeriod(query: Record<string, unknown>) {
  const ymd = (value: unknown, label: string): string | null => {
    const s = value === undefined || value === null ? '' : String(value).trim();
    if (!s) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
    if (!d || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      throw new LedgerError(`"${label}" sanasi noto'g'ri — YYYY-MM-DD ko'rinishida bo'lishi kerak (masalan 2026-11-10)`);
    }
    return s;
  };
  const startDate = ymd(query.startDate, 'startDate');
  const endDate = ymd(query.endDate, 'endDate');
  if (startDate && endDate && endDate < startDate) {
    throw new LedgerError('"endDate" sanasi "startDate" sanasidan oldin bo\'lishi mumkin emas');
  }
  return { startDate, endDate, range: tashkentDayRange(startDate, endDate) };
}

function sendError(res: Response, error: any, fallback: string) {
  if (error instanceof LedgerError) return res.status(error.status).json({ error: error.message });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

/** Bitta do'kon hisobotining klientga ketadigan ko'rinishi (summalar — son, sanalar — Toshkent vaqti yorlig'i bilan) */
async function storeDetail(storeId: string, period: ReturnType<typeof parsePeriod>) {
  const data = await getStoreLedger(storeId, period.range);
  if (!data) return null;
  return {
    store: data.store,
    settlement: data.settlement,
    ledgerStart: data.ledgerStart,
    period: { startDate: period.startDate, endDate: period.endDate },
    summary: data.summary,
    ledger: data.ledger,
    deals: data.deals.map((d) => ({
      id: d.id,
      dealNumber: d.dealNumber,
      date: d.date,
      dateLabel: formatTashkentDateTime(d.date),
      customerName: cleanName(d.customerName),
      withdrawnLimit: Number(d.withdrawnLimit),
      calculatedAmount: Number(d.calculatedAmount),
      profit: Number(d.profit),
      agentAmount: Number(d.agentAmount),
      customerLimit: Number(d.customerLimit),
      approvalStatus: d.approvalStatus,
      provider: d.provider,
      // Do'kon qarzi tarkibi (Qodir aka: chek + agent ulushi + 6% foyda)
      debtParts: d.debtParts,
      // Chek xarajati DDS'ga yozilgan bo'lsa (Qodir aka cheklarida bo'lmaydi)
      checkExpense: d.checkExpense
        ? {
            id: d.checkExpense.id,
            txNumber: d.checkExpense.txNumber,
            amount: Number(d.checkExpense.amount),
            dateLabel: formatTashkentDateTime(d.checkExpense.dateTime),
          }
        : null,
    })),
    expenses: data.expenses.map((e) => ({
      id: e.id,
      txNumber: e.txNumber,
      dateTime: e.dateTime,
      dateLabel: formatTashkentDateTime(e.dateTime),
      categoryName: e.categoryName,
      expenseType: e.expenseType,
      account: e.account,
      amount: Number(e.amount),
      dealId: e.dealId,
      dealNumber: e.dealNumber,
    })),
    entries: data.entries.map((e) => ({
      id: e.id,
      type: e.type, // DEBT — bitim bo'yicha qarz, PAYMENT — DDS orqali to'lov
      amount: Number(e.amount),
      dateTime: e.dateTime,
      dateLabel: formatTashkentDateTime(e.dateTime),
      note: e.note,
      deal: e.deal ? { id: e.deal.id, dealNumber: e.deal.dealNumber, customerName: cleanName(e.deal.customerName) } : null,
      ddsTransaction: e.ddsTransaction
        ? {
            id: e.ddsTransaction.id,
            txNumber: e.ddsTransaction.txNumber,
            account: e.ddsTransaction.account,
            categoryName: e.ddsTransaction.categoryName,
          }
        : null,
    })),
  };
}

// GET /api/store-reports — barcha do'konlar bo'yicha yig'ma
router.get('/', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const period = parsePeriod(req.query as Record<string, unknown>);
    const report = await getStoresReport(period.range);
    return res.json({
      period: { startDate: period.startDate, endDate: period.endDate },
      ledgerStart: STORE_LEDGER_START_YMD,
      totals: report.totals,
      stores: report.stores,
    });
  } catch (error: any) {
    return sendError(res, error, "Do'konlar hisobotini yuklashda xatolik");
  }
});

// GET /api/store-reports/qodir — "Qodir aka" bilan hisob-kitob (/:storeId dan OLDIN turishi shart)
router.get('/qodir', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const period = parsePeriod(req.query as Record<string, unknown>);
    const qodir = await findQodirStore();
    if (!qodir) return res.status(404).json({ error: '"Qodir aka" do\'koni spravochnikda topilmadi' });
    const detail = await storeDetail(qodir.id, period);
    if (!detail) return res.status(404).json({ error: '"Qodir aka" do\'koni spravochnikda topilmadi' });
    return res.json(detail);
  } catch (error: any) {
    return sendError(res, error, 'Qodir aka hisob-kitobini yuklashda xatolik');
  }
});

// GET /api/store-reports/:storeId — bitta do'kon bo'yicha batafsil
router.get('/:storeId', authenticateToken, requireRoles(VIEW_ROLES), async (req: AuthRequest, res: Response) => {
  try {
    const period = parsePeriod(req.query as Record<string, unknown>);
    const detail = await storeDetail(String(req.params.storeId), period);
    if (!detail) return res.status(404).json({ error: "Do'kon topilmadi" });
    return res.json(detail);
  } catch (error: any) {
    return sendError(res, error, "Do'kon hisobotini yuklashda xatolik");
  }
});

export default router;
