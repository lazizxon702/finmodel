import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticateToken);

// 1. Get all leads with filtering & duplicate check info
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { status, search, team } = req.query;
    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = String(status);
    }
    if (team && team !== 'ALL') {
      where.teamName = String(team);
    }
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { providerName: { contains: q, mode: 'insensitive' } },
        { agentName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true, username: true } } },
    });

    return res.json(leads);
  } catch (error: any) {
    console.error('Error fetching leads:', error);
    return res.status(500).json({ error: 'Lidlarni yuklashda xatolik' });
  }
});

// 2. Check for duplicate phone
router.get('/check-duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.json({ isDuplicate: false });

    const cleanPhone = String(phone).replace(/\D/g, '');
    const existing = await prisma.lead.findFirst({
      where: {
        phone: { contains: cleanPhone.slice(-9) },
      },
    });

    return res.json({
      isDuplicate: !!existing,
      existingLead: existing ? { id: existing.id, fullName: existing.fullName, agentName: existing.agentName, status: existing.status } : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Tekshirishda xatolik' });
  }
});

// 3. Create a new lead
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      fullName,
      phone,
      additionalPhone,
      passportMasked,
      requestedAmount,
      approvedLimit,
      providerName,
      partnerName,
      source,
      status,
      visitDate,
      agentName,
      teamName,
      notes,
    } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ error: 'Mijoz F.I.Sh va telefon raqami kiritilishi shart' });
    }

    const lead = await prisma.lead.create({
      data: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        additionalPhone: additionalPhone?.trim() || null,
        passportMasked: passportMasked?.trim() || null,
        requestedAmount: requestedAmount ? Number(requestedAmount) : 0,
        approvedLimit: approvedLimit ? Number(approvedLimit) : 0,
        providerName: providerName || 'Imanium',
        partnerName: partnerName || 'Qodir aka',
        source: source || "Qo'ng'iroq",
        status: status || 'YANGI',
        visitDate: visitDate ? new Date(visitDate) : null,
        agentName: agentName || req.user?.fullName || 'Agent',
        teamName: teamName || 'Jahongir',
        notes: notes || null,
        createdById: req.user?.id,
      },
    });

    return res.json(lead);
  } catch (error: any) {
    console.error('Error creating lead:', error);
    return res.status(500).json({ error: 'Lid yaratishda xatolik yuz berdi' });
  }
});

// 4. Update lead status or info
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    delete data.id;
    delete data.leadNumber;
    delete data.createdAt;

    if (data.requestedAmount !== undefined) data.requestedAmount = Number(data.requestedAmount);
    if (data.approvedLimit !== undefined) data.approvedLimit = Number(data.approvedLimit);
    if (data.visitDate) data.visitDate = new Date(data.visitDate);

    const updated = await prisma.lead.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('Error updating lead:', error);
    return res.status(500).json({ error: 'Lidni yangilashda xatolik' });
  }
});

// 5. Delete lead
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.lead.delete({ where: { id } });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Lidni o\'chirishda xatolik' });
  }
});

// 6. Get Teams and Call-center Rankings
router.get('/teams', async (req: AuthRequest, res: Response) => {
  try {
    const teams = await prisma.callCenterTeam.findMany({ where: { isActive: true } });
    const leads = await prisma.lead.findMany();

    // Calculate ranking stats per team
    const teamStats = teams.map((team) => {
      const teamLeads = leads.filter((l) => l.teamName?.toLowerCase() === team.leaderName.toLowerCase());
      const total = teamLeads.length;
      const converted = teamLeads.filter((l) => l.status === 'BITIMGA_OTDI').length;
      const cancelled = teamLeads.filter((l) => l.status === 'BEKOR_QILINDI').length;
      const totalLimit = teamLeads.reduce((acc, curr) => acc + Number(curr.approvedLimit || 0), 0);
      const conversionRate = total > 0 ? ((converted / total) * 100).toFixed(1) : '0';

      return {
        id: team.id,
        leaderName: team.leaderName,
        members: team.members.split(',').map((m) => m.trim()),
        totalLeads: total,
        convertedLeads: converted,
        cancelledLeads: cancelled,
        totalLimitVolume: totalLimit,
        conversionRate: `${conversionRate}%`,
      };
    });

    return res.json({ teams, teamStats });
  } catch (error: any) {
    return res.status(500).json({ error: 'Jamoalar ma\'lumotini yuklashda xatolik' });
  }
});

export default router;
