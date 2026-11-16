/**
 * Sotilgan / "qisman summa" holatidagi TELEFON cheklarini Umirzoqning qarziga o'tkazadi (egasi buyrug'i, 15.11.2026).
 * Standart — DRY-RUN; yozish uchun --apply.
 *
 *   • Tegilmaydi: №3 (Saloxiddin) va №4 (Kochadan) sotuvlar; maishiy texnika (#3638); egasi "tegma" degan #8107, #3717, #3644.
 *   • №5 sotuvdagi soxta naqd to'lov (TX-1199) bekor qilinadi — Umirzoq bu pulni bermagan. #8107 №5 sotuvda o'z narxi bilan QARZ bo'lib qoladi.
 *   • Qolgan har bir chek ALOHIDA sotuv bo'ladi: xaridor Umirzoq, turi DEBT (nasiya), narx 0 —
 *     narxlarni egasi IMEI bo'yicha beradi, keyin har sotuvga alohida kiritiladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { formatTashkentDateTime } from '../src/services/calculation.service';
import { deleteDdsInTx } from '../src/services/ledger.service';
import { applySaleToDeals, lockSale } from '../src/services/sale.service';

const APPLY = process.argv.includes('--apply');
const BUYER = 'Umirzoq';
const KEEP_SALES = [3, 4]; // Saloxiddin, Kochadan
const SKIP_DEALS = new Set([3638, 8107, 3717, 3644]); // maishiy texnika + egasi "tegma" degan 3 ta chek
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const lines: string[] = [];
const out = (s = '') => {
  lines.push(s);
  console.log(s);
};

async function main() {
  out(`═══ SOTILGAN TELEFONLARNI UMIRZOQ QARZIGA O'TKAZISH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const buyer = await prisma.buyer.findUnique({ where: { name: BUYER } });
  if (!buyer) throw new Error(`Xaridor "${BUYER}" topilmadi`);

  const deals = await prisma.deal.findMany({
    where: { approvalStatus: 'APPROVED', OR: [{ status: { in: ['SOLD', 'PARTIAL_AMOUNT'] } }, { saleId: { not: null } }] },
    select: { id: true, dealNumber: true, date: true, status: true, productName: true, totalPurchaseCost: true, salePrice: true, profit: true, saleDate: true, saleId: true, sale: { select: { id: true, saleNumber: true } }, store: { select: { name: true } } },
    orderBy: { dealNumber: 'asc' },
  });
  const kept = deals.filter((d) => (d.sale && KEEP_SALES.includes(d.sale.saleNumber)) || SKIP_DEALS.has(d.dealNumber));
  const targets = deals.filter((d) => !kept.includes(d));
  const sale5 = await prisma.sale.findUnique({ where: { saleNumber: 5 }, include: { payments: { include: { ddsTransaction: true } }, deals: { select: { id: true, dealNumber: true, salePrice: true } } } });

  out(`\nTEGILMAYDI (${kept.length} ta chek):`);
  for (const d of kept) out(`  #${d.dealNumber} | ${d.sale ? 'sotuv №' + d.sale.saleNumber : d.status} | ${d.store?.name} | ${d.productName || ''}`);

  out(`\nUMIRZOQ QARZIGA O'TADI — har biri alohida sotuv, narx 0 (${targets.length} ta chek):`);
  let costSum = 0;
  let profitBefore = 0;
  for (const d of targets) {
    costSum += Number(d.totalPurchaseCost);
    profitBefore += Number(d.profit);
    out(`  #${d.dealNumber} | ${d.sale ? 'sotuv №' + d.sale.saleNumber : d.status} | ${d.store?.name} | ${d.productName || ''} | tannarx ${fmt(d.totalPurchaseCost)} | hozirgi sotuv narxi ${fmt(d.salePrice)} | hozirgi foyda ${fmt(d.profit)}`);
  }
  out(`  Jami tannarx: ${fmt(costSum)}; shu cheklarning hozirgi foydasi: ${fmt(profitBefore)}`);
  out(`  DIQQAT: sotuv narxi 0 bo'lgani uchun narxlar kiritilguncha bu cheklarning foydasi −tannarx bo'lib turadi (jami ${fmt(-costSum)}).`);

  const keep8107 = sale5?.deals.find((d) => d.dealNumber === 8107);
  if (sale5) {
    out(`\n№5 SOTUV: to'lovlar bekor qilinadi (Umirzoq bermagan):`);
    for (const p of sale5.payments) out(`  − ${fmt(p.amount)} (${p.accountType}, ${formatTashkentDateTime(p.date)}) DDS ${p.ddsTransaction?.txNumber || '—'}`);
    out(`  №5 sotuvda faqat #8107 qoladi: narx ${fmt(keep8107?.salePrice)}, QARZ (nasiya).`);
  }
  const bal = await prisma.accountBalance.findMany();
  out(`\nKassa hozir: ${bal.map((b) => `${b.account} ${fmt(b.balance)}`).join('; ')}`);

  if (APPLY) {
    await prisma.$transaction(
      async (tx) => {
        if (sale5) {
          await lockSale(tx, sale5.id);
          for (const p of sale5.payments) {
            if (p.ddsTransactionId) await deleteDdsInTx(tx, p.ddsTransactionId);
            await tx.salePayment.delete({ where: { id: p.id } });
          }
          await tx.deal.updateMany({ where: { saleId: sale5.id, dealNumber: { not: 8107 } }, data: { saleId: null } });
          await tx.sale.update({ where: { id: sale5.id }, data: { paymentType: 'DEBT', totalPrice: Number(keep8107?.salePrice) || 0 } });
          await applySaleToDeals(tx, sale5.id);
        }
        for (const d of targets) {
          const sale = await tx.sale.create({
            data: {
              saleDate: d.saleDate || new Date(),
              buyerId: buyer.id,
              totalPrice: 0,
              receivedAmount: 0,
              debtRemainder: 0,
              paymentStatus: 'DEBT',
              paymentType: 'DEBT',
              note: `#${d.dealNumber}: Umirzoq qarziga o'tkazildi (15.11.2026), sotuv narxi keyin kiritiladi`,
            },
          });
          await tx.deal.update({ where: { id: d.id }, data: { saleId: sale.id } });
          await applySaleToDeals(tx, sale.id);
        }
      },
      { timeout: 180_000, maxWait: 30_000 }
    );
    const after = await prisma.accountBalance.findMany();
    out(`\nYOZILDI. Kassa: ${after.map((b) => `${b.account} ${fmt(b.balance)}`).join('; ')}`);
    out(`Umirzoq sotuvlari: ${await prisma.sale.count({ where: { buyerId: buyer.id } })} ta`);
  } else {
    out('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  }
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  const file = path.join(dir, APPLY ? `move-sold-to-umirzoq-apply-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` : 'move-sold-to-umirzoq-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
