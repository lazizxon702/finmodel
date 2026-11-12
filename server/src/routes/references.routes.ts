import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { normalizeName } from '../services/calculation.service';
import { ReferenceKind, canonicalReferenceName, cleanName, referenceKey } from '../services/sheetsSync.service';

const router = Router();

/**
 * Yangi do'kon / provayder / agentlik nomi bo'yicha dublikat tekshiruvi.
 * Kanonik nom (Qodir oka → Qodir aka, Imanium → Imanum ...) va normallashtirilgan ko'rinish
 * (katta-kichik harf, ortiqcha bo'shliq, tirnoqlar farqsiz) bo'yicha solishtiriladi.
 * Qaytadi: saqlanadigan yagona nom va (bo'lsa) shu nomga to'g'ri keladigan mavjud yozuv.
 */
function checkReferenceName<T extends { name: string }>(kind: ReferenceKind, rawName: unknown, existing: T[]) {
  const name = typeof rawName === 'string' ? canonicalReferenceName(kind, rawName) : '';
  if (!name) return { name, duplicate: null as T | null };
  const key = referenceKey(kind, name);
  const matches = existing.filter((e) => referenceKey(kind, e.name) === key);
  // Bir nechta mos yozuv bo'lsa (hali birlashtirilmagan dublikatlar) — nomi aynan kanonik bo'lgani ko'rsatiladi
  return { name, duplicate: matches.find((e) => e.name === name) || matches[0] || null };
}

const duplicateResponse = (res: Response, label: string, existing: { id: string; name: string }) =>
  res.status(409).json({
    error: `Bunday ${label} allaqachon mavjud: "${existing.name}"`,
    existingName: existing.name,
    existingId: existing.id,
  });

// Stores
router.get('/stores', authenticateToken, async (req, res: Response) => {
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  return res.json(stores);
});

router.post('/stores', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { contactPhone, address } = req.body;
    const { name, duplicate } = checkReferenceName('store', req.body?.name, await prisma.store.findMany());
    if (!name) return res.status(400).json({ error: "Do'kon nomi kiritilmagan" });
    if (duplicate) return duplicateResponse(res, "do'kon", duplicate);
    const store = await prisma.store.create({ data: { name, contactPhone, address } });
    return res.status(201).json(store);
  } catch (error: any) {
    return res.status(500).json({ error: "Do'kon yaratishda xatolik: " + (error.message || error) });
  }
});

// Providers
router.get('/providers', authenticateToken, async (req, res: Response) => {
  const providers = await prisma.provider.findMany({ orderBy: { name: 'asc' } });
  return res.json(providers);
});

router.post('/providers', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { defaultDiscount, isDaftarDefault } = req.body;
    const { name, duplicate } = checkReferenceName('provider', req.body?.name, await prisma.provider.findMany());
    if (!name) return res.status(400).json({ error: 'Provayder nomi kiritilmagan' });
    if (duplicate) return duplicateResponse(res, 'provayder', duplicate);
    const provider = await prisma.provider.create({
      data: {
        name,
        defaultDiscount: Number(defaultDiscount) || 0,
        isDaftarDefault: Boolean(isDaftarDefault),
      },
    });
    return res.status(201).json(provider);
  } catch (error: any) {
    return res.status(500).json({ error: 'Provayder yaratishda xatolik: ' + (error.message || error) });
  }
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
  try {
    const { phone } = req.body;
    const { name, duplicate } = checkReferenceName('agency', req.body?.name, await prisma.agency.findMany());
    if (!name) return res.status(400).json({ error: 'Agentlik nomi kiritilmagan' });
    if (duplicate) return duplicateResponse(res, 'agentlik', duplicate);
    const agency = await prisma.agency.create({ data: { name, phone } });
    return res.status(201).json(agency);
  } catch (error: any) {
    return res.status(500).json({ error: 'Agentlik yaratishda xatolik: ' + (error.message || error) });
  }
});

router.post('/agencies/:agencyId/agents', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { agencyId } = req.params;
    const { phone } = req.body;
    const name = typeof req.body?.name === 'string' ? cleanName(req.body.name) : '';
    if (!name) return res.status(400).json({ error: 'Agent ismi kiritilmagan' });

    const agency = await prisma.agency.findUnique({ where: { id: agencyId }, include: { agents: true } });
    if (!agency) return res.status(404).json({ error: 'Agentlik topilmadi' });

    // Bitta agentlik ichida bir xil ismli (katta-kichik harf / bo'shliq farqsiz) agent ikki marta yaratilmaydi
    const duplicate = agency.agents.find((a) => normalizeName(a.name) === normalizeName(name));
    if (duplicate) return duplicateResponse(res, `agent ("${agency.name}" agentligida)`, duplicate);

    const agent = await prisma.agent.create({
      data: { agencyId, name, phone },
    });
    return res.status(201).json(agent);
  } catch (error: any) {
    return res.status(500).json({ error: 'Agent yaratishda xatolik: ' + (error.message || error) });
  }
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
