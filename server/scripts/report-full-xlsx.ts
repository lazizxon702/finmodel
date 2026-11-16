/**
 * FAQAT O'QIYDI: 01.11.2026 dan hamma bitimlar bo'yicha TO'LIQ hisobot (xlsx, har hisobot alohida varaqda):
 *   Xulosa · Hamma bitimlar · Omborda · Kelmagan tovar · Sotilganlar · Xaridorlar qarzi · Bizga qarzdorlar · Agentlar ulushi · Pul harakati (DDS)
 *   tsrun scripts/report-full-xlsx.ts <chiqish.xlsx>
 */
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { isQodirStore, isTrustDeal, isNoCommissionAgency } from '../src/services/calculation.service';

const prisma = new PrismaClient();
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};
const N = (v: unknown) => Math.round(Number(v) || 0);
const tk = (v: Date) => new Date(v.getTime() + 5 * 3600e3);
const dmy = (v: Date | null | undefined) => (v ? tk(v).toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const STATUS: Record<string, string> = {
  NEED_TO_BUY: 'Olish kerak', PENDING: 'Kutilmoqda', IN_TRANSIT: "Yo'lda", IN_WAREHOUSE: 'Omborda', SOLD: 'Sotildi',
  MONEY_RECEIVED: 'Pul tushdi', PARTIAL_AMOUNT: "To'liq emas",
};
const ARRIVED_TEXT: Record<string, string> = {
  NEED_TO_BUY: "Kelmagan (olish kerak)", PENDING: 'Kelmagan (kutilmoqda)', IN_TRANSIT: "Yo'lda", IN_WAREHOUSE: 'Kelgan — omborda turibdi',
  SOLD: 'Kelgan — sotilgan', MONEY_RECEIVED: "Tovar o'rniga pul tushgan", PARTIAL_AMOUNT: "Kelgan — to'liq emas",
};
const ACCOUNT: Record<string, string> = { CASH: 'Naqd kassa', BANK_CARD: 'Karta', SETTLEMENT_ACCOUNT: 'Hisob-raqam' };
type Row = (string | number | null)[];

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, blocks: { head?: string; cols?: string[]; rows: Row[]; note?: string }[], firstWidth = 34) {
  const ws = wb.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([`Hisobot vaqti: ${tk(new Date()).toISOString().slice(0, 16).replace('T', ' ')} (Toshkent). Manba: sayt bazasi, 01.11.2026 dan. Summalar so'mda.`]).font = { italic: true, color: { argb: 'FF666666' } };
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
  if (!out) throw new Error("Chiqish fayli ko'rsatilmagan");
  const all: any[] = await retry(() => prisma.deal.findMany({
    where: { date: { gte: new Date('2026-10-31T19:00:00.000Z') } },
    include: { store: true, provider: true, agency: true, agent: true, buyer: true, sale: { include: { buyer: true } } },
    orderBy: [{ date: 'asc' }, { dealNumber: 'asc' }],
  }));
  const deals = all.filter((d) => d.approvalStatus === 'APPROVED');
  const sales: any[] = await retry(() => prisma.sale.findMany({ include: { buyer: true, deals: { select: { dealNumber: true, productName: true } }, payments: true }, orderBy: { saleDate: 'asc' } }));
  const storeLedger: any[] = await retry(() => prisma.storeLedgerEntry.findMany({ include: { store: true } }));
  const trustLedger: any[] = await retry(() => prisma.trustLedgerEntry.findMany());
  const balances: any[] = await retry(() => prisma.accountBalance.findMany());
  const dds: any[] = await retry(() => prisma.ddsTransaction.findMany({ orderBy: { dateTime: 'asc' } }));

  const sum = (rows: any[], f: string) => rows.reduce((s, d) => s + (Number(d[f]) || 0), 0);
  const buyerOf = (d: any) => d.sale?.buyer?.name || d.buyer?.name || '';
  const imeiOf = (d: any) => [d.imeiBarcode, d.imei2].filter(Boolean).join(' ');
  const wb = new ExcelJS.Workbook();

  const inWh = deals.filter((d) => ['IN_WAREHOUSE', 'IN_TRANSIT', 'PARTIAL_AMOUNT'].includes(d.status));
  const notArrived = deals.filter((d) => ['NEED_TO_BUY', 'PENDING'].includes(d.status));
  const sold = deals.filter((d) => d.status === 'SOLD');
  const moneyGot = deals.filter((d) => d.status === 'MONEY_RECEIVED');

  // ── qarzlar ──
  const legacyDebt = sold.filter((d) => !d.saleId && Number(d.debtRemainder) > 0);
  const buyerMap = new Map<string, { sales: number; price: number; received: number; debt: number }>();
  for (const s of sales) {
    const g = buyerMap.get(s.buyer?.name || '—') || { sales: 0, price: 0, received: 0, debt: 0 };
    g.sales++; g.price += Number(s.totalPrice); g.received += Number(s.receivedAmount); g.debt += Number(s.debtRemainder);
    buyerMap.set(s.buyer?.name || '—', g);
  }
  for (const d of sold.filter((x) => !x.saleId)) {
    const k = d.buyer?.name || '— (xaridor yozilmagan)';
    const g = buyerMap.get(k) || { sales: 0, price: 0, received: 0, debt: 0 };
    g.sales++; g.price += Number(d.salePrice); g.received += Number(d.receivedFromBuyer); g.debt += Number(d.debtRemainder);
    buyerMap.set(k, g);
  }
  const buyersDebt = [...buyerMap.values()].reduce((s, g) => s + g.debt, 0);

  const storeMap = new Map<string, { debt: number; paid: number; nDebt: number }>();
  for (const e of storeLedger) {
    const k = e.store?.name || '—';
    const g = storeMap.get(k) || { debt: 0, paid: 0, nDebt: 0 };
    if (e.type === 'DEBT') { g.debt += Number(e.amount); g.nDebt++; } else g.paid += Number(e.amount);
    storeMap.set(k, g);
  }
  const trustDebt = trustLedger.filter((e) => e.type === 'DEBT').reduce((s, e) => s + Number(e.amount), 0);
  const trustPaid = trustLedger.filter((e) => e.type === 'PAYMENT').reduce((s, e) => s + Number(e.amount), 0);
  const storesLeft = [...storeMap.values()].reduce((s, g) => s + (g.debt - g.paid), 0);

  // ── 1. XULOSA ──
  const cash = balances.reduce((s, b) => s + Number(b.balance), 0);
  addSheet(wb, 'Xulosa', "UMUMIY XULOSA — 01.11.2026 dan", [
    {
      head: 'BITIMLAR', cols: ["Ko'rsatkich", 'Cheklar soni', 'Summa'],
      rows: [
        ['Hamma bitimlar (yechilgan limit)', deals.length, N(sum(deals, 'withdrawnLimit'))],
        ['Mijozlarga berilgan', deals.length, N(sum(deals, 'calculatedAmount'))],
        ['Agentlar ulushi (hisoblangan)', deals.length, N(sum(deals, 'agentAmount'))],
        ['Kompaniya foydasi (saytdagi hisob)', deals.length, N(sum(deals, 'profit'))],
        ...(all.length - deals.length ? [['Tasdiqlanmagan (hisobga kirmagan) cheklar', all.length - deals.length, N(sum(all.filter((d) => d.approvalStatus !== 'APPROVED'), 'withdrawnLimit'))] as Row] : []),
      ],
    },
    {
      head: 'TEXNIKA (tovar)', cols: ["Ko'rsatkich", 'Cheklar soni', 'Yechilgan limit', 'Tannarx (mijozga + agent)'],
      rows: [
        ['Kelmagan (kutilmoqda + olish kerak)', notArrived.length, N(sum(notArrived, 'withdrawnLimit')), N(sum(notArrived, 'totalPurchaseCost'))],
        ['Omborda turibdi', inWh.length, N(sum(inWh, 'withdrawnLimit')), N(sum(inWh, 'totalPurchaseCost'))],
        ['Sotilgan', sold.length, N(sum(sold, 'withdrawnLimit')), N(sum(sold, 'totalPurchaseCost'))],
        ["Tovar o'rniga pul tushgan", moneyGot.length, N(sum(moneyGot, 'withdrawnLimit')), N(sum(moneyGot, 'totalPurchaseCost'))],
      ],
    },
    {
      head: 'SOTUV', cols: ["Ko'rsatkich", 'Cheklar soni', 'Summa'],
      rows: [
        ['Sotilgan tovarlar — sotuv narxi', sold.length, N(sum(sold, 'salePrice'))],
        ['Xaridorlardan olingan pul', sold.length, N(sum(sold, 'receivedFromBuyer'))],
        ['Xaridorlar qarzi (qolgan)', sold.filter((d) => Number(d.debtRemainder) > 0).length, N(sum(sold, 'debtRemainder'))],
        ['Sotuvdan foyda (sotuv narxi − tannarx)', sold.length, N(sum(sold, 'profit'))],
      ],
    },
    {
      head: 'PUL QAYERDA YOTIBDI', cols: ['Joy', 'Summa'],
      note: "Kassa qoldiqlari saytdagi DDS bo'yicha — DDS to'liq emas (04–10.11 chek to'lovlari va boshlang'ich qoldiq kiritilmagan), shuning uchun haqiqiy pul bilan farq qilishi mumkin.",
      rows: [
        ...balances.map((b) => [ACCOUNT[b.account] || b.account, N(b.balance)] as Row),
        ['JAMI kassada (sayt bo\'yicha)', N(cash)],
        ['Ombordagi tovar (tannarxi)', N(sum(inWh, 'totalPurchaseCost'))],
        ['Xaridorlar qarzi', N(buyersDebt)],
        ['Qodir aka qarzi', N((storeMap.get('Qodir aka')?.debt || 0) - (storeMap.get('Qodir aka')?.paid || 0))],
        ['Trust qarzi', N(trustDebt - trustPaid)],
        ["Boshqa do'konlar qarzi (10.11 dan)", N(storesLeft - ((storeMap.get('Qodir aka')?.debt || 0) - (storeMap.get('Qodir aka')?.paid || 0)))],
      ],
    },
  ], 44);

  // ── 2. HAMMA BITIMLAR ──
  addSheet(wb, 'Hamma bitimlar', "HAMMA BITIMLAR — har bir chek: texnikasi, qayerda, kimga sotilgan, qarzi", [{
    cols: ['Chek №', 'Sana', "Do'kon", 'Provayder', 'Agentlik', 'Operator', 'Mijoz', 'Yechilgan limit', 'Mijozga berilgan', 'Agent ulushi', 'Texnika', 'IMEI', 'Texnika holati',
      'Sotuv №', 'Sotilgan sana', 'Kimga sotilgan', 'Sotuv narxi', 'Xaridordan olingan', 'Xaridor qarzi', 'Foyda'],
    rows: [
      ...deals.map((d) => [
        d.dealNumber, dmy(d.date), d.store?.name || '', d.provider?.name || '', d.agency?.name || '', d.agent?.name || '', d.customerName || '',
        N(d.withdrawnLimit), N(d.calculatedAmount), N(d.agentAmount), d.productName || '', imeiOf(d), ARRIVED_TEXT[d.status] || d.status,
        d.sale?.saleNumber ?? (d.status === 'SOLD' ? 'eski' : ''), d.status === 'SOLD' ? dmy(d.saleDate || d.sale?.saleDate) : '', d.status === 'SOLD' ? buyerOf(d) : '',
        d.status === 'SOLD' ? N(d.salePrice) : null, d.status === 'SOLD' ? N(d.receivedFromBuyer) : null, d.status === 'SOLD' ? N(d.debtRemainder) : null, N(d.profit),
      ] as Row),
      [`JAMI: ${deals.length} ta chek`, '', '', '', '', '', '', N(sum(deals, 'withdrawnLimit')), N(sum(deals, 'calculatedAmount')), N(sum(deals, 'agentAmount')), '', '', '', '', '', '',
        N(sum(sold, 'salePrice')), N(sum(sold, 'receivedFromBuyer')), N(sum(sold, 'debtRemainder')), N(sum(deals, 'profit'))],
    ],
  }], 12);

  // ── 3. OMBORDA ──
  const whCols = ['Chek №', 'Sana', "Do'kon", 'Provayder', 'Agentlik', 'Operator', 'Mijoz', 'Texnika', 'IMEI', 'Holat', 'Yechilgan limit', 'Tannarx'];
  const whRow = (d: any): Row => [d.dealNumber, dmy(d.date), d.store?.name || '', d.provider?.name || '', d.agency?.name || '', d.agent?.name || '', d.customerName || '', d.productName || '', imeiOf(d), STATUS[d.status] || d.status, N(d.withdrawnLimit), N(d.totalPurchaseCost)];
  const whTotal = (rows: any[]): Row => [`JAMI: ${rows.length} ta`, '', '', '', '', '', '', '', '', '', N(sum(rows, 'withdrawnLimit')), N(sum(rows, 'totalPurchaseCost'))];
  addSheet(wb, 'Omborda', 'OMBORDA TURGAN TEXNIKA', [{ cols: whCols, rows: [...inWh.map(whRow), whTotal(inWh)] }], 12);

  // ── 4. KELMAGAN ──
  addSheet(wb, 'Kelmagan tovar', 'HALI KELMAGAN TEXNIKA (kutilmoqda / olish kerak)', [
    {
      head: "DO'KONLAR BO'YICHA", cols: ["Do'kon", 'Cheklar soni', 'Yechilgan limit', 'Mijozga berilgan'],
      rows: [...new Set(notArrived.map((d) => d.store?.name || '—'))].map((k) => { const g = notArrived.filter((d) => (d.store?.name || '—') === k); return [k, g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'calculatedAmount'))] as Row; }).sort((a, b) => Number(b[1]) - Number(a[1])),
    },
    { head: "RO'YXAT", cols: whCols, rows: [...notArrived.map(whRow), whTotal(notArrived)] },
  ], 22);

  // ── 5. SOTILGANLAR ──
  addSheet(wb, 'Sotilganlar', 'SOTILGAN TEXNIKA — kimga, qanchaga, qarzi', [{
    cols: ['Chek №', 'Chek sanasi', "Do'kon", 'Agentlik', 'Operator', 'Texnika', 'IMEI', 'Sotuv №', 'Sotilgan sana', 'Kimga sotilgan', 'Tannarx', 'Sotuv narxi', 'Olingan pul', 'Qolgan qarz', 'Foyda'],
    rows: [
      ...sold.map((d) => [d.dealNumber, dmy(d.date), d.store?.name || '', d.agency?.name || '', d.agent?.name || '', d.productName || '', imeiOf(d), d.sale?.saleNumber ?? 'eski',
        dmy(d.saleDate || d.sale?.saleDate), buyerOf(d), N(d.totalPurchaseCost), N(d.salePrice), N(d.receivedFromBuyer), N(d.debtRemainder), N(d.profit)] as Row),
      [`JAMI: ${sold.length} ta`, '', '', '', '', '', '', '', '', '', N(sum(sold, 'totalPurchaseCost')), N(sum(sold, 'salePrice')), N(sum(sold, 'receivedFromBuyer')), N(sum(sold, 'debtRemainder')), N(sum(sold, 'profit'))],
    ],
  }], 12);

  // ── 6. XARIDORLAR QARZI ──
  const debtSales = sales.filter((s) => Number(s.debtRemainder) > 0);
  addSheet(wb, 'Xaridorlar qarzi', 'XARIDORLAR — kim bizga qancha qarz', [
    {
      head: "XARIDORLAR BO'YICHA", cols: ['Xaridor', 'Sotuvlar soni', 'Sotuv narxi jami', 'Bergan puli', 'QARZI'],
      rows: [...[...buyerMap].sort((a, b) => b[1].debt - a[1].debt).map(([k, g]) => [k, g.sales, N(g.price), N(g.received), N(g.debt)] as Row),
        ['JAMI', [...buyerMap.values()].reduce((s, g) => s + g.sales, 0), N([...buyerMap.values()].reduce((s, g) => s + g.price, 0)), N([...buyerMap.values()].reduce((s, g) => s + g.received, 0)), N(buyersDebt)]],
    },
    {
      head: "QARZI BOR SOTUVLAR", cols: ['Sotuv №', 'Sana', 'Xaridor', 'Cheklar', 'Sotuv narxi', 'Olingan', 'Qarz', "To'lov muddati"],
      rows: [
        ...debtSales.map((s) => [s.saleNumber, dmy(s.saleDate), s.buyer?.name || '', s.deals.map((x: any) => '#' + x.dealNumber).join(', '), N(s.totalPrice), N(s.receivedAmount), N(s.debtRemainder), dmy(s.debtDueDate)] as Row),
        ...legacyDebt.map((d) => ['eski', dmy(d.saleDate), d.buyer?.name || '', '#' + d.dealNumber, N(d.salePrice), N(d.receivedFromBuyer), N(d.debtRemainder), dmy(d.debtDueDate)] as Row),
      ],
    },
  ], 26);

  // ── 7. BIZGA QARZDORLAR ──
  const qodir = storeMap.get('Qodir aka') || { debt: 0, paid: 0, nDebt: 0 };
  addSheet(wb, 'Bizga qarzdorlar', "KIM BIZGA QANCHA QARZ — do'konlar, Trust, xaridorlar", [
    {
      cols: ['Kim', 'Cheklar soni', 'Berishi kerak', 'Bergan', 'QOLGAN QARZ', 'Izoh'],
      note: "Oddiy do'konlar qarzi faqat 10.11.2026 dan hisoblangan (do'kon daftari shu kundan); Qodir aka — 01.11 dan.",
      rows: [
        ['Qodir aka', qodir.nDebt, N(qodir.debt), N(qodir.paid), N(qodir.debt - qodir.paid), 'chek + agent ulushi + bizning foyda'],
        ['Trust', trustLedger.filter((e) => e.type === 'DEBT').length, N(trustDebt), N(trustPaid), N(trustDebt - trustPaid), "to'liq yechilgan limit"],
        ...[...storeMap].filter(([k]) => !isQodirStore(k)).sort((a, b) => (b[1].debt - b[1].paid) - (a[1].debt - a[1].paid))
          .map(([k, g]) => [k, g.nDebt, N(g.debt), N(g.paid), N(g.debt - g.paid), 'mijozga berilgan summa'] as Row),
        ...[...buyerMap].filter(([, g]) => g.debt > 0).map(([k, g]) => [`Xaridor: ${k}`, g.sales, N(g.price), N(g.received), N(g.debt), 'sotilgan texnika uchun'] as Row),
        ['JAMI', null, null, null, N(storesLeft + (trustDebt - trustPaid) + buyersDebt), ''],
      ],
    },
  ], 30);

  // ── 8. AGENTLAR ULUSHI ──
  const agencyNames = [...new Set(deals.map((d) => d.agency?.name || '—'))];
  const agentDds = dds.filter((t) => t.type === 'EXPENSE' && /агент|agent|komissi|комисси/i.test(`${t.categoryName} ${t.description || ''}`));
  addSheet(wb, 'Agentlar ulushi', 'AGENTLAR — hisoblangan ulush (biz ularga beradigan pul)', [
    {
      head: "AGENTLIKLAR BO'YICHA", cols: ['Agentlik', 'Cheklar soni', 'Yechilgan limit', 'Hisoblangan agent ulushi', 'Izoh'],
      note: "Agentga qancha to'langani saytda agentlik bo'yicha ajratib yozilmagan — shuning uchun 'qolgan qarz' bu yerda hisoblanmagan. Pastda DDS'dagi agent komissiyasi chiqimlari alohida berilgan.",
      rows: [
        ...agencyNames.map((k) => { const g = deals.filter((d) => (d.agency?.name || '—') === k); return [k, g.length, N(sum(g, 'withdrawnLimit')), N(sum(g, 'agentAmount')), isNoCommissionAgency(k) ? "ulush hech kimga hisoblanmaydi (egasi qarori)" : ''] as Row; }).sort((a, b) => Number(b[3]) - Number(a[3])),
        ['JAMI', deals.length, N(sum(deals, 'withdrawnLimit')), N(sum(deals, 'agentAmount')), ''],
      ],
    },
    {
      head: "DDS: agent komissiyasi bo'yicha chiqimlar", cols: ['DDS raqami', 'Sana', 'Summa', 'Kategoriya', 'Kim', 'Izoh'],
      rows: [...agentDds.map((t) => [t.txNumber, dmy(t.dateTime), N(t.amount), t.categoryName, t.sourcePerson, t.description || ''] as Row), [`JAMI: ${agentDds.length} ta`, '', N(sum(agentDds, 'amount')), '', '', '']],
    },
  ], 26);

  // ── 9. DDS ──
  const cat = new Map<string, { n: number; sum: number }>();
  for (const t of dds) { const k = `${t.type === 'INCOME' ? 'Kirim' : 'Chiqim'}|${t.categoryName}`; const g = cat.get(k) || { n: 0, sum: 0 }; g.n++; g.sum += Number(t.amount); cat.set(k, g); }
  addSheet(wb, 'Pul harakati', "PUL HARAKATI (DDS) — kassa qoldiqlari va kategoriyalar bo'yicha", [
    { head: 'KASSA QOLDIQLARI (sayt bo\'yicha)', cols: ['Hisob', 'Qoldiq'], rows: [...balances.map((b) => [ACCOUNT[b.account] || b.account, N(b.balance)] as Row), ['JAMI', N(cash)]] },
    {
      head: "KATEGORIYALAR BO'YICHA", cols: ['Turi', 'Kategoriya', 'Yozuvlar soni', 'Summa'],
      rows: [...cat].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => [k.split('|')[0], k.split('|')[1], g.n, N(g.sum)] as Row),
    },
    {
      head: "HAMMA YOZUVLAR", cols: ['DDS raqami', 'Sana', 'Turi', 'Hisob', 'Summa', 'Kategoriya', 'Kim', 'Izoh'],
      rows: dds.map((t) => [t.txNumber, dmy(t.dateTime), t.type === 'INCOME' ? 'Kirim' : 'Chiqim', ACCOUNT[t.account] || t.account, N(t.amount), t.categoryName, t.sourcePerson, t.description || ''] as Row),
    },
  ], 22);

  await wb.xlsx.writeFile(out);
  console.log(`Bitimlar ${deals.length} (limit ${N(sum(deals, 'withdrawnLimit'))}); kelmagan ${notArrived.length}, omborda ${inWh.length}, sotilgan ${sold.length}, pul tushgan ${moneyGot.length}`);
  console.log(`Sotuv narxi ${N(sum(sold, 'salePrice'))}, olingan ${N(sum(sold, 'receivedFromBuyer'))}, xaridor qarzi (bitimlar) ${N(sum(sold, 'debtRemainder'))}, (sotuvlar) ${N(buyersDebt)}`);
  console.log(`Qodir ${N(qodir.debt - qodir.paid)}, Trust ${N(trustDebt - trustPaid)}, boshqa do'konlar ${N(storesLeft - (qodir.debt - qodir.paid))}, kassa ${N(cash)}, ombor tannarxi ${N(sum(inWh, 'totalPurchaseCost'))}`);
  console.log([...buyerMap].map(([k, g]) => `${k}: qarz ${N(g.debt)}`).join(' | '));
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
