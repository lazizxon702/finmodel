/**
 * Umirzoq hisobini to'g'rilash (egasi tasdig'i, 15.11.2026 kech). Standart — DRY-RUN; --apply bilan yozadi. BIR MARTALIK.
 *
 *  1) №58 sotuv kiritilganda xato yozilgan "boshlang'ich to'lov" 47 190 550 (TX-1203) bekor qilinadi — Umirzoq bu pulni bermagan.
 *  2) #8107 (№5 sotuv) narxi 26 906 880 → 21 176 000. Shu chekka ortiqcha tushgan 5 730 880 to'lov boshqa (eng eski) qarzga ko'chiriladi,
 *     ya'ni tugma orqali kiritilgan 51 000 000 va 92 300 000 to'lovlar jami o'zgarmaydi.
 *  Kutilgan natija: qarz 51 265 500; naqd kassa 47 190 550 ga kamayadi.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { deleteDdsInTx } from '../src/services/ledger.service';
import { addSalePayment, applySaleToDeals, lockSale, payBuyerDebt, updateSale } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const NEW_PRICE_8107 = 21_176_000;
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function state(label: string) {
  const s = await prisma.sale.aggregate({ where: { buyer: { name: 'Umirzoq' } }, _sum: { totalPrice: true, receivedAmount: true, debtRemainder: true }, _count: true });
  const bal = await prisma.accountBalance.findMany();
  console.log(`${label}: ${s._count} sotuv, narx ${fmt(s._sum.totalPrice)}, olingan ${fmt(s._sum.receivedAmount)}, qarz ${fmt(s._sum.debtRemainder)}; naqd kassa ${fmt(bal.find((b) => b.account === 'CASH')?.balance)}`);
  return { debt: Number(s._sum.debtRemainder), received: Number(s._sum.receivedAmount), price: Number(s._sum.totalPrice) };
}

async function main() {
  console.log(`═══ UMIRZOQ HISOBINI TO'G'RILASH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const buyer = await prisma.buyer.findUnique({ where: { name: 'Umirzoq' } });
  if (!buyer) throw new Error('Umirzoq topilmadi');
  const sale58 = await prisma.sale.findUnique({ where: { saleNumber: 58 }, include: { payments: { include: { ddsTransaction: true } } } });
  const sale5 = await prisma.sale.findUnique({ where: { saleNumber: 5 }, include: { payments: { include: { ddsTransaction: true } }, deals: { select: { dealNumber: true } } } });
  if (!sale58 || !sale5) throw new Error('Sotuv №58 yoki №5 topilmadi');
  const p58 = sale58.payments.find((p) => p.ddsTransaction?.txNumber === 'TX-1203');
  const p5 = sale5.payments.find((p) => p.ddsTransaction?.txNumber === 'TX-1210');
  if (!p58 || Math.round(Number(p58.amount)) !== 47_190_550) throw new Error("TX-1203 (47 190 550) to'lovi topilmadi — allaqachon tuzatilgan bo'lishi mumkin");
  if (!p5 || Math.round(Number(sale5.totalPrice)) !== 26_906_880 || sale5.deals.length !== 1 || sale5.deals[0].dealNumber !== 8107) throw new Error('№5 sotuv kutilgan holatda emas');
  const over = Number(sale5.totalPrice) - NEW_PRICE_8107; // 5 730 880
  const keep5 = Number(p5.amount) - over; // №5 da qoladigan qism

  const before = await state('HOZIR');
  console.log(`  1) №58: TX-1203 to'lovi ${fmt(p58.amount)} bekor qilinadi`);
  console.log(`  2) №5 (#8107): narx ${fmt(sale5.totalPrice)} → ${fmt(NEW_PRICE_8107)}; TX-1210 ${fmt(p5.amount)} o'rniga ${fmt(keep5)} shu chekka, ${fmt(over)} eng eski qarzga`);
  console.log(`  Kutiladi: qarz ${fmt(before.price - over - (before.received - Number(p58.amount)))}`);
  if (!APPLY) return console.log('DRY-RUN tugadi — bazaga hech narsa yozilmadi.');

  const when = p5.date;
  await prisma.$transaction(
    async (tx) => {
      await lockSale(tx, sale58.id);
      await lockSale(tx, sale5.id);
      for (const p of [p58, p5]) {
        if (p.ddsTransactionId) await deleteDdsInTx(tx, p.ddsTransactionId);
        await tx.salePayment.delete({ where: { id: p.id } });
      }
      await tx.sale.update({ where: { id: sale58.id }, data: { paymentType: 'DEBT' } });
      await applySaleToDeals(tx, sale58.id);
      await applySaleToDeals(tx, sale5.id);
    },
    { timeout: 60000, maxWait: 20000 }
  );
  await updateSale(sale5.id, { totalPrice: NEW_PRICE_8107, overrideOk: true });
  await addSalePayment(sale5.id, { amount: keep5, account: 'CASH', date: when, note: 'umirzoq (14.11 to\'lovidan, #8107 narxi tuzatilgach)' });
  const r = await payBuyerDebt(buyer.id, { amount: over, account: 'CASH', date: when, note: 'umirzoq (14.11 to\'lovidan, #8107 narxi tuzatilgach ko\'chirildi)' });
  console.log(`  ${fmt(over)} ko'chirildi: ${r.allocations.map((a) => `#${a.dealNumbers.join('/')} ${fmt(a.amount)}`).join('; ')}`);
  await state('YOZILDI');
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
