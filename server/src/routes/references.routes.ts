import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { normalizeName, personNameKey } from '../services/calculation.service';
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

/** `?all=1` bo'lsa nofaol (yashirilgan) yozuvlar ham qaytariladi */
const wantsAll = (req: Request) => req.query.all === '1' || req.query.all === 'true';

const isStr = (v: unknown): v is string => typeof v === 'string';
/** Bo'sh qator → null; aks holda kesilgan matn */
const optText = (v: unknown): string | null => (isStr(v) && v.trim() ? v.trim() : null);

// ---------------------------------------------------------------------------
// Komissiya qoidasi: kiruvchi ma'lumotni tekshirish (sof funksiyalar — testlanadi)
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' (Toshkent sanasi) → o'sha kun boshi (00:00:00+05:00) yoki yaroqsiz bo'lsa null */
export function tashkentDayStart(ymd: unknown): Date | null {
  if (!isStr(ymd) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(ymd + 'T00:00:00+05:00');
  return isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DD' → o'sha kunning oxiri (23:59:59.999+05:00), ya'ni "gacha" sana o'zini ham qamrab oladi */
export function tashkentDayEnd(ymd: unknown): Date | null {
  if (!isStr(ymd) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(ymd + 'T23:59:59.999+05:00');
  return isNaN(d.getTime()) ? null : d;
}

/** Ulush (0..1) ekanini tekshiradi. 22 yuborilgan bo'lsa (foiz o'rniga ulush kerak) rad etadi. */
function parseFraction(raw: unknown, label: string): { value: number } | { error: string } {
  if (raw === '' || raw === null || raw === undefined) return { error: `${label} kiritilmagan` };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} son bo'lishi kerak` };
  if (n < 0 || n > 1) {
    return { error: `${label} 0 va 1 oralig'ida ulush bo'lishi kerak (masalan 0.22 = 22%). Kiritilgan qiymat: ${n}` };
  }
  return { value: n };
}

export interface RuleCurrent {
  name?: string;
  storeId?: string | null;
  providerId?: string | null;
  ratePercent?: unknown;
  profitPercent?: unknown;
  validFrom?: Date | null;
  validTo?: Date | null;
}

type RuleData = {
  name: string;
  storeId: string | null;
  providerId: string | null;
  ratePercent: number;
  profitPercent: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  priority?: number;
  isActive?: boolean;
};

/**
 * Qoida body'sini tekshiradi va Prisma uchun tayyor ma'lumot qaytaradi.
 * `current` berilsa (PUT) — yuborilmagan maydonlar o'zgarishsiz qoladi (priority ham jimgina 1 ga tushmaydi).
 */
export function parseRuleBody(body: any, current?: RuleCurrent): { data: RuleData } | { error: string } {
  const b = body || {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined;

  const name = has('name') ? (isStr(b.name) ? b.name.trim() : '') : current?.name?.trim() || '';
  if (!name) return { error: 'Qoida nomi kiritilmagan' };

  const storeId = has('storeId') ? b.storeId || null : current?.storeId ?? null;
  const providerId = has('providerId') ? b.providerId || null : current?.providerId ?? null;
  if (!storeId && !providerId) return { error: "Do'kon yoki provayderdan kamida bittasi tanlanishi shart" };

  const rateRaw = has('ratePercent') ? b.ratePercent : current?.ratePercent;
  const rate = parseFraction(rateRaw === undefined || rateRaw === null ? '' : Number(rateRaw), 'Kompaniya ulushi');
  if ('error' in rate) return rate;

  let profitPercent: number | null;
  if (has('profitPercent')) {
    if (b.profitPercent === null || b.profitPercent === '') profitPercent = null;
    else {
      const p = parseFraction(b.profitPercent, 'Bizning foyda');
      if ('error' in p) return p;
      profitPercent = p.value;
    }
  } else {
    const cur = current?.profitPercent;
    profitPercent = cur === undefined || cur === null ? null : Number(cur);
  }

  let validFrom: Date | null;
  if (has('validFrom')) {
    if (b.validFrom === null || b.validFrom === '') validFrom = null;
    else {
      validFrom = tashkentDayStart(b.validFrom);
      if (!validFrom) return { error: "Amal qilish boshi sanasi noto'g'ri (YYYY-MM-DD kerak)" };
    }
  } else validFrom = current?.validFrom ?? null;

  let validTo: Date | null;
  if (has('validTo')) {
    if (b.validTo === null || b.validTo === '') validTo = null;
    else {
      validTo = tashkentDayEnd(b.validTo);
      if (!validTo) return { error: "Amal qilish oxiri sanasi noto'g'ri (YYYY-MM-DD kerak)" };
    }
  } else validTo = current?.validTo ?? null;

  if (validFrom && validTo && validFrom.getTime() > validTo.getTime()) {
    return { error: "Amal qilish boshi oxiridan keyin bo'lishi mumkin emas" };
  }

  const data: RuleData = { name, storeId, providerId, ratePercent: rate.value, profitPercent, validFrom, validTo };

  if (has('priority')) {
    const pr = Number(b.priority);
    if (!Number.isInteger(pr)) return { error: "Ustuvorlik butun son bo'lishi kerak" };
    data.priority = pr;
  }
  if (has('isActive')) data.isActive = Boolean(b.isActive);

  return { data };
}

// ---------------------------------------------------------------------------
// Do'konlar
// ---------------------------------------------------------------------------
router.get('/stores', authenticateToken, async (req, res: Response) => {
  const stores = await prisma.store.findMany({
    where: wantsAll(req) ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
  });
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

router.put('/stores/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.store.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Do'kon topilmadi" });

    const data: any = {};
    if (req.body?.name !== undefined) {
      const all = await prisma.store.findMany({ where: { id: { not: id } } });
      const { name, duplicate } = checkReferenceName('store', req.body.name, all);
      if (!name) return res.status(400).json({ error: "Do'kon nomi kiritilmagan" });
      if (duplicate) return duplicateResponse(res, "do'kon", duplicate);
      data.name = name;
    }
    if (req.body?.contactPhone !== undefined) data.contactPhone = optText(req.body.contactPhone);
    if (req.body?.address !== undefined) data.address = optText(req.body.address);
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

    const store = await prisma.store.update({ where: { id }, data });
    return res.json(store);
  } catch (error: any) {
    return res.status(500).json({ error: "Do'konni yangilashda xatolik: " + (error.message || error) });
  }
});

router.delete('/stores/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.store.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: "Do'kon topilmadi" });

    const [deals, rules, ledger] = await Promise.all([
      prisma.deal.count({ where: { storeId: id } }),
      prisma.commissionRule.count({ where: { storeId: id } }),
      prisma.storeLedgerEntry.count({ where: { storeId: id } }),
    ]);
    if (deals + rules + ledger === 0) {
      await prisma.store.delete({ where: { id } });
      return res.json({ deleted: true });
    }
    await prisma.store.update({ where: { id }, data: { isActive: false } });
    return res.json({ deactivated: true, usage: { deals, rules, ledger } });
  } catch (error: any) {
    return res.status(500).json({ error: "Do'konni o'chirishda xatolik: " + (error.message || error) });
  }
});

// ---------------------------------------------------------------------------
// Provayderlar
// ---------------------------------------------------------------------------
router.get('/providers', authenticateToken, async (req, res: Response) => {
  const providers = await prisma.provider.findMany({
    where: wantsAll(req) ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
  });
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

router.put('/providers/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.provider.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Provayder topilmadi' });

    const data: any = {};
    if (req.body?.name !== undefined) {
      const all = await prisma.provider.findMany({ where: { id: { not: id } } });
      const { name, duplicate } = checkReferenceName('provider', req.body.name, all);
      if (!name) return res.status(400).json({ error: 'Provayder nomi kiritilmagan' });
      if (duplicate) return duplicateResponse(res, 'provayder', duplicate);
      data.name = name;
    }
    if (req.body?.defaultDiscount !== undefined) {
      const d = parseFraction(req.body.defaultDiscount, 'Standart diskont');
      if ('error' in d) return res.status(400).json({ error: d.error });
      data.defaultDiscount = d.value;
    }
    if (req.body?.isDaftarDefault !== undefined) data.isDaftarDefault = Boolean(req.body.isDaftarDefault);
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

    const provider = await prisma.provider.update({ where: { id }, data });
    return res.json(provider);
  } catch (error: any) {
    return res.status(500).json({ error: 'Provayderni yangilashda xatolik: ' + (error.message || error) });
  }
});

