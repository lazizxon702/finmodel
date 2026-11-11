/**
 * Eski ma'lumotlarni yangi modellarga to'ldirish (qayta ishga tushirsa ham xavfsiz — idempotent):
 *   1) DealItem     — Deal.deviceItems (Json) yoki eski yagona maydonlardan (productName, imeiBarcode ...)
 *   2) Trust daftari — har bir tasdiqlangan Trust / Trust 1 bitimi uchun DEBT yozuvi (yechilgan limit × 16%)
 *   3) Hisob qoldiqlari — barcha DDS yozuvlaridan qayta hisoblanadi
 *
 *   npx ts-node --transpile-only scripts/backfill-ledger.ts            (dry-run: faqat ko'rsatadi)
 *   npx ts-node --transpile-only scripts/backfill-ledger.ts --apply    (bazaga yozadi)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { calcTrustDebt, isTrustDeal, normalizeDealItems } from '../src/services/calculation.service';
import { rebuildAccountBalances, syncTrustDebtForDeal } from '../src/services/ledger.service';

const APPLY = process.argv.includes('--apply');
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

async function main() {
  console.log(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN (hech narsa yozilmaydi). Yozish uchun: --apply');

  const deals = await prisma.deal.findMany({
    include: { store: { select: { name: true } }, provider: { select: { name: true } }, items: { select: { id: true } } },
    orderBy: { dealNumber: 'asc' },
  });

  // 1) DealItem
  let itemDeals = 0;
  let itemRows = 0;
  for (const d of deals) {
    if (d.items.length) continue;
    const raw = Array.isArray(d.deviceItems) && (d.deviceItems as any[]).length ? (d.deviceItems as any[]) : null;
    const source = raw || [
      { productName: d.productName, color: d.color, storageGb: d.storageGb, imei1: d.imeiBarcode, imei2: d.imei2, quantity: d.quantity },
    ];
    const { items } = normalizeDealItems(source);
    if (!items.length) continue;
    itemDeals++;
    itemRows += items.length;
    if (APPLY) await prisma.dealItem.createMany({ data: items.map((it) => ({ ...it, dealId: d.id })) });
  }
  console.log(`\n1) DealItem: ${itemDeals} ta bitim uchun ${itemRows} ta mahsulot qatori`);

  // 2) Trust daftari
  const trustDeals = deals.filter((d) => isTrustDeal(d.store?.name, d.provider?.name));
  let totalDebt = 0;
  console.log(`\n2) Trust bitimlari: ${trustDeals.length} ta`);
  for (const d of trustDeals) {
    const debt = d.approvalStatus === 'APPROVED' ? calcTrustDebt(Number(d.withdrawnLimit)) : 0;
    totalDebt += debt;
    console.log(
      `   #${d.dealNumber}  ${d.date.toISOString().slice(0, 10)}  ${(d.store?.name || '').padEnd(10)} / ${(d.provider?.name || '').padEnd(8)}  yechilgan ${fmt(Number(d.withdrawnLimit)).padStart(12)}  → qarz ${fmt(debt).padStart(11)}`
    );
    if (APPLY) await prisma.$transaction((tx) => syncTrustDebtForDeal(tx, d.id));
  }
  console.log(`   JAMI Trust qarzi: ${fmt(totalDebt)}`);

  // 3) Hisob qoldiqlari
  if (APPLY) {
    const totals = await rebuildAccountBalances();
    console.log('\n3) Hisob qoldiqlari qayta hisoblandi:');
    for (const [k, v] of Object.entries(totals)) console.log(`   ${k.padEnd(20)} ${fmt(v)}`);
  } else {
    const grouped = await prisma.ddsTransaction.groupBy({ by: ['account', 'type'], _sum: { amount: true } });
    console.log('\n3) Hisob qoldiqlari (DDS bo\'yicha, hali yozilmagan):');
    for (const g of grouped) console.log(`   ${g.account.padEnd(20)} ${g.type.padEnd(8)} ${fmt(Number(g._sum.amount))}`);
  }
}

main()
  .catch((e) => {
    console.error('Xato:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
