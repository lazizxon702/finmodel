/**
 * FAQAT O'QIYDI: bitta xaridor bo'yicha to'liq hisobot (xlsx) — sotuvlar, har bir chek/tovar, to'lovlar, qarz.
 *   tsrun scripts/report-buyer-xlsx.ts <chiqish.xlsx> [xaridor nomi, standart: Umirzoq]
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};
const N = (v: unknown) => Math.round(Number(v) || 0);
const tk = (v: Date) => new Date(v.getTime() + 5 * 3600e3);
const dmy = (v: Date | null | undefined) => (v ? tk(v).toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const ACCOUNT: Record<string, string> = { CASH: 'Naqd', BANK_CARD: 'Karta', SETTLEMENT_ACCOUNT: 'Hisob-raqam' };
const PSTATUS: Record<string, string> = { PAID: "To'liq to'langan", PARTIAL: "Qisman to'langan", DEBT: 'Qarz' };
const PTYPE: Record<string, string> = { CASH: 'Naqd', BANK_CARD: 'Karta', SETTLEMENT_ACCOUNT: 'Hisob-raqam', DEBT: 'Nasiya' };
type Row = (string | number | null)[];

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, sub: string, blocks: { head?: string; cols?: string[]; rows: Row[]; note?: string }[], firstWidth = 14) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([sub]).font = { italic: true, color: { argb: 'FF666666' } };
  for (const b of blocks) {
    ws.addRow([]);
    if (b.head) ws.addRow([b.head]).font = { bold: true, size: 12, color: { argb: 'FF1F3A8A' } };
    if (b.note) ws.addRow([b.note]).font = { italic: true, color: { argb: 'FF9A3412' } };
    if (b.cols) {
      const r = ws.addRow(b.cols);
      r.font = { bold: true };
      r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }; });
    }
    for (const row of b.rows) {
      const r = ws.addRow(row);
      r.eachCell((c) => { if (typeof c.value === 'number') c.numFmt = '#,##0'; });
      if (String(row[0] ?? '').startsWith('JAMI')) r.font = { bold: true };
    }
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? firstWidth : 18; });
}

async function main() {
  const out = process.argv[2];
  const buyerName = process.argv[3] || 'Umirzoq';
  if (!out) throw new Error("Chiqish fayli ko'rsatilmagan");
  const buyer = await retry(() => prisma.buyer.findFirst({ where: { name: { equals: buyerName, mode: 'insensitive' } } }));
  if (!buyer) throw new Error(`Xaridor topilmadi: ${buyerName}`);

  const sales: any[] = await retry(() => prisma.sale.findMany({
    where: { buyerId: buyer.id },
    include: {
      payments: { include: { ddsTransaction: true }, orderBy: { createdAt: 'asc' } },
      deals: { include: { store: true, provider: true, agency: true, agent: true, items: true }, orderBy: { dealNumber: 'asc' } },
    },
    orderBy: [{ saleDate: 'asc' }, { saleNumber: 'asc' }],
  }));
  // Eski (sotuvga bog'lanmagan) bitta tovarli sotuvlar
  const legacy: any[] = await retry(() => prisma.deal.findMany({
    where: { buyerId: buyer.id, saleId: null, status: 'SOLD' }, include: { store: true, provider: true, agency: true, agent: true, items: true }, orderBy: { dealNumber: 'asc' },
  }));
  // DDS'da shu xaridor nomi bilan kelgan kirimlar (ma'lumot uchun)
  const dds: any[] = await retry(() => prisma.ddsTransaction.findMany({ where: { type: 'INCOME' }, orderBy: { dateTime: 'asc' } }));
  const nameRe = /umirzo[qk]|umurzo[qk]|умирзо[кқ]|умурзо[кқ]/i;
  const ddsBuyer = /umirzoq/i.test(buyer.name) ? dds.filter((t) => nameRe.test(`${t.sourcePerson} ${t.description || ''} ${t.categoryName}`)) : dds.filter((t) => `${t.sourcePerson} ${t.description || ''}`.toLowerCase().includes(buyer.name.toLowerCase()));

  const sub = `Hisobot vaqti: ${tk(new Date()).toISOString().slice(0, 16).replace('T', ' ')} (Toshkent). Manba: sayt bazasi. Summalar so'mda.`;
  const sum = (rows: any[], f: string) => rows.reduce((s, d) => s + (Number(d[f]) || 0), 0);
  const units = (d: any) => {
    const items = d.items || [];
    let n = 0;
    for (const it of items) {
      const parts = String(it.productName || '').split('+');
      n += parts.length > 1 ? parts.reduce((s: number, p: string) => s + (Number((p.match(/(\d+)\s*(ta|шт)/i) || [])[1]) || 1), 0) : Number(it.quantity) || 1;
    }
    return n || Number(d.quantity) || 1;
  };
  const imeis = (d: any) => [...new Set(`${d.imeiBarcode || ''} ${d.imei2 || ''} ${(d.items || []).map((i: any) => `${i.imei1 || ''} ${i.imei2 || ''}`).join(' ')}`.match(/\d{14,16}/g) || [])].join(', ');
  const allDeals: any[] = [...sales.flatMap((s) => s.deals.map((d: any) => ({ ...d, _sale: s }))), ...legacy.map((d) => ({ ...d, _sale: null }))];
  const totalPrice = sum(sales, 'totalPrice') + sum(legacy, 'salePrice');
  const totalReceived = sum(sales, 'receivedAmount') + sum(legacy, 'receivedFromBuyer');
  const totalDebt = sum(sales, 'debtRemainder') + sum(legacy, 'debtRemainder');
  const totalUnits = allDeals.reduce((s, d) => s + units(d), 0);
  const wb = new ExcelJS.Workbook();

  // ── 1. XULOSA ──
  const byDay = new Map<string, { sales: number; deals: number; units: number; price: number }>();
  for (const s of sales) {
    const k = dmy(s.saleDate);
    const g = byDay.get(k) || { sales: 0, deals: 0, units: 0, price: 0 };
    g.sales++; g.deals += s.deals.length; g.units += s.deals.reduce((a: number, d: any) => a + units(d), 0); g.price += Number(s.totalPrice);
    byDay.set(k, g);
  }
  const allPays = sales.flatMap((s) => s.payments.map((p: any) => ({ ...p, _sale: s })));
  addSheet(wb, 'Xulosa', `${buyer.name.toUpperCase()} — UMUMIY XULOSA`, sub, [
    {
      cols: ["Ko'rsatkich", 'Qiymat'],
      rows: [
        ['Sotuvlar soni', sales.length + legacy.length], ['Cheklar soni', allDeals.length], ['Telefon / tovar (dona)', totalUnits],
        ['Jami sotuv narxi', N(totalPrice)], ['Xaridor bergan pul', N(totalReceived)], ['QOLGAN QARZ', N(totalDebt)],
        ['Tovarlar tannarxi (bizga tushgani)', N(allDeals.reduce((s, d) => s + Number(d.totalPurchaseCost), 0))],
        ['Foyda (sotuv narxi − tannarx)', N(allDeals.reduce((s, d) => s + Number(d.profit), 0))],
        ["To'liq to'langan sotuvlar", sales.filter((s) => s.paymentStatus === 'PAID').length], ['Qarzi bor sotuvlar', sales.filter((s) => Number(s.debtRemainder) > 0).length],
      ],
    },
    {
      head: "SOTUVLAR KUNLAR BO'YICHA", cols: ['Sotilgan sana', 'Sotuvlar', 'Cheklar', 'Dona', 'Sotuv narxi'],
      rows: [...[...byDay].map(([k, g]) => [k, g.sales, g.deals, g.units, N(g.price)] as Row), ['JAMI', sales.length, sales.reduce((a, s) => a + s.deals.length, 0), sales.reduce((a, s) => a + s.deals.reduce((b: number, d: any) => b + units(d), 0), 0), N(sum(sales, 'totalPrice'))]],
    },
  ], 38);

  // ── 2. CHEKLAR / TOVARLAR ──
  addSheet(wb, 'Cheklar va tovarlar', `${buyer.name} — HAR BIR CHEK VA TOVAR`, sub, [{
    cols: ['Sotuv №', 'Sotilgan sana', 'Chek №', 'Chek sanasi', "Do'kon", 'Provayder', 'Agentlik', 'Operator', 'Mijoz (chek egasi)', 'Tovar', 'Dona', 'IMEI',
      'Yechilgan limit', 'Tannarx', 'Sotuv narxi', 'Olingan pul', 'Qolgan qarz', 'Foyda'],
    rows: [
      ...allDeals.map((d) => [
        d._sale?.saleNumber ?? 'eski', dmy(d._sale?.saleDate || d.saleDate), d.dealNumber, dmy(d.date), d.store?.name || '', d.provider?.name || '', d.agency?.name || '', d.agent?.name || '',
        d.customerName || '', d.productName || '', units(d), imeis(d), N(d.withdrawnLimit), N(d.totalPurchaseCost), N(d.salePrice), N(d.receivedFromBuyer), N(d.debtRemainder), N(d.profit),
      ] as Row),
      [`JAMI: ${allDeals.length} chek`, '', '', '', '', '', '', '', '', '', totalUnits, '', N(sum(allDeals, 'withdrawnLimit')), N(sum(allDeals, 'totalPurchaseCost')), N(sum(allDeals, 'salePrice')), N(sum(allDeals, 'receivedFromBuyer')), N(sum(allDeals, 'debtRemainder')), N(sum(allDeals, 'profit'))],
    ],
  }]);

  // ── 3. SOTUVLAR ──
  addSheet(wb, 'Sotuvlar', `${buyer.name} — SOTUVLAR RO'YXATI`, sub, [{
    cols: ['Sotuv №', 'Sana', 'Cheklar', 'Dona', 'Tovarlar', 'Sotuv narxi', 'Olingan pul', 'Qolgan qarz', 'Holat', "To'lov turi", "To'lov muddati", 'Izoh'],
    rows: [
      ...sales.map((s) => [s.saleNumber, dmy(s.saleDate), s.deals.map((d: any) => '#' + d.dealNumber).join(', '), s.deals.reduce((a: number, d: any) => a + units(d), 0),
        s.deals.map((d: any) => d.productName).join(' | '), N(s.totalPrice), N(s.receivedAmount), N(s.debtRemainder), PSTATUS[s.paymentStatus] || s.paymentStatus, PTYPE[s.paymentType] || s.paymentType, dmy(s.debtDueDate), s.note || ''] as Row),
      ...legacy.map((d) => ['eski', dmy(d.saleDate), '#' + d.dealNumber, units(d), d.productName || '', N(d.salePrice), N(d.receivedFromBuyer), N(d.debtRemainder), '', '', dmy(d.debtDueDate), ''] as Row),
      [`JAMI: ${sales.length + legacy.length} sotuv`, '', '', totalUnits, '', N(totalPrice), N(totalReceived), N(totalDebt), '', '', '', ''],
    ],
  }]);

  // ── 4. QARZI BOR ──
  const debtSales = sales.filter((s) => Number(s.debtRemainder) > 0);
  addSheet(wb, 'Qarzi bor sotuvlar', `${buyer.name} — QARZI QOLGAN SOTUVLAR`, sub, [
    {
      cols: ['Sotuv №', 'Sana', 'Cheklar', 'Tovarlar', 'Sotuv narxi', 'Olingan pul', 'QOLGAN QARZ', "To'lov muddati"],
      rows: [
        ...debtSales.map((s) => [s.saleNumber, dmy(s.saleDate), s.deals.map((d: any) => '#' + d.dealNumber).join(', '), s.deals.map((d: any) => d.productName).join(' | '), N(s.totalPrice), N(s.receivedAmount), N(s.debtRemainder), dmy(s.debtDueDate)] as Row),
        [`JAMI: ${debtSales.length} sotuv`, '', '', '', N(sum(debtSales, 'totalPrice')), N(sum(debtSales, 'receivedAmount')), N(sum(debtSales, 'debtRemainder')), ''],
      ],
    },
    {
      head: 'QARZI BOR SOTUVLARDAGI CHEKLAR', cols: ['Sotuv №', 'Chek №', 'Tovar', 'IMEI', 'Sotuv narxi (ulushi)', 'Olingan', 'Qarz'],
      rows: debtSales.flatMap((s) => s.deals.map((d: any) => [s.saleNumber, d.dealNumber, d.productName || '', imeis(d), N(d.salePrice), N(d.receivedFromBuyer), N(d.debtRemainder)] as Row)),
    },
  ]);

  // ── 5. TO'LOVLAR ──
  const payByDay = new Map<string, number>();
  for (const p of allPays) payByDay.set(dmy(p.paidAt || p.date || p.createdAt), (payByDay.get(dmy(p.paidAt || p.date || p.createdAt)) || 0) + Number(p.amount));
  addSheet(wb, "To'lovlar", `${buyer.name} — BERGAN PULLARI`, sub, [
    {
      head: "SOTUVLARGA YOZILGAN TO'LOVLAR", cols: ['Sana', 'Summa', 'Sotuv №', 'Hisob', 'DDS raqami', 'Izoh'],
      note: "DDS raqami bo'sh bo'lsa — pul DDS'da avvaldan (Google jadvaldan) bor edi va sotuvga keyin bog'langan.",
      rows: [
        ...allPays.map((p) => [dmy(p.paidAt || p.date || p.createdAt), N(p.amount), p._sale.saleNumber, ACCOUNT[p.accountType || p.account || p.ddsTransaction?.account] || '', p.ddsTransaction?.txNumber || '', p.note || p.ddsTransaction?.description || ''] as Row),
        [`JAMI: ${allPays.length} ta`, N(allPays.reduce((s, p) => s + Number(p.amount), 0)), '', '', '', ''],
      ],
    },
    {
      head: `DDS'DA "${buyer.name}" NOMI BILAN YOZILGAN KIRIMLAR (solishtirish uchun)`, cols: ['Sana', 'Summa', 'DDS raqami', 'Hisob', 'Kategoriya', 'Kim', 'Izoh'],
      rows: [
        ...ddsBuyer.map((t) => [dmy(t.dateTime), N(t.amount), t.txNumber, ACCOUNT[t.account] || t.account, t.categoryName, t.sourcePerson, t.description || ''] as Row),
        [`JAMI: ${ddsBuyer.length} ta`, N(sum(ddsBuyer, 'amount')), '', '', '', '', ''],
      ],
    },
  ]);

  // ── 6. MODELLAR ──
  const model = new Map<string, { deals: number; units: number; cost: number; price: number; profit: number }>();
  for (const d of allDeals) {
    const k = String(d.productName || '—').replace(/\b\d+\s*(ta|шт)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    const g = model.get(k) || { deals: 0, units: 0, cost: 0, price: 0, profit: 0 };
    g.deals++; g.units += units(d); g.cost += Number(d.totalPurchaseCost); g.price += Number(d.salePrice); g.profit += Number(d.profit);
    model.set(k, g);
  }
  addSheet(wb, "Modellar bo'yicha", `${buyer.name} — TOVARLAR MODEL BO'YICHA`, sub, [{
    cols: ['Tovar (chekda yozilgandek)', 'Cheklar', 'Dona', 'Tannarx', 'Sotuv narxi', 'Foyda'],
    rows: [...[...model].sort((a, b) => b[1].units - a[1].units).map(([k, g]) => [k, g.deals, g.units, N(g.cost), N(g.price), N(g.profit)] as Row),
      ['JAMI', allDeals.length, totalUnits, N(sum(allDeals, 'totalPurchaseCost')), N(sum(allDeals, 'salePrice')), N(sum(allDeals, 'profit'))]],
  }], 54);

  await wb.xlsx.writeFile(out);
  console.log(`${buyer.name}: sotuvlar ${sales.length}+${legacy.length} eski, cheklar ${allDeals.length}, dona ${totalUnits}`);
  console.log(`narx ${N(totalPrice)}, olingan ${N(totalReceived)}, qarz ${N(totalDebt)}; to'lovlar ${allPays.length} ta = ${N(allPays.reduce((s, p) => s + Number(p.amount), 0))}; DDS kirimlari ${ddsBuyer.length} ta = ${N(sum(ddsBuyer, 'amount'))}`);
  console.log(`cheklar bo'yicha: narx ${N(sum(allDeals, 'salePrice'))}, olingan ${N(sum(allDeals, 'receivedFromBuyer'))}, qarz ${N(sum(allDeals, 'debtRemainder'))}, tannarx ${N(sum(allDeals, 'totalPurchaseCost'))}, foyda ${N(sum(allDeals, 'profit'))}`);
  console.log(`to'lov namunasi: ${JSON.stringify(Object.keys(allPays[0] || {}))}`);
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