router.delete('/providers/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.provider.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Provayder topilmadi' });

    const [deals, rules] = await Promise.all([
      prisma.deal.count({ where: { providerId: id } }),
      prisma.commissionRule.count({ where: { providerId: id } }),
    ]);
    if (deals + rules === 0) {
      await prisma.provider.delete({ where: { id } });
      return res.json({ deleted: true });
    }
    await prisma.provider.update({ where: { id }, data: { isActive: false } });
    return res.json({ deactivated: true, usage: { deals, rules } });
  } catch (error: any) {
    return res.status(500).json({ error: "Provayderni o'chirishda xatolik: " + (error.message || error) });
  }
});

// ---------------------------------------------------------------------------
// Agentliklar va agentlar
// ---------------------------------------------------------------------------
router.get('/agencies', authenticateToken, async (req, res: Response) => {
  const all = wantsAll(req);
  const agencies = await prisma.agency.findMany({
    include: { agents: all ? true : { where: { isActive: true } } },
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

router.put('/agencies/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.agency.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Agentlik topilmadi' });

    const data: any = {};
    if (req.body?.name !== undefined) {
      const all = await prisma.agency.findMany({ where: { id: { not: id } } });
      const { name, duplicate } = checkReferenceName('agency', req.body.name, all);
      if (!name) return res.status(400).json({ error: 'Agentlik nomi kiritilmagan' });
      if (duplicate) return duplicateResponse(res, 'agentlik', duplicate);
      data.name = name;
    }
    if (req.body?.phone !== undefined) data.phone = optText(req.body.phone);

    const agency = await prisma.agency.update({ where: { id }, data, include: { agents: true } });
    return res.json(agency);
  } catch (error: any) {
    return res.status(500).json({ error: 'Agentlikni yangilashda xatolik: ' + (error.message || error) });
  }
});

