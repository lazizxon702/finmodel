/**
 * 23.11.2026 holati (egasi: "Samsung'lar hammasi kelgan, omborda Samsung qolmagan") — FAQAT O'QIYDI.
 *   tsrun scripts/report-holat-2311-xlsx.ts <chiqish.xlsx>
 * Saytdagi ochiq cheklar (Kutilmoqda / Sotib olish kerak / Omborda / Yo'lda) ikkiga bo'linadi:
 *   • Samsung — egasi aytishicha kelgan va sotilgan: saytda hali yopilmagan (xaridor va narx kerak);
 *   • qolganlari — haqiqatan ham hali kutilmoqda yoki omborda.
 * Rebus ("Iman rebus") — alohida varaq. Bazaga hech narsa yozilmaydi.
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma';

const STATUS: Record<string, string> = { PENDING: 'Kutilmoqda', NEED_TO_BUY: 'Sotib olish kerak', IN_WAREHOUSE: 'Omborda', IN_TRANSIT: "Yo'lda", SOLD: 'Sotildi', MONEY_RECEIVED: 'Pul tushdi' };
const OPEN = ['PENDING', 'NEED_TO_BUY', 'IN_WAREHOUSE', 'IN_TRANSIT'];
const isSam = (s: string) => /samsung|galaxy|самсунг/i.test(s);
const MONEY = '#,##0';

function head(ws: ExcelJS.Worksheet, cols: [string, number][]) {
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function main() {
  const deals = await prisma.deal.findMany({
    where: { approvalStatus: { not: 'REJECTED' } },
    orderBy: { date: 'asc' },
    select: {
      dealNumber: true, date: true, status: true, approvalStatus: true, withdrawnLimit: true, calculatedAmount: true, totalPurchaseCost: true, profit: true, salePrice: true, productName: true,
      store: { select: { name: true } }, provider: { select: { name: true } }, buyer: { select: { name: true } },
      items: { orderBy: { position: 'asc' }, select: { productName: true, imei1: true, quantity: true } },
    },
  });
  type D = (typeof deals)[number];
  const names = (d: D) => (d.items.length ? d.items.map((i) => i.productName) : [d.productName || '']);
  const qty = (d: D) => d.items.reduce((a, i) => a + (i.quantity || 1), 0) || 1;
  const prod = (d: D) => (d.items.length ? d.items.map((i) => i.productName + ((i.quantity || 1) > 1 ? ` ×${i.quantity}` : '')).join('; ') : d.productName || '—');
  const open = deals.filter((d) => OPEN.includes(d.status));
  const samOpen = open.filter((d) => names(d).every((n) => isSam(n)) && names(d).some(Boolean));
  const otherOpen = open.filter((d) => !samOpen.includes(d));
  const sum = (xs: D[], f: (d: D) => number) => xs.reduce((a, d) => a + f(d), 0);
  const cost = (d: D) => Number(d.totalPurchaseCost);
  const imeiCount = new Map<string, number>();
  for (const d of samOpen) for (const i of d.items) if (i.imei1) imeiCount.set(i.imei1, (imeiCount.get(i.imei1) || 0) + 1);

  const wb = new ExcelJS.Workbook();
  const x = wb.addWorksheet('Xulosa');
  const sam = wb.addWorksheet('Samsung — yopish kerak');
  const oth = wb.addWorksheet('Qolgan ochiq cheklar');
  const rb = wb.addWorksheet('Rebus');

  // Samsung: egasi bo'yicha kelgan va sotilgan, saytda yopilmagan
  head(sam, [['Chek', 8], ['Sana', 11], ["Do'kon", 18], ['Tovar', 52], ['Dona', 6], ['IMEI', 34], ['Saytdagi holat', 16], ['Tannarx', 13], ["XARIDOR (to'ldiring)", 20], ["SOTUV NARXI (to'ldiring)", 22], ['Izoh', 34]]);
  for (const d of samOpen) {
    const imeis = d.items.map((i) => i.imei1).filter(Boolean) as string[];
    const notes = [
      ...(imeis.some((v) => (imeiCount.get(v) || 0) > 1) ? ['IMEI boshqa chekda ham bor'] : []),
      ...(d.approvalStatus !== 'APPROVED' ? ['Chek hali tasdiqlanmagan'] : []),
      ...(!imeis.length ? ["IMEI yo'q"] : []),
    ];
    const r = sam.addRow([`#${d.dealNumber}`, d.date, d.store.name, prod(d), qty(d), imeis.join(', '), STATUS[d.status], cost(d), '', '', notes.join('; ')]);
    for (const c of [9, 10]) r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7D6' } };
  }
  sam.getColumn(2).numFmt = 'dd.mm.yyyy';
  sam.getColumn(8).numFmt = MONEY;
  sam.addRow([]);
  sam.addRow(['JAMI', '', '', `${samOpen.length} chek`, sum(samOpen, qty), '', '', sum(samOpen, cost)]).font = { bold: true };

  // Qolgan ochiq cheklar (Samsung emas)
  head(oth, [['Chek', 8], ['Sana', 11], ["Do'kon", 18], ['Provayder', 14], ['Tovar', 46], ['Dona', 6], ['Holat', 16], ['Kun', 6], ['Yechilgan limit', 15], ['Tannarx', 13], ['Foyda', 13]]);
  const now = Date.now();
  for (const d of otherOpen) {
    oth.addRow([`#${d.dealNumber}`, d.date, d.store.name, d.provider.name, prod(d), qty(d), STATUS[d.status], Math.floor((now - d.date.getTime()) / 86_400_000), Number(d.withdrawnLimit), cost(d), Number(d.profit)]);
  }
  oth.getColumn(2).numFmt = 'dd.mm.yyyy';
  for (const c of [9, 10, 11]) oth.getColumn(c).numFmt = MONEY;
  oth.addRow([]);
  for (const st of OPEN) {
    const xs = otherOpen.filter((d) => d.status === st);
    if (xs.length) oth.addRow([STATUS[st], '', '', '', `${xs.length} chek`, sum(xs, qty), '', '', sum(xs, (d) => Number(d.withdrawnLimit)), sum(xs, cost), sum(xs, (d) => Number(d.profit))]).font = { bold: true };
  }
  oth.addRow(['JAMI', '', '', '', `${otherOpen.length} chek`, sum(otherOpen, qty), '', '', sum(otherOpen, (d) => Number(d.withdrawnLimit)), sum(otherOpen, cost), sum(otherOpen, (d) => Number(d.profit))]).font = { bold: true };

  // Rebus
  const reb = deals.filter((d) => /rebus/i.test(d.store.name));
  head(rb, [['Chek', 8], ['Sana', 11], ['Provayder', 14], ['Tovar', 46], ['Dona', 6], ['Holat (sayt)', 16], ['Bugungi holat', 30], ['Yechilgan limit', 15], ['Mijozga berilgan', 16], ['Sotuv narxi', 13], ['Foyda', 13], ['Xaridor', 12]]);
  const rebNow = (d: D) => (d.status === 'SOLD' || d.status === 'MONEY_RECEIVED' ? 'Sotilgan' : samOpen.includes(d) ? "Samsung — kelgan va sotilgan (saytda yopilmagan)" : OPEN.includes(d.status) && d.status !== 'IN_WAREHOUSE' ? 'Hali kelmagan' : 'Omborda');
  for (const d of reb) rb.addRow([`#${d.dealNumber}`, d.date, d.provider.name, prod(d), qty(d), STATUS[d.status], rebNow(d), Number(d.withdrawnLimit), Number(d.calculatedAmount), Number(d.salePrice) || null, Number(d.profit), d.buyer?.name || '']);
  rb.getColumn(2).numFmt = 'dd.mm.yyyy';
  for (const c of [8, 9, 10, 11]) rb.getColumn(c).numFmt = MONEY;
  rb.addRow([]);
  for (const g of ['Omborda', 'Hali kelmagan', "Samsung — kelgan va sotilgan (saytda yopilmagan)", 'Sotilgan']) {
    const xs = reb.filter((d) => rebNow(d) === g);
    if (xs.length) rb.addRow([g, '', '', `${xs.length} chek`, sum(xs, qty), '', '', sum(xs, (d) => Number(d.withdrawnLimit)), sum(xs, (d) => Number(d.calculatedAmount)), sum(xs, (d) => Number(d.salePrice)) || null, sum(xs, (d) => Number(d.profit))]).font = { bold: true };
  }
  rb.addRow(['JAMI', '', '', `${reb.length} chek`, sum(reb, qty), '', '', sum(reb, (d) => Number(d.withdrawnLimit)), sum(reb, (d) => Number(d.calculatedAmount)), sum(reb, (d) => Number(d.salePrice)) || null, sum(reb, (d) => Number(d.profit))]).font = { bold: true };

  // Xulosa
  head(x, [["Ko'rsatkich", 62], ['Chek', 8], ['Dona', 8], ["Summa (so'm)", 18]]);
  const add = (a: string, b: unknown = '', c: unknown = '', s: number | null = null, bold = false) => {
    const r = x.addRow([a, b, c, s]);
    r.getCell(4).numFmt = MONEY;
    if (bold) r.font = { bold: true };
  };
  const wh = otherOpen.filter((d) => d.status === 'IN_WAREHOUSE' || d.status === 'IN_TRANSIT');
  const wait = otherOpen.filter((d) => d.status === 'PENDING' || d.status === 'NEED_TO_BUY');
  add("SAYTDAGI OCHIQ CHEKLAR (23.11)", open.length, sum(open, qty), sum(open, cost), true);
  add("  Samsung — siz aytgandek kelgan va sotilgan, saytda yopilmagan (tannarx)", samOpen.length, sum(samOpen, qty), sum(samOpen, cost));
  add('  Qolgan — omborda (Samsung emas), tannarx', wh.length, sum(wh, qty), sum(wh, cost));
  add('  Qolgan — hali kelmagan (Samsung emas), tannarx', wait.length, sum(wait, qty), sum(wait, cost));
  add('');
  add("BUGUNGI HAQIQIY HOLAT (Samsung yopilgan deb)", '', '', null, true);
  add('  Omborda turgan tovar (tannarx)', wh.length, sum(wh, qty), sum(wh, cost));
  add('  Hali kelishi kerak (tannarx)', wait.length, sum(wait, qty), sum(wait, cost));
  add('  Shulardan 01.11 dagi tovar nomi yozilmagan eski cheklar', wait.filter((d) => !names(d).some(Boolean)).length, '', sum(wait.filter((d) => !names(d).some(Boolean)), cost));
  add('  Sotilgan, lekin saytda narxi yo\'q Samsung (xaridor va narx kerak)', samOpen.length, sum(samOpen, qty), sum(samOpen, cost));
  add('');
  add("HALI KELMAGAN — DO'KONLAR BO'YICHA (Trust, Qodir aka, Green Bazar va h.k. — odatda tovarsiz cheklar)", '', '', null, true);
  const byStore = new Map<string, D[]>();
  for (const d of wait) byStore.set(d.store.name, [...(byStore.get(d.store.name) || []), d]);
  for (const [s, xs] of [...byStore.entries()].sort((a, b) => sum(b[1], cost) - sum(a[1], cost))) add(`  ${s}`, xs.length, sum(xs, qty), sum(xs, cost));
  add('');
  add('REBUS', reb.length, sum(reb, qty), sum(reb, (d) => Number(d.withdrawnLimit)), true);
  for (const g of ['Omborda', 'Hali kelmagan', "Samsung — kelgan va sotilgan (saytda yopilmagan)", 'Sotilgan']) {
    const xs = reb.filter((d) => rebNow(d) === g);
    if (xs.length) add(`  ${g} — yechilgan limit`, xs.length, sum(xs, qty), sum(xs, (d) => Number(d.withdrawnLimit)));
  }
  (wb as any)._worksheets = [undefined, x, sam, oth, rb].map((w, i) => (w ? Object.assign(w, { id: i, orderNo: i }) : w));
  await wb.xlsx.writeFile(process.argv[2]);
  console.log(JSON.stringify({
    open: [open.length, sum(open, qty), sum(open, cost)], sam: [samOpen.length, sum(samOpen, qty), sum(samOpen, cost)],
    wh: [wh.length, sum(wh, qty), sum(wh, cost)], wait: [wait.length, sum(wait, qty), sum(wait, cost)],
    waitNoName: [wait.filter((d) => !names(d).some(Boolean)).length, sum(wait.filter((d) => !names(d).some(Boolean)), cost)],
    whList: wh.map((d) => `#${d.dealNumber} ${d.store.name}: ${prod(d)}`),
    reb: reb.map((d) => `#${d.dealNumber} ${rebNow(d)}`),
  }, null, 1));
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
