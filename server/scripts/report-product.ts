/**
 * FAQAT O'QIYDI: nomi bo'yicha tovar qidiradi (bitim nomi, tovar qatorlari, deviceItems) va holati bilan chiqaradi.
 *   tsrun scripts/report-product.ts A18
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const f = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const dmy = (v: Date | null | undefined) => (v ? new Date(v.getTime() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '—');
const STATUS: Record<string, string> = {
  NEED_TO_BUY: 'Olish kerak', PENDING: 'Kutilmoqda (omborga qabul qilinmagan)', IN_TRANSIT: "Yo'lda", IN_WAREHOUSE: 'OMBORDA', SOLD: 'Sotildi',
  MONEY_RECEIVED: 'Pul tushdi', PARTIAL_AMOUNT: "To'liq emas",
};
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

async function main() {
  const q = (process.argv[2] || 'A18').toLowerCase().replace(/\s+/g, '');
  const hit = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '').includes(q);
  const deals: any[] = await retry(() => prisma.deal.findMany({
    include: { store: true, provider: true, agency: true, agent: true, buyer: true, items: true, sale: { include: { buyer: true } } } as any,
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  }));
  const rows = deals.filter((d) => hit(d.productName) || (d.items || []).some((i: any) => hit(i.productName)) || hit(JSON.stringify(d.deviceItems || '')));
  const byStatus = new Map<string, { deals: number; units: number }>();
  for (const d of rows) {
    const items = (d.items || []).filter((i: any) => hit(i.productName));
    const units = items.length ? items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0) : hit(d.productName) ? Number(d.quantity) || 1 : 0;
    const g = byStatus.get(d.status) || { deals: 0, units: 0 };
    g.deals++; g.units += units; byStatus.set(d.status, g);
    console.log(
      `#${d.dealNumber} | ${dmy(d.date)} | ${STATUS[d.status] || d.status} | ${d.store?.name}/${d.provider?.name} | ${d.agency?.name || '—'}/${d.agent?.name || '—'} | mijoz: ${d.customerName || '—'}\n` +
      `     tovar: "${d.productName || ''}" soni ${d.quantity} | shu modeldan: ${units} dona | IMEI: ${[d.imeiBarcode, d.imei2].filter(Boolean).join(' ') || '—'}\n` +
      (items.length ? items.map((i: any) => `     · ${i.productName} | ${i.color || ''} ${i.storageGb || ''} | IMEI ${i.imei1 || '—'} ${i.imei2 || ''} | soni ${i.quantity ?? 1}`).join('\n') + '\n' : '') +
      `     holat izohi: ${d.statusChangeReason || '—'} | o'zgargan ${dmy(d.updatedAt)}` +
      (d.status === 'SOLD' ? ` | sotilgan: ${dmy(d.saleDate)} ${f(d.salePrice)} → ${d.sale?.buyer?.name || d.buyer?.name || '—'}${d.sale ? ` (sotuv №${d.sale.saleNumber})` : ''}` : '')
    );
  }
  console.log(`\n"${process.argv[2] || 'A18'}" bo'yicha: ${rows.length} ta chek`);
  for (const [k, g] of byStatus) console.log(`  ${STATUS[k] || k}: ${g.deals} chek, ${g.units} dona`);
}

main().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