router.delete('/agencies/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.agency.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Agentlik topilmadi' });

    const [deals, agents, users] = await Promise.all([
      prisma.deal.count({ where: { agencyId: id } }),
      prisma.agent.count({ where: { agencyId: id } }),
      prisma.user.count({ where: { agencyId: id } }),
    ]);
    if (deals + agents + users > 0) {
      const parts: string[] = [];
      if (deals) parts.push(`${deals} ta bitim`);
      if (agents) parts.push(`${agents} ta agent`);
      if (users) parts.push(`${users} ta foydalanuvchi`);
      return res.status(409).json({
        error: `Agentlikni o'chirib bo'lmaydi: hali ${parts.join(', ')} unga bog'langan`,
        usage: { deals, agents, users },
      });
    }
    await prisma.agency.delete({ where: { id } });
    return res.json({ deleted: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Agentlikni o'chirishda xatolik: " + (error.message || error) });
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
    const duplicate = agency.agents.find((a) => personNameKey(a.name) === personNameKey(name)); // kirill = lotin
    if (duplicate) return duplicateResponse(res, `agent ("${agency.name}" agentligida)`, duplicate);

    const agent = await prisma.agent.create({
      data: { agencyId, name, phone },
    });
    return res.status(201).json(agent);
  } catch (error: any) {
    return res.status(500).json({ error: 'Agent yaratishda xatolik: ' + (error.message || error) });
  }
});

// Agentni tahrirlash: ikkala yo'l ham ishlaydi (`/agents/:id` va `/agencies/:agencyId/agents/:id`)
router.put(
  ['/agents/:id', '/agencies/:agencyId/agents/:id'],
  authenticateToken,
  requireRoles([Role.ADMIN, Role.MANAGER]),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const current = await prisma.agent.findUnique({ where: { id }, include: { agency: true } });
      if (!current) return res.status(404).json({ error: 'Agent topilmadi' });

      const data: any = {};
      if (req.body?.name !== undefined) {
        const name = isStr(req.body.name) ? cleanName(req.body.name) : '';
        if (!name) return res.status(400).json({ error: 'Agent ismi kiritilmagan' });
        const siblings = await prisma.agent.findMany({ where: { agencyId: current.agencyId, id: { not: id } } });
        const duplicate = siblings.find((a) => personNameKey(a.name) === personNameKey(name));
        if (duplicate) return duplicateResponse(res, `agent ("${current.agency.name}" agentligida)`, duplicate);
        data.name = name;
      }
      if (req.body?.phone !== undefined) data.phone = optText(req.body.phone);
      if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

      const agent = await prisma.agent.update({ where: { id }, data });
      return res.json(agent);
    } catch (error: any) {
      return res.status(500).json({ error: 'Agentni yangilashda xatolik: ' + (error.message || error) });
    }
  }
);

router.delete(
  ['/agents/:id', '/agencies/:agencyId/agents/:id'],
  authenticateToken,
  requireRoles([Role.ADMIN]),
  async (req, res: Response) => {
    try {
      const { id } = req.params;
      const current = await prisma.agent.findUnique({ where: { id } });
      if (!current) return res.status(404).json({ error: 'Agent topilmadi' });

      const [deals, users] = await Promise.all([
        prisma.deal.count({ where: { agentId: id } }),
        prisma.user.count({ where: { agentId: id } }),
      ]);
      if (deals + users === 0) {
        await prisma.agent.delete({ where: { id } });
        return res.json({ deleted: true });
      }
      await prisma.agent.update({ where: { id }, data: { isActive: false } });
      return res.json({ deactivated: true, usage: { deals, users } });
    } catch (error: any) {
      return res.status(500).json({ error: "Agentni o'chirishda xatolik: " + (error.message || error) });
    }
  }
);

