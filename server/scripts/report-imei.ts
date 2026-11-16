/**
 * FAQAT O'QIYDI: IMEI bo'yicha qidiradi (bitim, tovar qatorlari, deviceItems); aniq va o'xshash (oxirgi raqamlari farqli) mosliklar.
 *   tsrun scripts/report-imei.ts 357245681543849
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dt = (v: Date | null | undefined) => (v ? new Date(v.getTime() + 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') : '—');
(async () => {
  const q = String(process.argv[2] || '').replace(/\D/g, '');
  let deals: any[] = [];
  for (let i = 0; ; i++) { try { deals = await prisma.deal.findMany({ include: { store: true, provider: true, agency: true, agent: true, items: true, sale: { include: { buyer: true } } } as any }); break; } catch (e) { if (i > 5) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  const show = (d: any, where: string) => console.log(`#${d.dealNumber} | ${dt(d.date)} | ${d.status} | ${d.store?.name}/${d.provider?.name} | ${d.agency?.name}/${d.agent?.name || '—'} | mijoz ${d.customerName || '—'} | tovar "${d.productName}" | ${where} | holat izohi: ${d.statusChangeReason || '—'} | o'zgargan ${dt(d.updatedAt)}${d.sale ? ` | sotuv №${d.sale.saleNumber} → ${d.sale.buyer?.name}` : ''}`);
  let exact = 0;
  for (const d of deals) {
    const places: string[] = [];
    if (String(d.imeiBarcode || '').includes(q)) places.push(`bitim IMEI: ${d.imeiBarcode}`);
    if (String(d.imei2 || '').includes(q)) places.push(`bitim IMEI2: ${d.imei2}`);
    for (const it of d.items || []) if (String(it.imei1 || '').includes(q) || String(it.imei2 || '').includes(q)) places.push(`tovar qatori "${it.productName}" ${it.color || ''} IMEI ${it.imei1 || ''} ${it.imei2 || ''}`);
    if (JSON.stringify(d.deviceItems || '').includes(q)) places.push('deviceItems ichida');
    if (places.length) { exact++; show(d, places.join(' ; ')); }
  }
  console.log(`Aniq moslik: ${exact} ta`);
  if (!exact) {
    console.log('O\'xshash IMEI lar (birinchi 11 raqami bir xil):');
    for (const d of deals) {
      const all = `${d.imeiBarcode || ''} ${d.imei2 || ''} ${(d.items || []).map((i: any) => `${i.imei1 || ''} ${i.imei2 || ''}`).join(' ')}`;
      const near = (all.match(/\d{13,16}/g) || []).filter((x) => x.slice(0, 11) === q.slice(0, 11));
      if (near.length) show(d, `o'xshash: ${[...new Set(near)].join(', ')}`);
    }
  }
})().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
