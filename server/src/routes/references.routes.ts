import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Stores
router.get('/stores', authenticateToken, async (req, res: Response) => {
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  return res.json(stores);
});

router.post('/stores', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { name, contactPhone, address } = req.body;
  const store = await prisma.store.create({ data: { name: name.trim(), contactPhone, address } });
  return res.status(201).json(store);
});

// Providers
router.get('/providers', authenticateToken, async (req, res: Response) => {
  const providers = await prisma.provider.findMany({ orderBy: { name: 'asc' } });
  return res.json(providers);
});

router.post('/providers', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { name, defaultDiscount, isDaftarDefault } = req.body;
  const provider = await prisma.provider.create({
    data: {
      name: name.trim(),
      defaultDiscount: Number(defaultDiscount) || 0,
      isDaftarDefault: Boolean(isDaftarDefault),
    },
  });
  return res.status(201).json(provider);
});

// Agencies & Agents
router.get('/agencies', authenticateToken, async (req, res: Response) => {
  const agencies = await prisma.agency.findMany({
    include: { agents: true },
    orderBy: { name: 'asc' },
  });
  return res.json(agencies);
});

router.post('/agencies', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { name, phone } = req.body;
  const agency = await prisma.agency.create({ data: { name: name.trim(), phone } });
  return res.status(201).json(agency);
});

router.post('/agencies/:agencyId/agents', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { agencyId } = req.params;
  const { name, phone } = req.body;
  const agent = await prisma.agent.create({
    data: { agencyId, name: name.trim(), phone },
  });
  return res.status(201).json(agent);
});

// Buyers
router.get('/buyers', authenticateToken, async (req, res: Response) => {
  const buyers = await prisma.buyer.findMany({ orderBy: { name: 'asc' } });
  return res.json(buyers);
});

router.post('/buyers', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { name, phone, isWholesale } = req.body;
  const buyer = await prisma.buyer.create({
    data: { name: name.trim(), phone, isWholesale: isWholesale !== undefined ? isWholesale : true },
  });
  return res.status(201).json(buyer);
});

// Partners
router.get('/partners', authenticateToken, async (req, res: Response) => {
  const partners = await prisma.partner.findMany({ orderBy: { name: 'asc' } });
  return res.json(partners);
});

router.post('/partners', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  const { name, phone } = req.body;
  const partner = await prisma.partner.create({ data: { name: name.trim(), phone } });
  return res.status(201).json(partner);
});

// Commission Rules
router.get('/rules', authenticateToken, async (req, res: Response) => {
  const rules = await prisma.commissionRule.findMany({
    include: { store: true, provider: true },
    orderBy: { priority: 'desc' },
  });
  return res.json(rules);
});

router.post('/rules', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { name, storeId, providerId, ratePercent, priority } = req.body;
  const rule = await prisma.commissionRule.create({
    data: {
      name,
      storeId: storeId || null,
      providerId: providerId || null,
      ratePercent: Number(ratePercent),
      priority: Number(priority) || 1,
      isActive: true,
    },
    include: { store: true, provider: true },
  });
  return res.status(201).json(rule);
});

router.put('/rules/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  const { id } = req.params;
  const { name, storeId, providerId, ratePercent, priority, isActive } = req.body;
  const updated = await prisma.commissionRule.update({
    where: { id },
    data: {
      name,
      storeId: storeId || null,
      providerId: providerId || null,
      ratePercent: Number(ratePercent),
      priority: Number(priority) || 1,
      isActive: isActive !== undefined ? isActive : true,
    },
    include: { store: true, provider: true },
  });
  return res.json(updated);
});

// Settings
router.get('/settings', authenticateToken, async (req, res: Response) => {
  const settings = await prisma.appSetting.findMany({ orderBy: { key: 'asc' } });
  return res.json(settings);
});

router.post('/settings', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  const { key, value, description } = req.body;
  const setting = await prisma.appSetting.upsert({
    where: { key },
    update: { value: String(value), description },
    create: { key, value: String(value), description },
  });
  return res.json(setting);
});

export default router;
