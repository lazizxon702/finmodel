/**
 * Chek ma'lumotlari tekshiruvi (egasi, 23.11.2026) — bazaga murojaat qiladigan qismlar.
 * Sof qoidalar (telefon, IMEI, Luhn, muddat) — calculation.service.ts da.
 */
import { DealStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_PAYOUT_TOLERANCE,
  STALE_DEAL_DAYS,
  formatTashkentDateTime,
  imeiProblem,
  isTrustName,
} from './calculation.service';
import { LedgerError } from './ledger.service';
import { notifyAdmins } from './notification.service';

type Db = PrismaClient | Prisma.TransactionClient;

/** Chekdagi barcha IMEI'lar (Deal maydonlari + DealItem), takrorsiz */
export function collectDealImeis(deal: { imeiBarcode?: string | null; imei2?: string | null; items?: { imei1?: string | null; imei2?: string | null }[] }): string[] {
  const all = [deal.imeiBarcode, deal.imei2, ...(deal.items || []).flatMap((i) => [i.imei1, i.imei2])];
  return [...new Set(all.map((s) => String(s ?? '').trim()).filter(Boolean))];
}

/** Boshqa cheklarda uchraydigan IMEI'lar: [{ imei, dealNumber }] */
export async function findImeiConflicts(db: Db, imeis: string[], excludeDealId?: string | null) {
  const list = [...new Set(imeis.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) return [];
  const notSelf = excludeDealId ? { id: { not: excludeDealId } } : {};
  const [byDeal, byItem] = await Promise.all([
    db.deal.findMany({
      where: { ...notSelf, OR: [{ imeiBarcode: { in: list } }, { imei2: { in: list } }] },
      select: { dealNumber: true, imeiBarcode: true, imei2: true },
    }),
    db.dealItem.findMany({
      where: { ...(excludeDealId ? { dealId: { not: excludeDealId } } : {}), OR: [{ imei1: { in: list } }, { imei2: { in: list } }] },
      select: { imei1: true, imei2: true, deal: { select: { dealNumber: true } } },
    }),
  ]);
  const out = new Map<string, Set<number>>();
  const add = (imei: string | null, n: number) => {
    if (imei && list.includes(imei)) (out.get(imei) || out.set(imei, new Set()).get(imei)!).add(n);
  };
  for (const d of byDeal) {
    add(d.imeiBarcode, d.dealNumber);
    add(d.imei2, d.dealNumber);
  }
  for (const i of byItem) {
    add(i.imei1, i.deal.dealNumber);
    add(i.imei2, i.deal.dealNumber);
  }
  return [...out.entries()].map(([imei, nums]) => ({ imei, dealNumbers: [...nums].sort((a, b) => a - b) }));
}

/**
 * Omborga qabul qilishda IMEI majburiy (egasi, 23.11.2026): har bir tovarda kamida bitta IMEI, har biri 15 raqam + Luhn,
 * boshqa chekda takrorlanmaydi. Xato bo'lsa matn qaytaradi (null — hammasi joyida).
 * `items` — chekning omborga kiradigan tovarlari (har biri imei1/imei2 bilan).
 */
export async function warehouseImeiProblem(
  db: Db,
  dealId: string | null,
  items: { productName?: string | null; imei1?: string | null; imei2?: string | null }[]
): Promise<string | null> {
  if (!items.length) return "Omborga qabul qilish uchun tovar va uning IMEI'si kerak";
  for (const it of items) {
    const name = it.productName || 'Tovar';
    if (!String(it.imei1 ?? '').trim()) return `${name}: IMEI kiritilmagan — omborga qabul qilib bo'lmaydi`;
    for (const v of [it.imei1, it.imei2]) {
      if (!String(v ?? '').trim()) continue;
      const p = imeiProblem(v);
      if (p) return `${name}: ${p}`;
    }
  }
  const imeis = items.flatMap((i) => [i.imei1, i.imei2]).map((s) => String(s ?? '').trim()).filter(Boolean);
  const dup = imeis.find((s, i) => imeis.indexOf(s) !== i);
  if (dup) return `IMEI ${dup} shu chekda ikki marta yozilgan`;
  const conflicts = await findImeiConflicts(db, imeis, dealId);
  if (conflicts.length) {
    const c = conflicts[0];
    return `IMEI ${c.imei} allaqachon ${c.dealNumbers.map((n) => '#' + n).join(', ')} chekda bor — takror bo'lishi mumkin emas`;
  }
  return null;
}

/** Juftlik tekshiruvi yoqilganmi (egasi boshlang'ich ro'yxatni tasdiqlagach admin yoqadi) */
export const STORE_PROVIDER_CHECK_KEY = 'store_provider_check';
export async function isStoreProviderCheckOn(db: Db = prisma): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: STORE_PROVIDER_CHECK_KEY } }).catch(() => null);
  return row?.value === 'on';
}

