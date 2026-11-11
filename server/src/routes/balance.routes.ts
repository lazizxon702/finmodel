import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { AccountType, TransactionType } from '@prisma/client';

const router = Router();

// GET /api/balance/matrix
router.get('/matrix', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { yearMonth = '2026-11' } = req.query as any;

    const [year, month] = yearMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const daysInMonth = endDate.getUTCDate();

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
        dateTime: { gte: startDate, lte: endDate },
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
            const txDay = tx.dateTime.getUTCDate();
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
router.post('/deposit', authenticateToken, async (req: AuthRequest, res: Response) => {
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
