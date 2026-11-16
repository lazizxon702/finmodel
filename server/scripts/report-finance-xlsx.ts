/**
 * FAQAT O'QIYDI: to'liq moliyaviy hisobot (xlsx) — saytdagi "P&L, Kassa va Balans" sahifasi bilan AYNAN bir xil hisob
 * (GET /api/finances/summary shu jarayon ichida chaqiriladi), plyus DDS kunlar/kategoriyalar bo'yicha.
 *   tsrun scripts/report-finance-xlsx.ts <chiqish.xlsx> [YYYY-MM-DD] [YYYY-MM-DD]
 */
import 'dotenv/config';
import type { AddressInfo } from 'net';
import ExcelJS from 'exceljs';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { getJwtSecret } from '../src/lib/security';
import financesRoutes from '../src/routes/finances.routes';

const N = (v: unknown) => Math.round(Number(v) || 0);
const tk = (v: Date) => new Date(v.getTime() + 5 * 3600e3);
const dmy = (v: Date | string | null | undefined) => (v ? tk(new Date(v)).toISOString().slice(0, 10).split('-').reverse().join('.') : '');
const ACCOUNT: Record<string, string> = { CASH: 'Naqd kassa', BANK_CARD: 'Karta', SETTLEMENT_ACCOUNT: 'Hisob-raqam' };
const EXP: Record<string, string> = { OPEX: 'Operatsion xarajat', COGS: 'Tovar xaridi (tannarx)', CAPEX: 'Asosiy vosita', OTHER: 'Boshqa' };
type Row = (string | number | null)[];
const retry = async <T>(fn: () => Promise<T>): Promise<T> => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= 5) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
};

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, sub: string, blocks: { head?: string; cols?: string[]; rows: Row[]; note?: string }[], firstWidth = 46) {
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
      if (/^(JAMI|=|SOF|YALPI)/.test(String(row[0] ?? ''))) r.font = { bold: true };
    }
  }
  ws.columns.forEach((c, i) => { c.width = i === 0 ? firstWidth : 20; });
}

