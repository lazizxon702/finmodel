/**
 * Xaridor (Umirzoq) ILGARI bergan pullarini uning sotuvlari qarzidan ayiradi. Standart — DRY-RUN; --apply bilan yozadi.
 *
 * Pullar DDS'ga allaqachon kirim qilingan (Sheets'dan kelgan qatorlar), shuning uchun YANGI DDS YOZILMAYDI va kassa O'ZGARMAYDI:
 * faqat sotuvlarga to'lov (SalePayment, DDS'ga bog'lanmagan) yoziladi. Har bir to'lov eng eski chekdan boshlab taqsimlanadi.
 * To'lovlar ro'yxati — egasi aytgan jami 316 321 500 (15.11.2026) ga teng qilib, DDS qatorlaridan olingan.
 */
import 'dotenv/config';
import { AccountType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { applySaleToDeals, lockSale } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const BUYER = 'Umirzoq';
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const at = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`);

// Egasi: "jami 316 321 500 pul bergan". DDS'dagi Umirzoq kirimlari (TX-1031 3 000 000 kirmaydi; TX-1034 56 929 600 dan 56 929 000 olinadi).
const PAYMENTS: { date: string; amount: number; account: AccountType; tx: string }[] = [
  { date: '2026-11-03', amount: 9_310_000, account: 'BANK_CARD', tx: 'TX-1007' },
  { date: '2026-11-04', amount: 7_100_000, account: 'BANK_CARD', tx: 'TX-1022' },
  { date: '2026-11-05', amount: 56_929_000, account: 'CASH', tx: 'TX-1034' },
  { date: '2026-11-05', amount: 6_030_000, account: 'BANK_CARD', tx: 'TX-1030' },
  { date: '2026-11-06', amount: 59_750_000, account: 'CASH', tx: 'TX-1041' },
  { date: '2026-11-08', amount: 52_325_000, account: 'CASH', tx: 'TX-1069' },
  { date: '2026-11-09', amount: 124_877_500, account: 'CASH', tx: 'TX-1077' },
];

async function main() {
  const total = PAYMENTS.reduce((s, p) => s + p.amount, 0);
  console.log(`═══ ${BUYER}: BERGAN PULLARNI QARZDAN AYIRISH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  console.log(`To'lovlar: ${PAYMENTS.length} ta, jami ${fmt(total)}`);
  const sales = (
    await prisma.sale.findMany({
      where: { buyer: { name: BUYER } },
      select: { id: true, saleNumber: true, totalPrice: true, debtRemainder: true, deals: { select: { dealNumber: true, date: true } }, _count: { select: { payments: true } } },
    })
  ).sort((a, b) => (a.deals[0]?.date.getTime() || 0) - (b.deals[0]?.date.getTime() || 0) || (a.deals[0]?.dealNumber || 0) - (b.deals[0]?.dealNumber || 0));
  if (sales.some((s) => s._count.payments > 0)) throw new Error("Sotuvlarda allaqachon to'lov bor — takror yozilmasin");
  const debtBefore = sales.reduce((s, x) => s + Number(x.debtRemainder), 0);

  // Taqsimlash: to'lovlar sana tartibida, cheklar eng eskisidan
  const plan: { saleId: string; saleNumber: number; dealNumber: number; amount: number; date: string; account: AccountType; tx: string }[] = [];
  const left = new Map(sales.map((s) => [s.id, Number(s.debtRemainder)]));
  let si = 0;
  for (const p of PAYMENTS) {
    let rest = p.amount;
    while (rest > 0 && si < sales.length) {
      const s = sales[si];
      const need = left.get(s.id) || 0;
      if (need <= 0) { si++; continue; }
      const take = Math.min(need, rest);
      plan.push({ saleId: s.id, saleNumber: s.saleNumber, dealNumber: s.deals[0]?.dealNumber || 0, amount: take, date: p.date, account: p.account, tx: p.tx });
      left.set(s.id, need - take);
      rest -= take;
    }
    if (rest > 0) throw new Error(`To'lov qarzdan katta: ${fmt(rest)} ortib qoldi`);
  }
  const paidFull = sales.filter((s) => (left.get(s.id) || 0) <= 0);
  const open = sales.filter((s) => (left.get(s.id) || 0) > 0);
  console.log(`Sotuvlar: ${sales.length} ta, qarz ${fmt(debtBefore)} → ${fmt(debtBefore - total)}`);
  console.log(`To'liq yopiladi: ${paidFull.length} ta chek (${paidFull.map((s) => '#' + s.deals[0]?.dealNumber).join(', ')})`);
  console.log(`Qarzda qoladi: ${open.length} ta chek:`);
  for (const s of open) console.log(`   #${s.deals[0]?.dealNumber} — narx ${fmt(s.totalPrice)}, qoladigan qarz ${fmt(left.get(s.id))}`);

  if (!APPLY) {
    console.log('DRY-RUN tugadi — bazaga hech narsa yozilmadi. Kassa o\'zgarmaydi (pullar DDS\'da allaqachon bor).');
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      const touched = new Set<string>();
      for (const row of plan) {
        if (!touched.has(row.saleId)) await lockSale(tx, row.saleId);
        touched.add(row.saleId);
        await tx.salePayment.create({
          data: { saleId: row.saleId, amount: row.amount, date: at(row.date), accountType: row.account, note: `Umirzoq bergan pul (DDS ${row.tx}) — qarzdan ayirildi, DDS'ga qayta yozilmagan` },
        });
      }
      for (const id of touched) await applySaleToDeals(tx, id);
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
  const s = await prisma.sale.aggregate({ where: { buyer: { name: BUYER } }, _sum: { totalPrice: true, receivedAmount: true, debtRemainder: true }, _count: true });
  const bal = await prisma.accountBalance.findMany();
  console.log(`YOZILDI. ${BUYER}: narx ${fmt(s._sum.totalPrice)}, olingan ${fmt(s._sum.receivedAmount)}, qarz ${fmt(s._sum.debtRemainder)}; kassa: ${bal.map((b) => `${b.account} ${fmt(b.balance)}`).join('; ')}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
