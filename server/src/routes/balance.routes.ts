import { Router, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { AccountType, TransactionType } from '@prisma/client';
import { isScopedRole } from '../services/access.service';
import { tashkentDayRange } from '../services/calculation.service';

const router = Router();

// Bu faylda DDS'ga yozuv yo'q — pul harakati faqat o'qiladi (yozish/o'chirish ledger servis orqali, dds.routes da).

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/** DDS yozuvi oyning qaysi kuniga tushadi — Asia/Tashkent bo'yicha */
const tashkentDayOfMonth = (d: Date) => new Date(d.getTime() + TASHKENT_OFFSET_MS).getUTCDate();

/** OPERATOR va AGENT pul harakati hisobotlarini ko'ra olmaydi */
const denyScopedRoles = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || isScopedRole(req.user.role)) {
    return res.status(403).json({ error: "Sizda balans hisobotini ko'rish huquqi yo'q" });
  }
  next();
};

// GET /api/balance/matrix
router.get('/matrix', authenticateToken, denyScopedRoles, async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth = '2026-11' } = req.query as any;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(yearMonth))) {
      return res.status(400).json({ error: "Oy noto'g'ri formatda (YYYY-MM bo'lishi kerak)" });
    }
    const [year, month] = yearMonth.split('-').map(Number);
    // Depozitlar kun boshiga (UTC 00:00) yozilgan — ular uchun UTC oralig'i
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const daysInMonth = endDate.getUTCDate();
    // DDS yozuvlari uchun — Toshkent kuni bo'yicha oy chegaralari
    const ddsRange = tashkentDayRange(`${yearMonth}-01`, `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`);

    const partners = await prisma.partner.findMany({
      include: {
        deposits: {
          where: {
            date: { gte: startDate, lte: endDate },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const ddsTransactions = await prisma.ddsTransaction.findMany({
      where: {
        amount: { gt: 0 },
        dateTime: { gte: ddsRange.start, lte: ddsRange.end },
      },
    });

    const accountTypes: { code: AccountType; label: string }[] = [
      { code: AccountType.CASH, label: 'Naqd so\'m (Нахт пул сум)' },
      { code: AccountType.BANK_CARD, label: 'Karta (Карта)' },
      { code: AccountType.SETTLEMENT_ACCOUNT, label: 'Hisob-raqam (Счет)' },
    ];

    const partnerMatrices = partners.map((p) => {
      const rows = accountTypes.map((acc) => {
        const daysData: { [day: number]: { deposit: number; income: number; expense: number; netProfit: number } } = {};

        let monthlyDeposit = 0;
        let monthlyIncome = 0;
        let monthlyExpense = 0;

        for (let d = 1; d <= daysInMonth; d++) {
          const currentDayStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
          
          // Deposit from manual entries
          const depRecord = p.deposits.find((dep) => {
            const depDay = dep.date.getUTCDate();
            return dep.accountType === acc.code && depDay === d;
          });
          const depVal = Number(depRecord?.depositAmount) || 0;

          // Income and Expense from DDS for this partner and day
          let dayIncome = 0;
          let dayExpense = 0;

          for (const tx of ddsTransactions) {
            const txDay = tashkentDayOfMonth(tx.dateTime);
            const matchPartner = tx.sourcePerson?.toLowerCase().includes(p.name.toLowerCase());
            const matchAccount = tx.account === acc.code;

            if (txDay === d && matchPartner && matchAccount) {
              const amt = Number(tx.amount) || 0;
              if (tx.type === TransactionType.INCOME) dayIncome += amt;
              else if (tx.type === TransactionType.EXPENSE) dayExpense += amt;
            }
          }

          const dayProfit = dayIncome - dayExpense;

          daysData[d] = {
            deposit: depVal,
            income: dayIncome,
            expense: dayExpense,
            netProfit: dayProfit,
          };

          monthlyDeposit += depVal;
          monthlyIncome += dayIncome;
          monthlyExpense += dayExpense;
        }

        return {
          accountType: acc.code,
          accountLabel: acc.label,
          monthlyTotals: {
            deposit: monthlyDeposit,
            income: monthlyIncome,
            expense: monthlyExpense,
            netProfit: monthlyIncome - monthlyExpense,
          },
          days: daysData,
        };
      });

      // Partner totals
      const partnerMonthlyTotals = rows.reduce(
        (acc, r) => {
          acc.deposit += r.monthlyTotals.deposit;
          acc.income += r.monthlyTotals.income;
          acc.expense += r.monthlyTotals.expense;
          acc.netProfit += r.monthlyTotals.netProfit;
          return acc;
        },
        { deposit: 0, income: 0, expense: 0, netProfit: 0 }
      );

      return {
        partnerId: p.id,
        partnerName: p.name,
        monthlyTotals: partnerMonthlyTotals,
        accountRows: rows,
      };
    });

    return res.json({
      yearMonth,
      daysInMonth,
      partners: partnerMatrices,
    });
  } catch (error: any) {
    console.error('Balance matrix error:', error);
    return res.status(500).json({ error: 'Balans hisobotini yuklashda xatolik' });
  }
});

// POST /api/balance/deposit (Set or update deposit for a partner/day/account)
router.post('/deposit', authenticateToken, denyScopedRoles, async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId, date, accountType, depositAmount } = req.body;

    if (!partnerId || !date || !accountType) {
      return res.status(400).json({ error: 'Sherik, sana va hisob turi ko\'rsatilishi kerak' });
    }

    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);

    const saved = await prisma.partnerDailyDeposit.upsert({
      where: {
        partnerId_date_accountType: {
          partnerId,
          date: d,
          accountType: accountType as AccountType,
        },
      },
      update: { depositAmount: Number(depositAmount) || 0 },
      create: {
        partnerId,
        date: d,
        accountType: accountType as AccountType,
        depositAmount: Number(depositAmount) || 0,
      },
    });

    return res.json(saved);
  } catch (error: any) {
    return res.status(500).json({ error: 'Depozitni saqlashda xatolik: ' + error.message });
  }
});

export default router;
