/**
 * Bitta do'konning HAMMA cheklari (FAQAT O'QIYDI) — egasi so'rovi bilan Google Sheets'ga yuklash uchun.
 *   tsrun scripts/report-store-deals-xlsx.ts <chiqish.xlsx> --store="Denov"
 * Varaqlar: Xulosa (holat / provayder / agentlik bo'yicha), Cheklar (har chek — bitta qator), Tovarlar (har tovar — bitta qator).
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma';

const arg = process.argv.find((a) => a.startsWith('--store='));
const STORE = (arg ? arg.slice(8) : 'Denov').replace(/^"|"$/g, '');
const STATUS: Record<string, string> = {
  PENDING: 'Kutilmoqda', NEED_TO_BUY: 'Sotib olish kerak', IN_WAREHOUSE: 'Omborda', IN_TRANSIT: "Yo'lda", SOLD: 'Sotildi', MONEY_RECEIVED: 'Pul tushdi',
};
const APPROVAL: Record<string, string> = { APPROVED: 'Tasdiqlangan', PENDING_APPROVAL: 'Tasdiq kutmoqda', REJECTED: 'Rad etilgan' };
const MONEY = '#,##0';
const n = (v: unknown) => Number(v) || 0;

function head(ws: ExcelJS.Worksheet, cols: [string, number][]) {
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  const r = ws.getRow(1);
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function main() {
  const out = process.argv[2];
  if (!out || out.startsWith('--')) throw new Error('chiqish fayli kerak');
  const store = await prisma.store.findFirst({ where: { name: { equals: STORE, mode: 'insensitive' } } });
  if (!store) throw new Error(`"${STORE}" do'koni topilmadi`);
  const deals = await prisma.deal.findMany({
    where: { storeId: store.id },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
    include: {
      provider: { select: { name: true } }, agency: { select: { name: true } }, agent: { select: { name: true } },
      buyer: { select: { name: true } }, registrator: { select: { fullName: true } }, createdBy: { select: { fullName: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });
  const wb = new ExcelJS.Workbook();
  const x = wb.addWorksheet('Xulosa');
  const ch = wb.addWorksheet('Cheklar');
  const it = wb.addWorksheet('Tovarlar');

  head(ch, [
    ['Chek', 8], ['Sana', 11], ['Provayder', 14], ['Agent', 13], ['Operator', 14], ['Mijoz', 22], ['Telefon', 18], ['Shartnoma', 14],
    ['Tovar', 44], ['Dona', 6], ['IMEI', 34], ['Tovar holati', 16], ['Tasdiq', 15], ['Mijoz limiti', 14], ['Yechilgan limit', 15],
    ['Diskont %', 9], ['Mijozga berilgan', 16], ['Agentga', 13], ['Tannarx', 14], ['Foyda', 13], ['Daftar', 7],
    ['Pul tushgan (daftar)', 18], ['Qurilma narxi (daftar)', 18], ['Qurilma olingan', 15], ['Sotuv narxi', 13], ['Xaridor', 14],
    ['Xaridordan olingan', 16], ['Qarz qoldig\'i', 14], ['Kiritgan', 18], ['Izoh', 40],
  ]);
  for (const d of deals) {
    const qty = d.items.reduce((a, i) => a + (i.quantity || 1), 0) || d.quantity || 1;
    const prod = d.items.length ? d.items.map((i) => [i.productName, i.color].filter(Boolean).join(' ') + ((i.quantity || 1) > 1 ? ` ×${i.quantity}` : '')).join('; ') : d.productName || '';
    const imei = d.items.length ? d.items.map((i) => i.imei1).filter(Boolean).join(', ') : d.imeiBarcode || '';
    ch.addRow([
      `#${d.dealNumber}`, d.date, d.provider.name, d.agency?.name || '', d.agent?.name || '', d.customerName || '', d.customerPhone1 || '', d.contractNumber || '',
      prod, qty, imei, STATUS[d.status] || d.status, APPROVAL[d.approvalStatus] || d.approvalStatus, n(d.customerLimit), n(d.withdrawnLimit),
      Math.round(n(d.purchaseDiscountPct) * 1000) / 10, n(d.calculatedAmount), n(d.agentAmount), n(d.totalPurchaseCost), n(d.profit), d.isDaftar ? 'Ha' : "Yo'q",
      d.daftarMoneyAt || null, d.devicePurchaseAmount === null ? null : n(d.devicePurchaseAmount), d.devicePurchasedAt || null, n(d.salePrice) || null, d.buyer?.name || '',
      n(d.receivedFromBuyer) || null, n(d.debtRemainder) || null, d.registrator?.fullName || d.createdBy?.fullName || d.sellerName || '', d.note || '',
    ]);
  }
  for (const c of [2, 22, 24]) ch.getColumn(c).numFmt = 'dd.mm.yyyy';
  for (const c of [14, 15, 17, 18, 19, 20, 23, 25, 27, 28]) ch.getColumn(c).numFmt = MONEY;
  ch.addRow([]);
  const sum = (f: (d: (typeof deals)[number]) => unknown) => deals.reduce((a, d) => a + n(f(d)), 0);
  const tr = ch.addRow(['JAMI', '', '', '', '', `${deals.length} chek`, '', '', '', deals.reduce((a, d) => a + (d.items.reduce((s, i) => s + (i.quantity || 1), 0) || 1), 0), '', '', '',
    sum((d) => d.customerLimit), sum((d) => d.withdrawnLimit), '', sum((d) => d.calculatedAmount), sum((d) => d.agentAmount), sum((d) => d.totalPurchaseCost), sum((d) => d.profit), '',
    '', sum((d) => d.devicePurchaseAmount) || null, '', sum((d) => d.salePrice) || null, '', sum((d) => d.receivedFromBuyer) || null, sum((d) => d.debtRemainder) || null]);
  tr.font = { bold: true };
  ch.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 30 } };

  head(it, [['Chek', 8], ['Sana', 11], ['Tovar', 34], ['Rang', 14], ['Xotira', 10], ['Dona', 6], ['IMEI 1', 18], ['IMEI 2', 18], ['Tovar narxi', 13], ['Tovar holati', 16]]);
  for (const d of deals) {
    if (!d.items.length) it.addRow([`#${d.dealNumber}`, d.date, d.productName || '(tovar yozilmagan)', d.color || '', d.storageGb || '', d.quantity || 1, d.imeiBarcode || '', d.imei2 || '', null, STATUS[d.status] || d.status]);
    for (const i of d.items) it.addRow([`#${d.dealNumber}`, d.date, i.productName, i.color || '', i.storageGb || '', i.quantity || 1, i.imei1 || '', i.imei2 || '', n(i.price) || null, STATUS[d.status] || d.status]);
  }
  it.getColumn(2).numFmt = 'dd.mm.yyyy';
  it.getColumn(9).numFmt = MONEY;

  head(x, [["Ko'rsatkich", 40], ['Chek', 8], ['Yechilgan limit', 16], ['Mijozga berilgan', 16], ['Agentga', 14], ['Foyda', 14]]);
  const row = (label: string, xs: typeof deals, bold = false) => {
    const r = x.addRow([label, xs.length, xs.reduce((a, d) => a + n(d.withdrawnLimit), 0), xs.reduce((a, d) => a + n(d.calculatedAmount), 0), xs.reduce((a, d) => a + n(d.agentAmount), 0), xs.reduce((a, d) => a + n(d.profit), 0)]);
    if (bold) r.font = { bold: true };
  };
  row(`${store.name} — JAMI${store.isActive ? '' : " (do'kon yashirilgan, cheklar saqlangan)"}`, deals, true);
  x.addRow([]);
  x.addRow(['Tovar holati bo\'yicha']).font = { bold: true };
  for (const st of Object.keys(STATUS)) { const xs = deals.filter((d) => d.status === st); if (xs.length) row('  ' + STATUS[st], xs); }
  x.addRow([]);
  x.addRow(['Tasdiq bo\'yicha']).font = { bold: true };
  for (const st of Object.keys(APPROVAL)) { const xs = deals.filter((d) => d.approvalStatus === st); if (xs.length) row('  ' + APPROVAL[st], xs); }
  x.addRow([]);
  x.addRow(['Provayder bo\'yicha']).font = { bold: true };
  for (const p of [...new Set(deals.map((d) => d.provider.name))]) row('  ' + p, deals.filter((d) => d.provider.name === p));
  x.addRow([]);
  x.addRow(['Agent bo\'yicha']).font = { bold: true };
  for (const a of [...new Set(deals.map((d) => d.agency?.name || '—'))]) row('  ' + a, deals.filter((d) => (d.agency?.name || '—') === a));
  for (const c of [3, 4, 5, 6]) x.getColumn(c).numFmt = MONEY;
  (wb as any)._worksheets = [undefined, x, ch, it].map((w, i) => (w ? Object.assign(w, { id: i, orderNo: i }) : w));
  await wb.xlsx.writeFile(out);
  console.log(JSON.stringify({ store: store.name, deals: deals.length, from: deals[0]?.date, to: deals[deals.length - 1]?.date, limit: sum((d) => d.withdrawnLimit), payout: sum((d) => d.calculatedAmount), profit: sum((d) => d.profit), byStatus: deals.reduce((m: any, d) => ((m[STATUS[d.status] || d.status] = (m[STATUS[d.status] || d.status] || 0) + 1), m), {}), daftar: deals.filter((d) => d.isDaftar).length }));
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
