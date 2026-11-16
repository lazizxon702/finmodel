/**
 * FAQAT O'QIYDI: sotuvlar bo'yicha telefonlarni DONALAB sanaydi va bitta model bo'yicha (masalan A18) dona hisobini chiqaradi.
 *   tsrun scripts/report-sale-units.ts A18
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dt = (v: Date | null | undefined) => (v ? new Date(v.getTime() + 5 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '—');
(async () => {
  const q = (process.argv[2] || 'A18').toLowerCase();
  const hit = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, '').includes(q.replace(/\s+/g, ''));
  let deals: any[] = [];
  for (let i = 0; ; i++) { try { deals = await prisma.deal.findMany({ include: { store: true, items: true, sale: { include: { buyer: true } }, buyer: true } as any, orderBy: { dealNumber: 'asc' } }); break; } catch (e) { if (i > 5) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  // har bitim uchun: jami dona va shu modeldan dona
  const unitsOf = (d: any) => {
    const items = d.items || [];
    const total = items.length ? items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0) : Number(d.quantity) || 1;
    let model = 0;
    if (items.length) for (const it of items) {
      if (!hit(it.productName)) continue;
      const parts = String(it.productName).split('+').map((p) => p.trim());
      if (parts.length > 1) { for (const p of parts) if (hit(p)) model += Number((p.match(/(\d+)\s*(ta|шт)/i) || [])[1]) || 1; }
      else model += Number(it.quantity) || 1;
    } else if (hit(d.productName)) model = Number(d.quantity) || 1;
    return { total, model };
  };
  const imeisOf = (d: any) => [...new Set(`${d.imeiBarcode || ''} ${d.imei2 || ''} ${(d.items || []).map((i: any) => `${i.imei1 || ''} ${i.imei2 || ''}`).join(' ')}`.match(/\d{14,16}/g) || [])];

  console.log('── SOTUVLAR (2 va undan ko\'p chekli) — donalab ──');
  const bySale = new Map<number, any[]>();
  for (const d of deals) if (d.sale) bySale.set(d.sale.saleNumber, [...(bySale.get(d.sale.saleNumber) || []), d]);
  for (const [num, ds] of [...bySale].sort((a, b) => a[0] - b[0])) {
    if (ds.length < 2) continue;
    const tot = ds.reduce((s, d) => s + unitsOf(d).total, 0), mod = ds.reduce((s, d) => s + unitsOf(d).model, 0);
    console.log(`Sotuv №${num} → ${ds[0].sale.buyer?.name} | ${dt(ds[0].sale.saleDate)} | ${ds.length} chek, ${tot} dona telefon, shundan ${q.toUpperCase()}: ${mod} dona | narx ${Math.round(Number(ds[0].sale.totalPrice))}`);
    for (const d of ds) console.log(`     #${d.dealNumber} | ${d.productName} | dona ${unitsOf(d).total} (${q.toUpperCase()}: ${unitsOf(d).model}) | IMEI: ${imeisOf(d).join(', ') || '—'}`);
  }

  console.log(`\n── ${q.toUpperCase()} DONA HISOBI ──`);
  const rows = deals.filter((d) => unitsOf(d).model > 0);
  const st = new Map<string, { checks: number; units: number; noImei: number }>();
  for (const d of rows) { const g = st.get(d.status) || { checks: 0, units: 0, noImei: 0 }; g.checks++; g.units += unitsOf(d).model; st.set(d.status, g); }
  for (const [k, g] of st) console.log(`  ${k}: ${g.checks} chek, ${g.units} dona`);
  console.log(`  JAMI: ${rows.length} chek, ${rows.reduce((s, d) => s + unitsOf(d).model, 0)} dona`);

  console.log('\n── SHUBHALI JOYLAR ──');
  const imeiMap = new Map<string, number[]>();
  for (const d of rows) for (const im of imeisOf(d)) imeiMap.set(im, [...(imeiMap.get(im) || []), d.dealNumber]);
  for (const [im, nums] of imeiMap) if (nums.length > 1) console.log(`  Bitta IMEI ikki chekda: ${im} → #${nums.join(', #')}`);
  for (const d of rows) {
    const u = unitsOf(d), im = imeisOf(d);
    if (im.length && im.length < u.total) console.log(`  #${d.dealNumber} (${d.status}): ${u.total} dona yozilgan, IMEI ${im.length} ta — "${d.productName}"`);
    if (!im.length) console.log(`  #${d.dealNumber} (${d.status}): IMEI umuman yozilmagan — "${d.productName}"${d.sale ? ` | sotuv №${d.sale.saleNumber}` : ''}`);
    if (Number(d.quantity) !== u.total) console.log(`  #${d.dealNumber}: bitimda soni ${d.quantity}, tovar qatorlarida ${u.total} dona`);
  }
})().catch((e) => console.error('Xato:', e?.message || e)).finally(() => prisma.$disconnect());
