/**
 * Qodir aka bergan pulni (DDS KIRIMI) Qodir aka hisob-kitobiga TO'LOV qilib bog'laydi. Standart — DRY-RUN; yozish uchun --apply.
 *
 * Ilgari "Qodir aka prixod" kabi nom bilan kiritilgan kirimlar hisob-kitobga tushmagan. Bu skript shunday qatorlarni topadi
 * (kategoriya — isQodirPaymentCategory; hali daftarga bog'lanmagan) va:
 *   • kategoriyani "Qodir aka to'lovi", manbani QODIR_PAYMENT, toifani INCOME_TRANSFER (daromad emas) qiladi;
 *   • Qodir aka hisob-kitobiga PAYMENT yozuvi qo'shadi. Summa, sana va kassa qoldig'i O'ZGARMAYDI.
 * INVESTITSIYA ("Инвистиция Кодир ака") — alohida, bog'lanMAYDI (egasi qarori, 14.11.2026).
 */
import 'dotenv/config';
import { DdsSource, ExpenseCategoryType, StoreEntryType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { QODIR_PAYMENT_CATEGORY, formatTashkentDateTime, isQodirPaymentCategory, isQodirStore } from '../src/services/calculation.service';

const APPLY = process.argv.includes('--apply');
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU');

async function main() {
  console.log(`═══ QODIR AKA TO'LOVLARINI HISOB-KITOBGA BOG'LASH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const store = (await prisma.store.findMany({ select: { id: true, name: true } })).find((s) => isQodirStore(s.name));
  if (!store) throw new Error('"Qodir aka" do\'koni topilmadi');
  const rows = (await prisma.ddsTransaction.findMany({ where: { type: 'INCOME', storeEntry: null }, orderBy: { dateTime: 'asc' } })).filter((t) => isQodirPaymentCategory(t.categoryName));
  let total = 0;
  for (const t of rows) {
    total += Number(t.amount);
    console.log(`  ${t.txNumber} ${formatTashkentDateTime(t.dateTime)} ${fmt(t.amount)} so'm | "${t.categoryName}" → "${QODIR_PAYMENT_CATEGORY}" | ${t.description || ''}`);
    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      await tx.ddsTransaction.update({ where: { id: t.id }, data: { categoryName: QODIR_PAYMENT_CATEGORY, source: DdsSource.QODIR_PAYMENT, expenseType: ExpenseCategoryType.INCOME_TRANSFER, sourcePerson: store.name } });
      await tx.storeLedgerEntry.create({ data: { storeId: store.id, type: StoreEntryType.PAYMENT, amount: t.amount, dateTime: t.dateTime, ddsTransactionId: t.id, note: t.description || 'Qodir aka bergan pul', createdById: t.createdById } });
    });
  }
  console.log(`  Jami: ${rows.length} ta kirim, ${fmt(total)} so'm.`);
  console.log(APPLY ? 'YOZILDI.' : 'DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
