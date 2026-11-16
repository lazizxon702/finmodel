/**
 * Sotuv narxlarini chek raqami bo'yicha kiritadi (bitta chek = bitta sotuv bo'lgan Umirzoq sotuvlari uchun).
 * Standart — DRY-RUN; --apply bilan yozadi. Narxlar: --set=<chek>:<so'm>,<chek>:<so'm>...
 * Faqat sotuvida aynan BITTA chek bo'lgan va xaridori --buyer (standart Umirzoq) bo'lgan sotuvlarga tegadi.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { updateSale } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const BUYER = (process.argv.find((a) => a.startsWith('--buyer=')) || '--buyer=Umirzoq').split('=')[1];
const pairs = ((process.argv.find((a) => a.startsWith('--set=')) || '').split('=')[1] || '').split(',').filter(Boolean).map((p) => p.split(':').map(Number) as [number, number]);
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function main() {
  if (!pairs.length) throw new Error('--set=<chek>:<narx>,... kerak');
  console.log(`═══ SOTUV NARXLARINI KIRITISH (${BUYER}) ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  let total = 0;
  for (const [dealNumber, price] of pairs) {
    const d = await prisma.deal.findFirst({ where: { dealNumber }, select: { productName: true, totalPurchaseCost: true, sale: { select: { id: true, saleNumber: true, totalPrice: true, buyer: { select: { name: true } }, _count: { select: { deals: true } } } } } });
    if (!d?.sale) throw new Error(`#${dealNumber}: sotuvga bog'lanmagan`);
    if (d.sale.buyer.name !== BUYER) throw new Error(`#${dealNumber}: xaridor ${d.sale.buyer.name}`);
    if (d.sale._count.deals !== 1) throw new Error(`#${dealNumber}: sotuvda ${d.sale._count.deals} ta chek`);
    if (!(price > 0)) throw new Error(`#${dealNumber}: narx noto'g'ri`);
    total += price;
    console.log(`  #${dealNumber} (sotuv №${d.sale.saleNumber}) ${(d.productName || '').slice(0, 44)} | tannarx ${fmt(d.totalPurchaseCost)} | narx ${fmt(d.sale.totalPrice)} → ${fmt(price)} | foyda ${fmt(price - Number(d.totalPurchaseCost))}`);
    if (APPLY) await updateSale(d.sale.id, { totalPrice: price, overrideOk: true });
  }
  console.log(`  Jami: ${pairs.length} ta chek, ${fmt(total)} so'm`);
  const s = await prisma.sale.aggregate({ where: { buyer: { name: BUYER } }, _sum: { totalPrice: true, receivedAmount: true, debtRemainder: true }, _count: true });
  console.log(`${APPLY ? 'YOZILDI. ' : ''}${BUYER} hozir: ${s._count} ta sotuv, narx ${fmt(s._sum.totalPrice)}, olingan ${fmt(s._sum.receivedAmount)}, qarz ${fmt(s._sum.debtRemainder)}`);
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