async function main() {
  const out = process.argv[2];
  const start = process.argv[3] || '2026-11-01';
  const end = process.argv[4] || tk(new Date()).toISOString().slice(0, 10);
  if (!out) throw new Error("Chiqish fayli ko'rsatilmagan");

  const admin = await retry(() => prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } }));
  if (!admin) throw new Error('ADMIN topilmadi');
  const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role, fullName: admin.fullName }, getJwtSecret(), { expiresIn: '10m' });
  const app = express();
  app.use(express.json());
  app.use('/api/finances', financesRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (q: string) => {
    const res = await fetch(`${base}/api/finances/summary${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`summary ${res.status}: ${await res.text()}`);
    return res.json() as Promise<any>;
  };
  const s = await retry(() => get(`?startDate=${start}&endDate=${end}`));
  server.close();

  const dds: any[] = await retry(() => prisma.ddsTransaction.findMany({
    where: { dateTime: { gte: new Date(`${start}T00:00:00+05:00`), lte: new Date(`${end}T23:59:59.999+05:00`) } }, orderBy: { dateTime: 'asc' },
  }));
  const sub = `Davr: ${dmy(`${start}T12:00:00+05:00`)} — ${dmy(`${end}T12:00:00+05:00`)}. Hisobot vaqti: ${tk(new Date()).toISOString().slice(0, 16).replace('T', ' ')} (Toshkent). Manba: sayt (P&L, Kassa va Balans sahifasi bilan bir xil hisob). Summalar so'mda.`;
  const wb = new ExcelJS.Workbook();
  const p = s.pnl, cf = s.cashFlow, bs = s.balanceSheet || {};

  // ── 1. P&L ──
  addSheet(wb, 'Foyda va zarar (P&L)', 'FOYDA VA ZARAR HISOBOTI (P&L)', sub, [
    {
      head: 'DAROMAD — bitimlar bo\'yicha foyda', cols: ['Qator', 'Summa'],
      rows: [
        ['Savdo marjasi (sotilgan texnika: sotuv narxi − limit)', N(p.tradeMargin)],
        ['Hamkor bonusi (Qodir aka / Green Bazar)', N(p.partnerBonus)],
        [`Trust daromadi (${p.trustRatePercent}%)`, N(p.trustIncome)],
        ['Tuzatish (bitim kartasidagi foyda bilan farq)', N(p.dealsProfitAdjustment)],
        ['= BITIMLAR BO\'YICHA FOYDA (Bitimlar sahifasidagi "Sof foyda")', N(p.dealsProfit)],
      ],
    },
    {
      head: 'OPERATSION XARAJATLAR (DDS, turi OPEX)', cols: ['Qator', 'Summa'],
      rows: [
        ["Agentlarga to'lovlar", N(p.agentPayouts)], ['Logistika', N(p.logisticsExpenses)], ['Ofis va ma\'muriy', N(p.officeAndAdmin)],
        ['Ish haqi', N(p.payrollExpenses)], ['Marketing', N(p.marketingExpenses)], ['Boshqa', N(p.otherOpex)],
        ['= JAMI OPERATSION XARAJAT', N(p.totalOpex)],
      ],
    },
    { head: 'NATIJA', cols: ['Qator', 'Summa'], rows: [['SOF FOYDA (bitimlar foydasi − operatsion xarajat)', N(p.netProfit)], ['Rentabellik, %', Math.round((Number(p.rosPct) || 0) * 100) / 100]] },
    {
      head: "MA'LUMOT UCHUN", cols: ['Qator', 'Summa'],
      note: `Bitimlar foydasi "hisoblash usuli"da: chek tasdiqlangan zahoti hisoblanadi, pul hali kelmagan bo'lishi mumkin. Sotilgan, lekin sotuv narxi kiritilmagan cheklar: ${p.soldWithoutSalePrice}.`,
      rows: [
        ['Sotuv tushumi (sotilgan texnika narxi)', N(p.salesRevenue)], ['Sotilgan texnika tannarxi', N(p.cogs)], ['YALPI foyda (sotuv − tannarx)', N(p.grossProfit)],
        ['Davrda tovar xaridiga chiqqan pul (DDS)', N(p.cogsCashOut)], ['Davrda Trust haqiqatda bergan pul', N(p.trustReceived)], ['Trustning joriy qarzi', N(p.trustOutstanding)],
        ['Davrdagi bitimlar soni', N(p.reconciliation?.dealsCount)],
      ],
    },
    ...(Array.isArray(p.opexBreakdown) && p.opexBreakdown.length
      ? [{ head: "OPERATSION XARAJATLAR — kategoriyalar bo'yicha", cols: ['Kategoriya', 'Summa'], rows: p.opexBreakdown.map((o: any) => [String(o.category ?? o.categoryName ?? o.name ?? ''), N(o.amount ?? o.total ?? o.sum)] as Row) }]
      : []),
  ]);

  // ── 2. PUL OQIMI ──
  addSheet(wb, 'Pul oqimi (Kassa)', 'PUL OQIMI HISOBOTI (KASSA)', sub, [
    {
      cols: ['Qator', 'Summa'],
      note: "DDS to'liq emas: 04–10.11 chek to'lovlari va boshlang'ich qoldiq kiritilmagan — kassa haqiqiy puldan farq qilishi mumkin.",
      rows: [
        ['Davr boshidagi pul', N(cf.beginningCash)],
        ['Operatsion tushumlar (xaridorlar, do\'konlar va boshqalar)', N(cf.operatingInflows)], ['Trustdan tushum', N(cf.trustInflows)], ['Investor / qarz tushumi', N(cf.investorLoanInflow)],
        ['= JAMI KIRIM', N(cf.totalInflows)],
        ['Tovar xaridi (mijozga berilgan pul)', N(cf.purchaseOutflows)], ['Uzimei', N(cf.uzimeiOutflows)], ['Operatsion xarajatlar', N(cf.opexOutflows)], ['Boshqa chiqimlar', N(cf.otherOutflows)],
        ['= JAMI CHIQIM', N(cf.totalOutflows)],
        ['SOF pul oqimi (kirim − chiqim)', N(cf.netCashFlow)], ['Davr oxiridagi pul', N(cf.endingCash)],
      ],
    },
    { head: 'KASSA QOLDIQLARI (hozir)', cols: ['Hisob', 'Qoldiq'], rows: [...Object.keys(ACCOUNT).map((k) => [ACCOUNT[k], N(s.balances?.[k])] as Row), ['JAMI', N(s.balances?.total)]] },
  ]);

  // ── 3. BALANS ──
  const flat = (obj: any, prefix = ''): Row[] => Object.entries(obj || {}).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${prefix}${k} · `) : typeof v === 'number' ? [[`${prefix}${k}`, N(v)] as Row] : typeof v === 'string' || typeof v === 'boolean' ? [[`${prefix}${k}`, String(v)] as Row] : []);
  const BS_LABEL: Record<string, string> = {
    liquidCash: 'Pul (kassa, karta, hisob-raqam)', cash: 'Pul (kassa, karta, hisob-raqam)', warehouseInventory: 'Ombordagi tovar (tannarxi)', inventory: 'Ombordagi tovar (tannarxi)',
    receivables: 'Bizga qarzdorlar (debitorlar)', accountsReceivable: 'Bizga qarzdorlar (debitorlar)', fixedAssets: 'Asosiy vositalar', totalAssets: 'JAMI AKTIVLAR',
    payables: 'Biz qarzdormiz (kreditorlar)', accountsPayable: 'Biz qarzdormiz (kreditorlar)', longTermLoan: 'Uzoq muddatli qarz (investor)', charterCapital: 'Ustav kapitali',
    retainedEarnings: 'Taqsimlanmagan foyda', totalLiabilitiesAndEquity: 'JAMI PASSIVLAR VA KAPITAL', balanceDifference: 'Farq (aktiv − passiv)', isBalanced: 'Balans mosmi', statusText: 'Holat',
    assets: 'AKTIV', liabilities: 'PASSIV', equity: 'Kapital', buyerReceivables: '   shundan xaridorlar', trustReceivable: '   shundan Trust', difference: 'FARQ (aktiv − passiv)',
  };
  const relabel = (rows: Row[]): Row[] => rows.map(([k, v]) => [String(k).split(' · ').map((x) => BS_LABEL[x] || x).join(' · '), v]);
  addSheet(wb, 'Balans', 'BOSHQARUV BALANSI (hozirgi holat)', sub, [
    {
      cols: ['Qator', 'Summa'],
      note: "Balans to'liq emas bo'lishi mumkin: boshlang'ich qoldiq, ustav kapitali va ayrim majburiyatlar saytga kiritilmagan bo'lsa, aktiv va passiv teng chiqmaydi.",
      rows: relabel(flat({ assets: bs.assets, liabilities: bs.liabilities, difference: bs.difference, statusText: bs.balanceCheck?.statusText })),
    },
    {
      head: 'ASOSIY KO\'RSATKICHLAR', cols: ['Ko\'rsatkich', 'Qiymat'],
      rows: [
        ['Pul (kassa jami)', N(s.cards?.liquidCash)], ['Ombordagi tovar (tannarxi)', N(s.cards?.warehouseValue)], ['Ombordagi cheklar soni', N(s.cards?.warehouseCount)],
        ['Bizga qarzdorlar jami', N(s.totals?.totalReceivables)], ['   shundan xaridorlar', N(s.totals?.buyerReceivables)], ['   shundan Trust', N(s.totals?.trustReceivable)],
        ['Biz qarzdormiz jami', N(s.totals?.totalPayables)],
      ],
    },
  ]);

  // ── 4. QARZLAR ──
  const partyRows = (list: any[]): Row[] => (list || []).filter((r: any) => N(r.remainder ?? r.amount) !== 0 || N(r.shipped) !== 0)
    .map((r: any) => [String(r.buyerName ?? r.name ?? '—'), N(r.shipped), N(r.paid), N(r.remainder ?? r.amount), String(r.type ?? '')] as Row);
  addSheet(wb, 'Debitor va kreditor', 'QARZLAR — kim bizga qarz, biz kimga qarzmiz', sub, [
    { head: 'BIZGA QARZDORLAR (sayt bo\'yicha)', cols: ['Kim', 'Berilgan / hisoblangan', "To'lagan", 'QOLGAN QARZ', 'Turi'],
      note: "Qodir aka (248 914 260) va boshqa do'konlar qarzi saytning moliyaviy xulosasiga kirmaydi — ular 'Do'konlar' bo'limida alohida yuritiladi.",
      rows: [...partyRows(s.receivables), ['JAMI', null, null, N(s.totals?.totalReceivables), '']] },
    {
      head: 'BIZ QARZDORMIZ (sayt bo\'yicha)', cols: ['Kimga', 'Hisoblangan', "To'langan", 'QOLGAN', 'Turi'],
      note: "Agentlarga to'lanmagan ulush va do'konlar qarzi bu ro'yxatga kirmagan bo'lishi mumkin — saytda alohida yuritilmaydi.",
      rows: [...partyRows(s.payables), ['JAMI', null, null, N(s.totals?.totalPayables), '']],
    },
  ]);

  // ── 5. DDS kategoriyalar ──
  const cat = new Map<string, { n: number; sum: number }>();
  for (const t of dds) { const k = `${t.type === 'INCOME' ? 'Kirim' : 'Chiqim'}|${EXP[t.expenseType] || t.expenseType}|${t.categoryName}`; const g = cat.get(k) || { n: 0, sum: 0 }; g.n++; g.sum += Number(t.amount); cat.set(k, g); }
  const inc = dds.filter((t) => t.type === 'INCOME'), exp = dds.filter((t) => t.type !== 'INCOME');
  const total = (rows: any[]) => rows.reduce((a, t) => a + Number(t.amount), 0);
  addSheet(wb, 'DDS kategoriyalar', "PUL HARAKATI — kategoriyalar bo'yicha", sub, [
    { head: 'JAMI', cols: ['Qator', 'Yozuvlar soni', 'Summa'], rows: [['Kirim', inc.length, N(total(inc))], ['Chiqim', exp.length, N(total(exp))], ['SOF (kirim − chiqim)', dds.length, N(total(inc) - total(exp))]] },
    { head: "KATEGORIYALAR", cols: ['Turi', 'Xarajat turi', 'Kategoriya', 'Yozuvlar soni', 'Summa'], rows: [...cat].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => [...k.split('|'), g.n, N(g.sum)] as Row) },
    {
      head: "HISOBLAR BO'YICHA", cols: ['Hisob', 'Kirim', 'Chiqim', 'Farq'],
      rows: Object.keys(ACCOUNT).map((a) => { const i = total(inc.filter((t) => t.account === a)), e = total(exp.filter((t) => t.account === a)); return [ACCOUNT[a], N(i), N(e), N(i - e)] as Row; }),
    },
  ], 14);

  // ── 6. DDS kunlar ──
  const days = [...new Set(dds.map((t) => dmy(t.dateTime)))];
  let run = 0;
  addSheet(wb, 'DDS kunlar', "PUL HARAKATI — kunlar bo'yicha", sub, [{
    cols: ['Sana', 'Kirim', 'Chiqim', 'Kun natijasi', "Yig'ilib boruvchi"],
    rows: [
      ...days.map((d) => { const day = dds.filter((t) => dmy(t.dateTime) === d); const i = total(day.filter((t) => t.type === 'INCOME')), e = total(day.filter((t) => t.type !== 'INCOME')); run += i - e; return [d, N(i), N(e), N(i - e), N(run)] as Row; }),
      ['JAMI', N(total(inc)), N(total(exp)), N(total(inc) - total(exp)), null],
    ],
  }], 14);

  // ── 7. DDS hamma yozuvlar ──
  addSheet(wb, 'DDS yozuvlar', 'PUL HARAKATI — hamma yozuvlar', sub, [{
    cols: ['DDS raqami', 'Sana', 'Turi', 'Hisob', 'Summa', 'Xarajat turi', 'Kategoriya', 'Kim', 'Izoh'],
    rows: dds.map((t) => [t.txNumber, dmy(t.dateTime), t.type === 'INCOME' ? 'Kirim' : 'Chiqim', ACCOUNT[t.account] || t.account, N(t.amount), EXP[t.expenseType] || t.expenseType, t.categoryName, t.sourcePerson, t.description || ''] as Row),
  }], 14);

  await wb.xlsx.writeFile(out);
  console.log(`P&L: bitimlar foydasi ${N(p.dealsProfit)} (marja ${N(p.tradeMargin)}, bonus ${N(p.partnerBonus)}, Trust ${N(p.trustIncome)}, tuzatish ${N(p.dealsProfitAdjustment)}), OPEX ${N(p.totalOpex)}, sof foyda ${N(p.netProfit)}`);
  console.log(`Kassa: bosh ${N(cf.beginningCash)}, kirim ${N(cf.totalInflows)}, chiqim ${N(cf.totalOutflows)}, oxir ${N(cf.endingCash)}; qoldiq jami ${N(s.balances?.total)}`);
  console.log(`Balans kalitlari: ${JSON.stringify(bs).slice(0, 600)}`);
  console.log(`Debitor ${N(s.totals?.totalReceivables)} (xaridor ${N(s.totals?.buyerReceivables)}, Trust ${N(s.totals?.trustReceivable)}), kreditor ${N(s.totals?.totalPayables)}`);
  console.log(`receivables namunasi: ${JSON.stringify((s.receivables || []).slice(0, 2))} | payables: ${JSON.stringify((s.payables || []).slice(0, 2))} | opex: ${JSON.stringify((p.opexBreakdown || []).slice(0, 2))}`);
  console.log(`Fayl: ${out}`);
}

main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
