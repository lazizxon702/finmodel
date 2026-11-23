/**
 * Novza'dan kelgan tovarlar (egasi Telegram'dan yuborgan ro'yxat, 05–17.11.2026) va "Iman rebus" cheklari — FAQAT O'QIYDI.
 *   tsrun scripts/report-novza-rebus-xlsx.ts <chiqish.xlsx>
 * Novza ro'yxati qo'lda ko'chirilgan (manba: "Rassrochka" xabarlari, 23.11.2026 18:55); 09.11 summalari ming so'mda yozilgan (24.100 = 24 100 000).
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma';

type Row = { date: string; model: string; qty: number; sum: number | null; note?: string };
const NOVZA: Row[] = [
  { date: '05.11', model: 'Samsung S26 Ultra 12/512 Black', qty: 1, sum: 17_000_000 },
  { date: '05.11', model: 'Samsung S26 12/256 Violet', qty: 1, sum: 11_200_000 },
  { date: '05.11', model: 'iPhone 18 Pro 256 Glacier', qty: 1, sum: 20_600_000 },
  { date: '05.11', model: 'iPhone 16 128 Black', qty: 1, sum: 12_000_000 },
  { date: '05.11', model: 'iPhone 16 128 Black', qty: 1, sum: 10_900_000 },
  { date: '06.11', model: 'iPhone 14 128 Black', qty: 1, sum: 8_700_000 },
  { date: '06.11', model: 'iPhone 16 128 White', qty: 1, sum: 11_000_000 },
  { date: '06.11', model: 'Samsung S26 12/256 Sky Blue', qty: 1, sum: 11_200_000 },
  { date: '07.11', model: 'iPhone 16 128 White', qty: 1, sum: 10_800_000 },
  { date: '07.11', model: 'Samsung A57 8/256 Gray', qty: 1, sum: 6_200_000 },
  { date: '07.11', model: 'MacBook Air 13 M2 8/512', qty: 1, sum: 12_600_000 },
  { date: '07.11', model: 'Samsung A57 8/256 Gray', qty: 2, sum: 12_400_000, note: '2 ta birga' },
  { date: 'sanasiz', model: 'Samsung A57 128', qty: 7, sum: null, note: "Sanasiz xabar — 17.11 dagi bilan aynan bir xil (takror bo'lishi mumkin)" },
  { date: 'sanasiz', model: 'Samsung A18', qty: 3, sum: null, note: "Sanasiz xabar — 17.11 dagi bilan aynan bir xil (takror bo'lishi mumkin)" },
  { date: 'sanasiz', model: 'Samsung S26 12/256', qty: 1, sum: null, note: "Sanasiz xabar — 17.11 dagi bilan aynan bir xil (takror bo'lishi mumkin)" },
  { date: '09.11', model: 'iPhone 18 Pro Max 256 Burgundy', qty: 1, sum: 24_100_000 },
  { date: '09.11', model: 'iPhone 16 128', qty: 1, sum: 11_000_000 },
  { date: '09.11', model: 'Samsung A57 128 + Samsung S26 Ultra 512', qty: 2, sum: 21_600_000, note: '2 ta tovar bitta summada' },
  { date: '09.11', model: 'Samsung S26 Ultra 256', qty: 1, sum: 14_200_000 },
  { date: '09.11', model: 'Samsung A57 128', qty: 2, sum: 11_000_000, note: '2 ta birga' },
  { date: '09.11', model: 'Samsung S26 Ultra', qty: 1, sum: 14_300_000 },
  { date: '09.11', model: 'Samsung A57 128', qty: 2, sum: 11_900_000, note: '2 ta birga' },
  { date: '09.11', model: 'Samsung A18 128', qty: 1, sum: 3_000_000 },
  { date: '09.11', model: 'Samsung S26 Ultra 256', qty: 1, sum: 14_900_000 },
  { date: '09.11', model: 'Samsung A57 128 + Samsung A18', qty: 2, sum: 8_500_000, note: '2 ta tovar bitta summada' },
  { date: '09.11', model: 'Samsung A57 128', qty: 2, sum: 11_000_000, note: '2 ta birga' },
  { date: '09.11', model: 'Samsung A57 128', qty: 1, sum: 5_500_000 },
  { date: '10.11', model: 'Samsung S26 Ultra 12/256 Black', qty: 1, sum: null },
  { date: '10.11', model: 'Samsung S26 Ultra 12/256 White', qty: 1, sum: null },
  { date: '10.11', model: 'Samsung S26 Ultra 12/512 Violet', qty: 1, sum: null },
  { date: '10.11', model: 'Samsung A57 8/256 Navy', qty: 3, sum: null },
  { date: '10.11', model: 'Samsung A18 4/128 Blue', qty: 3, sum: null },
  { date: '11.11', model: 'Samsung S26 Ultra 12/512 Violet', qty: 2, sum: null },
  { date: '11.11', model: 'Samsung S26 12/256 Black', qty: 2, sum: null },
  { date: '11.11', model: 'Samsung A57 8/256 Navy', qty: 1, sum: null },
  { date: '11.11', model: 'iPhone 16 128 Black', qty: 1, sum: null },
  { date: '11.11', model: 'Fitbit', qty: 1, sum: null },
  { date: '12.11', model: 'Samsung A18 6/128', qty: 2, sum: null },
  { date: '12.11', model: 'Samsung A18 4/128', qty: 1, sum: null },
  { date: '12.11', model: 'Samsung A57 8/128', qty: 1, sum: null },
  { date: '12.11', model: 'Samsung A57 8/256', qty: 1, sum: null },
  { date: '13.11', model: 'Samsung A57 8/256', qty: 2, sum: null },
  { date: '13.11', model: 'Samsung A57 8/128', qty: 7, sum: null },
  { date: '13.11', model: 'Samsung A18 4/128', qty: 2, sum: null },
  { date: '13.11', model: 'Samsung S26 Ultra 12/512', qty: 2, sum: null },
  { date: '13.11', model: 'Samsung S26 12/256', qty: 1, sum: null },
  { date: '13.11', model: 'Samsung A17 6/128', qty: 2, sum: null },
  { date: '13.11', model: 'MacBook', qty: 1, sum: null },
  { date: '14.11', model: 'Samsung A18 4/128', qty: 3, sum: null },
  { date: '14.11', model: 'Samsung A57 8/256', qty: 1, sum: null },
  { date: '14.11', model: 'Samsung A57 8/128', qty: 3, sum: null },
  { date: '14.11', model: 'Samsung S26 Ultra 12/256', qty: 4, sum: null },
  { date: '15.11', model: 'iPhone 17 Pro Max 512 Silver', qty: 1, sum: null },
  { date: '15.11', model: 'Samsung S26 Ultra 12/512', qty: 1, sum: null },
  { date: '16.11', model: 'Samsung A57 8/128', qty: 9, sum: null },
  { date: '16.11', model: 'Samsung A57 8/256', qty: 2, sum: null },
  { date: '16.11', model: 'iPhone 17 Pro Max 256 Blue', qty: 1, sum: null },
  { date: '16.11', model: 'Samsung S26 Ultra 12/512', qty: 1, sum: null },
  { date: '16.11', model: 'Samsung S26 Ultra 12/256', qty: 1, sum: null },
  { date: '16.11', model: 'Samsung A18 4/128', qty: 1, sum: null },
  { date: '16.11', model: 'MacBook', qty: 2, sum: null },
  { date: '16.11', model: 'Apple Watch (xabarda "iwatch 12/46")', qty: 1, sum: null },
  { date: '17.11', model: 'Samsung A57 128', qty: 7, sum: null },
  { date: '17.11', model: 'Samsung A18', qty: 3, sum: null },
  { date: '17.11', model: 'Samsung S26 12/256', qty: 1, sum: null },
];

/** Modellar bo'yicha guruh: xotira/rangsiz qisqa nom */
function family(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('+')) return 'Aralash (2 tovar bitta summada)';
  if (m.includes('macbook')) return 'MacBook';
  if (m.includes('watch')) return 'Apple Watch';
  if (m.includes('fitbit')) return 'Fitbit';
  if (m.includes('s26 ultra')) return 'Samsung S26 Ultra';
  if (m.includes('s26')) return 'Samsung S26';
  if (m.includes('a57')) return 'Samsung A57';
  if (m.includes('a18')) return 'Samsung A18';
  if (m.includes('a17')) return 'Samsung A17';
  const ip = /iphone (\d+ pro max|\d+ pro|\d+)/i.exec(model);
  return ip ? 'iPhone ' + ip[1].replace(/pro max/i, 'Pro Max').replace(/pro$/i, 'Pro') : model;
}

