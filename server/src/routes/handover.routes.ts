import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// 1. Checklist (Прием передача)
router.get('/checklist', authenticateToken, async (req: AuthRequest, res: Response) => {
  const items = await prisma.handoverChecklist.findMany({ orderBy: { orderNum: 'asc' } });
  return res.json(items);
});

router.put('/checklist/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { comment, status, actDone, applicationTaken } = req.body;
  const updated = await prisma.handoverChecklist.update({
    where: { id },
    data: { comment, status, actDone, applicationTaken },
  });
  return res.json(updated);
});

// 2. Staff KPI Plans (Лист5)
router.get('/kpi', authenticateToken, async (req: AuthRequest, res: Response) => {
  const plans = await prisma.staffKPIPlan.findMany({ orderBy: { roleName: 'asc' } });
  return res.json(plans);
});

router.put('/kpi/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reportType, reportFormat, kpiDetails } = req.body;
  const updated = await prisma.staffKPIPlan.update({
    where: { id },
    data: { reportType, reportFormat, kpiDetails },
  });
  return res.json(updated);
});

// 3. Debts (Лист8)
router.get('/debts', authenticateToken, async (req: AuthRequest, res: Response) => {
  const debts = await prisma.debtRecord.findMany({ orderBy: { createdAt: 'desc' } });
  const totalUsd = debts.reduce((s, d) => s + (Number(d.amountUsd) || 0), 0);
  const totalUzs = debts.reduce((s, d) => s + (Number(d.amountUzs) || 0), 0);
  return res.json({ debts, totals: { totalUsd, totalUzs } });
});

router.post('/debts', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { debtorName, roleDescription, telegram, contactPhone, amountUsd, amountUzs, remainingAmount, note, weOwe, isConfirmed, debtReason, contractDate, repaymentDate } = req.body;
  const newDebt = await prisma.debtRecord.create({
    data: {
      debtorName,
      roleDescription,
      telegram,
      contactPhone,
      amountUsd: Number(amountUsd) || 0,
      amountUzs: Number(amountUzs) || 0,
      remainingAmount: Number(remainingAmount) || 0,
      note,
      weOwe: Boolean(weOwe),
      isConfirmed: Boolean(isConfirmed),
      debtReason,
      contractDate: contractDate ? new Date(contractDate) : null,
      repaymentDate: repaymentDate ? new Date(repaymentDate) : null,
    },
  });
  return res.status(201).json(newDebt);
});

router.put('/debts/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updated = await prisma.debtRecord.update({
    where: { id },
    data: req.body,
  });
  return res.json(updated);
});

router.delete('/debts/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await prisma.debtRecord.delete({ where: { id } });
  return res.json({ success: true });
});

// 4. Employee Salaries & FOT (ФОТ)
router.get('/salaries', authenticateToken, async (req: AuthRequest, res: Response) => {
  const salaries = await prisma.employeeSalary.findMany({ orderBy: { employeeName: 'asc' } });
  const totalFOT = salaries.reduce((s, emp) => s + (Number(emp.totalAmount) || 0), 0);
  return res.json({ salaries, totalFOT });
});

router.post('/salaries', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { employeeName, position, baseSalary, bonusAmount, paymentDate, isPaid, note } = req.body;
  const base = Number(baseSalary) || 0;
  const bonus = Number(bonusAmount) || 0;
  const total = base + bonus;

  const item = await prisma.employeeSalary.create({
    data: {
      employeeName,
      position,
      baseSalary: base,
      bonusAmount: bonus,
      totalAmount: total,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      isPaid: Boolean(isPaid),
      note,
    },
  });
  return res.status(201).json(item);
});

router.put('/salaries/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { baseSalary, bonusAmount, ...rest } = req.body;
  const data: any = { ...rest };
  if (baseSalary !== undefined || bonusAmount !== undefined) {
    const base = Number(baseSalary) || 0;
    const bonus = Number(bonusAmount) || 0;
    data.baseSalary = base;
    data.bonusAmount = bonus;
    data.totalAmount = base + bonus;
  }
  const updated = await prisma.employeeSalary.update({ where: { id }, data });
  return res.json(updated);
});

export default router;