/**
 * Do'kon — provayder juftligi (egasi, 23.11.2026). Xato matni yoki null.
 *   • "Trust 1" provayderi FAQAT "Trust" do'koni bilan — har doim tekshiriladi (#8171 xatosi);
 *   • qolgani — ruxsat etilgan juftliklar ro'yxati bo'yicha, faqat tekshiruv yoqilgan bo'lsa.
 */
export async function storeProviderProblem(
  db: Db,
  store: { id: string; name: string },
  provider: { id: string; name: string }
): Promise<string | null> {
  if (isTrustName(provider.name) && !isTrustName(store.name)) {
    return `${provider.name} faqat Trust do'koni bilan ishlaydi — "${store.name}" tanlangan`;
  }
  if (!(await isStoreProviderCheckOn(db))) return null;
  const ok = await db.storeProviderPair.findUnique({ where: { storeId_providerId: { storeId: store.id, providerId: provider.id } } });
  return ok ? null : `Bu do'kon bu provayder bilan ishlamaydi: ${store.name} — ${provider.name}`;
}

/** Faktik berilgan summa uchun bardosh (so'm). AppSetting "payout_tolerance", bo'lmasa 100 000 */
export async function getPayoutTolerance(db: Db = prisma): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key: 'payout_tolerance' } }).catch(() => null);
  const v = Number(row?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_PAYOUT_TOLERANCE;
}

/** Xatoni 400 qilib tashlaydi (deals va inventory route'larining sendError'i LedgerError'ni taniydi) */
export function fail(message: string): never {
  throw new LedgerError(message, 400);
}

/**
 * "Kutilmoqda" / "Sotib olish kerak" holatida 3 kundan ko'p turgan TASDIQLANGAN cheklar haqida egasiga (adminlarga) xabar.
 * Har bir chek uchun bir marta (Deal.staleNotifiedAt). Bir kunda ko'pi bilan bir marta ishlaydi (AppSetting "stale_check_ymd").
 * HECH QACHON xato tashlamaydi.
 */
export async function notifyStaleDealsOncePerDay(now: Date = new Date()): Promise<number> {
  try {
    const ymd = formatTashkentDateTime(now).slice(0, 10);
    const key = 'stale_check_ymd';
    const prev = await prisma.appSetting.findUnique({ where: { key } });
    if (prev?.value === ymd) return 0;
    // Bir vaqtda ikki so'rov kelsa — faqat bittasi o'tadi (shartli yozuv)
    if (prev) {
      const r = await prisma.appSetting.updateMany({ where: { key, value: prev.value }, data: { value: ymd } });
      if (!r.count) return 0;
    } else {
      try {
        await prisma.appSetting.create({ data: { key, value: ymd, description: "Kutib qolgan cheklar xabari oxirgi marta yuborilgan kun" } });
      } catch {
        return 0;
      }
    }
    const border = new Date(now.getTime() - STALE_DEAL_DAYS * 24 * 60 * 60 * 1000);
    const deals = await prisma.deal.findMany({
      where: {
        approvalStatus: 'APPROVED',
        status: { in: [DealStatus.PENDING, DealStatus.NEED_TO_BUY] },
        date: { lt: border },
        staleNotifiedAt: null,
      },
      orderBy: { date: 'asc' },
      select: { id: true, dealNumber: true, date: true, status: true, store: { select: { name: true } }, productName: true },
    });
    if (!deals.length) return 0;
    const days = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    const lines = deals
      .slice(0, 30)
      .map((d) => `#${d.dealNumber} · ${d.store?.name || '—'} · ${d.productName || 'tovar'} · ${days(d.date)} kun · ${d.status === 'PENDING' ? 'Kutilmoqda' : 'Sotib olish kerak'}`);
    if (deals.length > 30) lines.push(`… yana ${deals.length - 30} ta`);
    await notifyAdmins({ title: `${deals.length} ta chek ${STALE_DEAL_DAYS} kundan ko'p tovar kutmoqda`, lines });
    await prisma.deal.updateMany({ where: { id: { in: deals.map((d) => d.id) } }, data: { staleNotifiedAt: now } });
    return deals.length;
  } catch (error: any) {
    console.warn('notifyStaleDealsOncePerDay xatosi:', error?.message || error);
    return 0;
  }
}