// ---------------------------------------------------------------------------
// Xaridorlar
// ---------------------------------------------------------------------------
router.get('/buyers', authenticateToken, async (req, res: Response) => {
  const buyers = await prisma.buyer.findMany({ orderBy: { name: 'asc' } });
  return res.json(buyers);
});

router.post('/buyers', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { phone, isWholesale } = req.body || {};
    const name = isStr(req.body?.name) ? cleanName(req.body.name) : '';
    if (!name) return res.status(400).json({ error: 'Xaridor nomi kiritilmagan' });

    const existing = await prisma.buyer.findMany();
    const duplicate = existing.find((b) => normalizeName(b.name) === normalizeName(name));
    if (duplicate) return duplicateResponse(res, 'xaridor', duplicate);

    const buyer = await prisma.buyer.create({
      data: { name, phone: optText(phone), isWholesale: isWholesale !== undefined ? Boolean(isWholesale) : true },
    });
    return res.status(201).json(buyer);
  } catch (error: any) {
    return res.status(500).json({ error: 'Xaridor yaratishda xatolik: ' + (error.message || error) });
  }
});

router.put('/buyers/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.buyer.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Xaridor topilmadi' });

    const data: any = {};
    if (req.body?.name !== undefined) {
      const name = isStr(req.body.name) ? cleanName(req.body.name) : '';
      if (!name) return res.status(400).json({ error: 'Xaridor nomi kiritilmagan' });
      const others = await prisma.buyer.findMany({ where: { id: { not: id } } });
      const duplicate = others.find((b) => normalizeName(b.name) === normalizeName(name));
      if (duplicate) return duplicateResponse(res, 'xaridor', duplicate);
      data.name = name;
    }
    if (req.body?.phone !== undefined) data.phone = optText(req.body.phone);
    if (req.body?.isWholesale !== undefined) data.isWholesale = Boolean(req.body.isWholesale);

    const buyer = await prisma.buyer.update({ where: { id }, data });
    return res.json(buyer);
  } catch (error: any) {
    return res.status(500).json({ error: 'Xaridorni yangilashda xatolik: ' + (error.message || error) });
  }
});

router.delete('/buyers/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.buyer.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Xaridor topilmadi' });

    const [deals, sales] = await Promise.all([
      prisma.deal.count({ where: { buyerId: id } }),
      prisma.sale.count({ where: { buyerId: id } }),
    ]);
    if (deals + sales > 0) {
      const parts: string[] = [];
      if (deals) parts.push(`${deals} ta bitim`);
      if (sales) parts.push(`${sales} ta sotuv`);
      return res.status(409).json({
        error: `Xaridorni o'chirib bo'lmaydi: hali ${parts.join(', ')} unga bog'langan`,
        usage: { deals, sales },
      });
    }
    await prisma.buyer.delete({ where: { id } });
    return res.json({ deleted: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Xaridorni o'chirishda xatolik: " + (error.message || error) });
  }
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

// ---------------------------------------------------------------------------
// Komissiya qoidalari
// ---------------------------------------------------------------------------
router.get('/rules', authenticateToken, async (req, res: Response) => {
  const rules = await prisma.commissionRule.findMany({
    include: { store: true, provider: true },
    orderBy: { priority: 'desc' },
  });
  return res.json(rules);
});

router.post('/rules', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const parsed = parseRuleBody(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const rule = await prisma.commissionRule.create({
      data: { ...parsed.data, priority: parsed.data.priority ?? 1, isActive: parsed.data.isActive ?? true },
      include: { store: true, provider: true },
    });
    return res.status(201).json(rule);
  } catch (error: any) {
    return res.status(500).json({ error: 'Qoida yaratishda xatolik: ' + (error.message || error) });
  }
});

router.put('/rules/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.commissionRule.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Qoida topilmadi' });

    const parsed = parseRuleBody(req.body, current);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const updated = await prisma.commissionRule.update({
      where: { id },
      data: parsed.data,
      include: { store: true, provider: true },
    });
    return res.json(updated);
  } catch (error: any) {
    return res.status(500).json({ error: 'Qoidani yangilashda xatolik: ' + (error.message || error) });
  }
});

router.delete('/rules/:id', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req, res: Response) => {
  try {
    const { id } = req.params;
    const current = await prisma.commissionRule.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Qoida topilmadi' });
    await prisma.commissionRule.delete({ where: { id } });
    return res.json({ deleted: true });
  } catch (error: any) {
    return res.status(500).json({ error: "Qoidani o'chirishda xatolik: " + (error.message || error) });
  }
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
