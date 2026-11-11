import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';
import { AccountType, ExpenseCategoryType, TransactionType } from '@prisma/client';

const router = Router();
router.use(authenticateToken);

// ================= EMPLOYEES =================
router.get('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { fullName: 'asc' },
      include: {
        attendances: {
          take: 30,
          orderBy: { date: 'desc' },
        },
        advances: {
          orderBy: { date: 'desc' },
        },
      },
    });
    return res.json(employees);
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ error: 'Xodimlarni yuklashda xatolik' });
  }
});

router.post('/employees', async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, phone, position, department, managerName, salaryType, baseSalary, kpiBonus, schedule } = req.body;
    if (!fullName || !position) {
      return res.status(400).json({ error: 'F.I.Sh va lavozim kiritilishi shart' });
    }

    const employee = await prisma.employee.create({
      data: {
        fullName: fullName.trim(),
        phone: phone || null,
        position: position.trim(),
        department: department || 'Asosiy',
        managerName: managerName || null,
        salaryType: salaryType || 'MONTHLY',
        baseSalary: baseSalary ? Number(baseSalary) : 0,
        kpiBonus: kpiBonus ? Number(kpiBonus) : 0,
        schedule: schedule || '09:00 - 18:00',
        isActive: true,
      },
    });
    return res.json(employee);
  } catch (error: any) {
    return res.status(500).json({ error: 'Xodim yaratishda xatolik' });
  }
});

router.put('/employees/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    delete data.id;
    delete data.attendances;
    delete data.advances;
    if (data.baseSalary !== undefined) data.baseSalary = Number(data.baseSalary);
    if (data.kpiBonus !== undefined) data.kpiBonus = Number(data.kpiBonus);

    const updated = await prisma.employee.update({
      where: { id },
      data,
    });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'Xodimni tahrirlashda xatolik' });
  }
});

// ================= ATTENDANCE (DAVOMAT & TABEL) =================
router.get('/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const { date, month } = req.query;
    let where: any = {};

    if (date) {
      const d = new Date(String(date));
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      where.date = { gte: start, lte: end };
    } else if (month) {
      // YYYY-MM
      const [year, m] = String(month).split('-').map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0, 23, 59, 59);
      where.date = { gte: start, lte: end };
    }

    const records = await prisma.attendance.findMany({
      where,
      include: { employee: true },
      orderBy: { date: 'desc' },
    });
    return res.json(records);
  } catch (error: any) {
    return res.status(500).json({ error: 'Davomatni yuklashda xatolik' });
  }
});

router.post('/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, date, checkInTime, checkOutTime, status, lateMinutes, overtimeMinutes } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Xodim tanlanishi shart' });

    const attendanceDate = date ? new Date(date) : new Date();

    const record = await prisma.attendance.create({
      data: {
        employeeId,
        date: attendanceDate,
        checkInTime: checkInTime || '09:00',
        checkOutTime: checkOutTime || null,
        status: status || 'KELDI',
        lateMinutes: Number(lateMinutes || 0),
        overtimeMinutes: Number(overtimeMinutes || 0),
        approvedBy: req.user?.fullName || 'HR Rahbari',
      },
      include: { employee: true },
    });
    return res.json(record);
  } catch (error: any) {
    return res.status(500).json({ error: 'Davomat yozishda xatolik' });
  }
});

// ================= SALARY ADVANCES (AVANSLAR) =================
router.get('/advances', async (req: AuthRequest, res: Response) => {
  try {
    const advances = await prisma.salaryAdvance.findMany({
      include: { employee: true },
      orderBy: { date: 'desc' },
    });
    return res.json(advances);
  } catch (error: any) {
    return res.status(500).json({ error: 'Avanslarni yuklashda xatolik' });
  }
});

router.post('/advances', async (req: AuthRequest, res: Response) => {
  try {
    const { employeeId, amount, reason, accountType, createDdsExpense } = req.body;
    if (!employeeId || !amount) {
      return res.status(400).json({ error: 'Xodim va summa kiritilishi shart' });
    }

    const numAmount = Number(amount);
    const advance = await prisma.salaryAdvance.create({
      data: {
        employeeId,
        amount: numAmount,
        reason: reason || 'Oylik avansi',
        accountType: accountType || 'CASH',
        status: 'TASDIQLANDI',
        approvedBy: req.user?.fullName || 'Moliya Rahbari',
        paidAt: new Date(),
      },
      include: { employee: true },
    });

    // Optionally create DDS Transaction automatically (TZ 12.3: "Avans to'langanda kassa/bankdan pul chiqimi avtomatik shakllansin")
    if (createDdsExpense) {
      const txCount = await prisma.ddsTransaction.count();
      await prisma.ddsTransaction.create({
        data: {
          txNumber: `TX-${1000 + txCount + 1}`,
          dateTime: new Date(),
          type: TransactionType.EXPENSE,
          account: accountType === 'BANK' ? AccountType.BANK_CARD : AccountType.CASH,
          expenseType: ExpenseCategoryType.OPEX,
          categoryName: 'Xodimlar oyligi va FOT',
          sourcePerson: advance.employee.fullName,
          amount: numAmount,
          description: `Avans to'lovi: ${advance.employee.fullName} (${reason || 'Avans'})`,
          createdById: req.user?.id,
        },
      });
    }

    return res.json(advance);
  } catch (error: any) {
    console.error('Error creating advance:', error);
    return res.status(500).json({ error: 'Avans yozishda xatolik' });
  }
});

// ================= TASKS & KPI (VAZIFALAR) =================
router.get('/tasks', async (req: AuthRequest, res: Response) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return res.json(tasks);
  } catch (error: any) {
    return res.status(500).json({ error: 'Vazifalarni yuklashda xatolik' });
  }
});

router.post('/tasks', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, assigneeName, priority, dueDate, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Vazifa sarlavhasi kiritilishi shart' });

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        assigneeName: assigneeName || null,
        priority: priority || 'ORTA',
        dueDate: dueDate ? new Date(dueDate) : null,
        status: status || 'YANGI',
        createdById: req.user?.id,
      },
    });
    return res.json(task);
  } catch (error: any) {
    return res.status(500).json({ error: 'Vazifa yaratishda xatolik' });
  }
});

router.put('/tasks/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resultNote, priority } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (resultNote !== undefined) updateData.resultNote = resultNote;
    if (priority) updateData.priority = priority;

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'Vazifani yangilashda xatolik' });
  }
});

export default router;
