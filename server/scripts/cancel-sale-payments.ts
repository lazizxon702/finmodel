/**
 * Sotuvga xato yozilgan to'lovni bekor qiladi: sotuv "to'langan" deb rasmiylashtirilgan, lekin xaridor pul bermagan holat.
 * Standart — DRY-RUN; yozish uchun --apply. Majburiy: --sale=<sotuv raqami>.
 *
 *   • sotuvning hamma to'lovlari (SalePayment) va ularga bog'langan DDS kirimlari o'chiriladi (kassa qoldig'i shunga kamayadi);
 *   • sotuv turi DEBT (nasiya) bo'ladi, olingan pul 0, qarz = umumiy narx; bitimlardagi sotuv maydonlari qayta yoziladi.
 * Sotuv narxi, tovarlar va xaridor O'ZGARMAYDI.
 *
 *   npx ts-node --transpile-only scripts/cancel-sale-payments.ts --sale=5            (dry-run)
 *   npx ts-node --transpile-only scripts/cancel-sale-payments.ts --sale=5 --apply
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { formatTashkentDateTime } from '../src/services/calculation.service';
import { deleteDdsInTx } from '../src/services/ledger.service';
import { applySaleToDeals, lockSale } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const saleNumber = Number((process.argv.find((a) => a.startsWith('--sale=')) || '').split('=')[1]);
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function main() {
  if (!Number.isInteger(saleNumber) || saleNumber <= 0) throw new Error('--sale=<sotuv raqami> ko\'rsatilishi shart');
  console.log(`═══ SOTUV №${saleNumber}: XATO TO'LOVNI BEKOR QILISH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const sale = await prisma.sale.findUnique({
    where: { saleNumber },
    include: { buyer: true, deals: { select: { dealNumber: true } }, payments: { include: { ddsTransaction: true } } },
  });
  if (!sale) throw new Error('Sotuv topilmadi');
  console.log(`  Xaridor: ${sale.buyer.name}; tovarlar: ${sale.deals.length} ta chek; umumiy narx ${fmt(sale.totalPrice)}`);
  console.log(`  Hozir: olingan ${fmt(sale.receivedAmount)}, qarz ${fmt(sale.debtRemainder)}, turi ${sale.paymentType}`);
  let total = 0;
  for (const p of sale.payments) {
    total += Number(p.amount);
    console.log(`  − to'lov ${fmt(p.amount)} (${p.accountType}, ${formatTashkentDateTime(p.date)}); DDS: ${p.ddsTransaction ? `${p.ddsTransaction.txNumber} ${p.ddsTransaction.categoryName}` : "yo'q"}`);
  }
  const balances = await prisma.accountBalance.findMany();
  console.log(`  Kassa hozir: ${balances.map((b) => `${b.account} ${fmt(b.balance)}`).join('; ')}`);
  console.log(`  Bo'ladi: olingan 0, qarz ${fmt(sale.totalPrice)}, turi DEBT; kassadan ${fmt(total)} kirim olib tashlanadi.`);

  if (!APPLY) {
    console.log('DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      await lockSale(tx, sale.id);
      for (const p of sale.payments) {
        if (p.ddsTransactionId) await deleteDdsInTx(tx, p.ddsTransactionId);
        await tx.salePayment.delete({ where: { id: p.id } });
      }
      await tx.sale.update({ where: { id: sale.id }, data: { paymentType: 'DEBT' } });
      await applySaleToDeals(tx, sale.id);
    },
    { timeout: 60000, maxWait: 20000 }
  );
  const after = await prisma.sale.findUnique({ where: { id: sale.id } });
  const bal = await prisma.accountBalance.findMany();
  console.log(`YOZILDI. Endi: olingan ${fmt(after?.receivedAmount)}, qarz ${fmt(after?.debtRemainder)}, turi ${after?.paymentType}; kassa: ${bal.map((b) => `${b.account} ${fmt(b.balance)}`).join('; ')}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