const STATUS: Record<string, string> = {
  PENDING: 'Kutilmoqda', NEED_TO_BUY: 'Sotib olish kerak', IN_WAREHOUSE: 'Omborda', IN_TRANSIT: "Yo'lda", SOLD: 'Sotildi', MONEY_RECEIVED: 'Pul tushdi',
};
const MONEY = '#,##0';

function header(ws: ExcelJS.Worksheet, cols: { h: string; w: number }[]) {
  ws.columns = cols.map((c) => ({ header: c.h, width: c.w }));
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('chiqish fayli kerak');
  const wb = new ExcelJS.Workbook();

  // ── Novza: kelgan tovarlar ──
  const nz = wb.addWorksheet('Novza kelgan tovarlar');
  header(nz, [{ h: 'Sana', w: 10 }, { h: 'Tovar', w: 42 }, { h: 'Soni', w: 7 }, { h: "Summa (so'm)", w: 16 }, { h: 'Izoh', w: 60 }]);
  for (const r of NOVZA) nz.addRow([r.date, r.model, r.qty, r.sum, r.note || (r.sum === null ? "Summa yozilmagan" : '')]);
  nz.getColumn(4).numFmt = MONEY;
  const main = NOVZA.filter((r) => r.date !== 'sanasiz');
  const dup = NOVZA.filter((r) => r.date === 'sanasiz');
  const q = (xs: Row[]) => xs.reduce((s, r) => s + r.qty, 0);
  const s = (xs: Row[]) => xs.reduce((a, r) => a + (r.sum || 0), 0);
  nz.addRow([]);
  const t1 = nz.addRow(['JAMI', '(sanasiz takrorsiz)', q(main), s(main), `Summasi bor: ${q(main.filter((r) => r.sum !== null))} ta; summasiz: ${q(main.filter((r) => r.sum === null))} ta`]);
  t1.font = { bold: true };
  nz.addRow(['', 'Sanasiz xabar (shubhali takror)', q(dup), null, 'Agar takror bo\'lmasa — jamiga qo\'shiladi']);

  // ── Novza: kunlar bo'yicha ──
  const nd = wb.addWorksheet('Novza kunlar');
  header(nd, [{ h: 'Sana', w: 10 }, { h: 'Tovar soni', w: 11 }, { h: "Summa (so'm)", w: 16 }, { h: 'Summasiz tovar', w: 15 }]);
  for (const d of [...new Set(NOVZA.map((r) => r.date))]) {
    const xs = NOVZA.filter((r) => r.date === d);
    nd.addRow([d, q(xs), s(xs) || null, q(xs.filter((r) => r.sum === null))]);
  }
  nd.getColumn(3).numFmt = MONEY;

  // ── Novza: modellar bo'yicha ──
  const nm = wb.addWorksheet('Novza modellar');
  header(nm, [{ h: 'Model', w: 34 }, { h: 'Soni', w: 8 }, { h: "Summasi bor qism (so'm)", w: 22 }, { h: 'Summasiz', w: 10 }]);
  const fam = new Map<string, Row[]>();
  for (const r of main) fam.set(family(r.model), [...(fam.get(family(r.model)) || []), r]);
  for (const [k, xs] of [...fam.entries()].sort((a, b) => q(b[1]) - q(a[1]))) nm.addRow([k, q(xs), s(xs) || null, q(xs.filter((r) => r.sum === null))]);
  nm.getColumn(3).numFmt = MONEY;
  nm.addRow([]);
  nm.addRow(['JAMI (sanasiz xabarsiz)', q(main), s(main), q(main.filter((r) => r.sum === null))]).font = { bold: true };

  // ── Rebus (saytdagi cheklar) ──
  const deals = await prisma.deal.findMany({
    where: { store: { name: { contains: 'rebus', mode: 'insensitive' } } },
    orderBy: { date: 'asc' },
    select: {
      dealNumber: true, date: true, status: true, approvalStatus: true, withdrawnLimit: true, calculatedAmount: true, profit: true, salePrice: true, productName: true,
      provider: { select: { name: true } }, buyer: { select: { name: true } }, items: { orderBy: { position: 'asc' }, select: { productName: true, color: true, storageGb: true, quantity: true, imei1: true } },
    },
  });
  const rb = wb.addWorksheet('Rebus');
  header(rb, [
    { h: 'Chek', w: 8 }, { h: 'Sana', w: 11 }, { h: 'Provayder', w: 14 }, { h: 'Tovar', w: 46 }, { h: 'Soni', w: 6 }, { h: 'Holat', w: 16 },
    { h: 'Yechilgan limit', w: 15 }, { h: 'Mijozga berilgan', w: 16 }, { h: 'Sotuv narxi', w: 13 }, { h: 'Foyda', w: 13 }, { h: 'Xaridor', w: 12 }, { h: 'IMEI', w: 18 },
  ]);
  const qtyOf = (d: (typeof deals)[number]) => d.items.reduce((a, i) => a + (i.quantity || 1), 0) || 1;
  for (const d of deals) {
    const name = d.items.length ? d.items.map((i) => [i.productName, i.color].filter(Boolean).join(' ')).join('; ') : d.productName || '';
    rb.addRow([
      `#${d.dealNumber}`, d.date, d.provider.name, name, qtyOf(d), STATUS[d.status] || d.status,
      Number(d.withdrawnLimit), Number(d.calculatedAmount), Number(d.salePrice) || null, Number(d.profit), d.buyer?.name || '', d.items.map((i) => i.imei1).filter(Boolean).join(', '),
    ]);
  }
  rb.getColumn(2).numFmt = 'dd.mm.yyyy';
  for (const c of [7, 8, 9, 10]) rb.getColumn(c).numFmt = MONEY;
  rb.addRow([]);
  const groups: [string, string[]][] = [
    ['Qo\'limizda (omborda)', ['IN_WAREHOUSE', 'IN_TRANSIT']],
    ['Hali kelmagan (kutilmoqda)', ['PENDING', 'NEED_TO_BUY']],
    ['Sotilgan', ['SOLD', 'MONEY_RECEIVED']],
  ];
  for (const [label, st] of groups) {
    const xs = deals.filter((d) => st.includes(d.status));
    const r = rb.addRow([label, '', '', `${xs.length} chek`, xs.reduce((a, d) => a + qtyOf(d), 0), '',
      xs.reduce((a, d) => a + Number(d.withdrawnLimit), 0), xs.reduce((a, d) => a + Number(d.calculatedAmount), 0),
      xs.reduce((a, d) => a + Number(d.salePrice), 0) || null, xs.reduce((a, d) => a + Number(d.profit), 0)]);
    r.font = { bold: true };
  }
  const tot = rb.addRow(['JAMI', '', '', `${deals.length} chek`, deals.reduce((a, d) => a + qtyOf(d), 0), '',
    deals.reduce((a, d) => a + Number(d.withdrawnLimit), 0), deals.reduce((a, d) => a + Number(d.calculatedAmount), 0),
    deals.reduce((a, d) => a + Number(d.salePrice), 0) || null, deals.reduce((a, d) => a + Number(d.profit), 0)]);
  tot.font = { bold: true };

  // ── Xulosa ──
  const x = wb.addWorksheet('Xulosa');
  header(x, [{ h: "Ko'rsatkich", w: 52 }, { h: 'Qiymat', w: 18 }]);
  const add = (a: string, b: unknown, money = false) => { const r = x.addRow([a, b]); if (money) r.getCell(2).numFmt = MONEY; };
  add("NOVZA (Telegram ro'yxati, 05–17.11)", '');
  add('Kelgan tovar (sanasiz takror xabarsiz)', `${q(main)} ta`);
  add("Summasi yozilgan tovarlar", `${q(main.filter((r) => r.sum !== null))} ta`);
  add("Ularning summasi (so'm)", s(main), true);
  add('Summasi yozilmagan tovarlar (10.11 dan keyin)', `${q(main.filter((r) => r.sum === null))} ta`);
  add("Sanasiz xabar (17.11 bilan bir xil — takror bo'lishi mumkin)", `${q(dup)} ta`);
  add('', '');
  add('REBUS (saytdagi "Iman rebus" cheklari)', '');
  for (const [label, st] of groups) {
    const xs = deals.filter((d) => st.includes(d.status));
    add(`${label}: ${xs.length} chek, ${xs.reduce((a, d) => a + qtyOf(d), 0)} dona — limit`, xs.reduce((a, d) => a + Number(d.withdrawnLimit), 0), true);
  }
  add(`Jami: ${deals.length} chek — yechilgan limit`, deals.reduce((a, d) => a + Number(d.withdrawnLimit), 0), true);
  add('Jami — mijozga berilgan', deals.reduce((a, d) => a + Number(d.calculatedAmount), 0), true);
  add('Jami — bizning foyda', deals.reduce((a, d) => a + Number(d.profit), 0), true);
  x.getRow(2).font = { bold: true };
  x.getRow(9).font = { bold: true };
  // Xulosa birinchi varaq bo'lsin
  (wb as any)._worksheets = [undefined, x, nz, nd, nm, rb].map((w, i) => (w ? Object.assign(w, { id: i, orderNo: i }) : w));

  await wb.xlsx.writeFile(out);
  console.log(JSON.stringify({ novzaQty: q(main), novzaPriced: q(main.filter((r) => r.sum !== null)), novzaSum: s(main), novzaUnpriced: q(main.filter((r) => r.sum === null)), dupQty: q(dup), rebusDeals: deals.length }));
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
