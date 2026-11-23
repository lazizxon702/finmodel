/**
 * 8-blok (23.11.2026) — BIR MARTALIK ma'lumot tuzatish. Standart DRY-RUN; yozish uchun --apply (avval backup-db-raw.ts!).
 *
 * 1) #8171: do'kon Novza → Trust, provayder 6 oylik Alif → Trust 1. Qayta hisob (spravochnik: Trust 16%):
 *    agentga 28 000 000 × (26% − 16%) = 2 800 000, foyda 28 000 000 × 16% = 4 480 000.
 *    Keyin Trust daftari (DEBT = to'liq limit) va do'kon daftari (Novza qarzi o'chadi) qayta moslanadi.
 *
 * 2) Qodir aka hisob-kitobi (egasining "Qodir aka" varag'i bo'yicha, 19.11 holatiga 9 537 960):
 *    • 07.11 gacha to'liq hisob-kitob: 08.11 dan oldingi cheklar qarzi yopiladi, faqat 84$ × 11 950 = 1 003 800 qoladi —
 *      buning uchun 07.11 sanasi bilan PAYMENT (DDS'siz, kassaga ta'sir qilmaydi) "07.11 gacha hisob-kitob" yoziladi;
 *    • 09.11 — 57 692 000: DDS'dagi TX-1075 ("Инвистиция Кодир ака") Qodir aka to'loviga bog'lanadi (kassa o'zgarmaydi);
 *    • 10.11 — 18 350 000 va 18 562 000; 12.11 — 8 989 000: DDS'da YO'Q — daftarga PAYMENT (DDS'siz) yoziladi;
 *    • 11.11 — 9 800 000 (TX-1159) allaqachon bog'langan.
 *    Depozit 10 000$ × 11 950 = 119 500 000 hisobga KIRMAYDI (egasining formulasida ishlatilmagan).
 */
import 'dotenv/config';
import { StoreEntryType } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { CalculationService, isQodirStore } from '../src/services/calculation.service';
import { loadActiveCommissionRules } from '../src/services/sale.service';
import { syncStoreDebtForDeal, syncTrustDebtForDeal } from '../src/services/ledger.service';

const APPLY = process.argv.includes('--apply');
const fmt = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('ru-RU').replace(/ /g, ' ');
const at = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`);

const QODIR_START_DEBT = 84 * 11_950; // 1 003 800
const QODIR_CUTOFF = new Date('2026-11-08T00:00:00+05:00');
const MANUAL_PAYMENTS = [
  { ymd: '2026-11-10', amount: 18_350_000, note: "Qodir aka to'lovi 10.11 (DDS'da yo'q; egasining jadvali)" },
  { ymd: '2026-11-10', amount: 18_562_000, note: "Qodir aka to'lovi 10.11 (DDS'da yo'q; egasining jadvali)" },
  { ymd: '2026-11-12', amount: 8_989_000, note: "Qodir aka to'lovi 12.11 (DDS'da yo'q; egasining jadvali)" },
];
const TARGET = 9_537_960;

async function main() {
  console.log(`═══ 8-BLOK: #8171 VA QODIR AKA ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const rules = await loadActiveCommissionRules();

  // ── 1) #8171 ──
  const d = await prisma.deal.findUnique({ where: { dealNumber: 8171 }, include: { store: true, provider: true, agency: true, trustEntry: true, storeEntry: true } });
  if (!d) throw new Error('#8171 topilmadi');
  const trustStore = await prisma.store.findFirst({ where: { name: 'Trust' } });
  const trustProv = await prisma.provider.findFirst({ where: { name: 'Trust 1' } });
  if (!trustStore || !trustProv) throw new Error('"Trust" do\'koni yoki "Trust 1" provayderi topilmadi');
  const already = d.storeId === trustStore.id && d.providerId === trustProv.id;
  const c = CalculationService.calculateDeal(
    {
      customerLimit: Number(d.customerLimit), withdrawnLimit: Number(d.withdrawnLimit), calculatedAmount: Number(d.calculatedAmount),
      storeName: trustStore.name, providerName: trustProv.name, salePrice: Number(d.salePrice), receivedFromBuyer: Number(d.receivedFromBuyer),
      status: d.status, date: d.date, agencyName: d.agency?.name,
    },
    rules
  );
  console.log(`\n#8171 ${already ? '(ALLAQACHON Trust — o\'tkazib yuboriladi)' : ''}`);
  console.log(`  do'kon/provayder: ${d.store.name} / ${d.provider.name} → ${trustStore.name} / ${trustProv.name}`);
  console.log(`  limit ${fmt(d.withdrawnLimit)}, mijozga ${fmt(d.calculatedAmount)}, diskont ${(c.purchaseDiscountPct * 100).toFixed(1)}%`);
  console.log(`  agentga ${fmt(d.agentAmount)} → ${fmt(c.agentAmount)} (kutilgan 2 800 000)`);
  console.log(`  foyda   ${fmt(d.profit)} → ${fmt(c.profit)} (kutilgan 4 480 000)`);
  console.log(`  Trust daromadi ${fmt(d.trustDebtAmount)} → ${fmt(c.trustDebtAmount)}; Trust daftari: ${d.trustEntry ? fmt(d.trustEntry.amount) : "yo'q"} → ${d.approvalStatus === 'APPROVED' ? fmt(d.withdrawnLimit) + ' (DEBT)' : "yo'q (tasdiqlanmagan)"}`);
  console.log(`  do'kon daftari: ${d.storeEntry ? `${d.store.name} DEBT ${fmt(d.storeEntry.amount)}` : "yo'q"} → yo'q (Trust do'kon daftariga kirmaydi)`);
  if (Math.round(c.agentAmount) !== 2_800_000 || Math.round(c.profit) !== 4_480_000) console.log('  ⚠ Kutilgan raqamlardan farq qiladi — APPLY qilinmaydi.');

  // ── 2) Qodir aka ──
  const qodir = (await prisma.store.findMany({ select: { id: true, name: true } })).find((s) => isQodirStore(s.name));
  if (!qodir) throw new Error('Qodir aka topilmadi');
  const entries = await prisma.storeLedgerEntry.findMany({ where: { storeId: qodir.id }, include: { deal: { select: { dealNumber: true, date: true } } } });
  const debt = entries.filter((e) => e.type === 'DEBT');
  const pay = entries.filter((e) => e.type === 'PAYMENT');
  const sum = (xs: typeof entries) => xs.reduce((s, e) => s + Number(e.amount), 0);
  const before = sum(debt) - sum(pay);
  const oldDebt = sum(debt.filter((e) => e.deal && e.deal.date < QODIR_CUTOFF));
  const newDebt = sum(debt.filter((e) => !e.deal || e.deal.date >= QODIR_CUTOFF));
  const settle = Math.round(oldDebt - QODIR_START_DEBT);
  const tx1075 = await prisma.ddsTransaction.findUnique({ where: { txNumber: 'TX-1075' }, include: { storeEntry: true } });
  const hasSettle = entries.some((e) => e.note?.startsWith('07.11 gacha hisob-kitob'));
  const link1075 = tx1075 && !tx1075.storeEntry && Number(tx1075.amount) === 57_692_000;
  const manual = MANUAL_PAYMENTS.filter((m) => !entries.some((e) => e.type === 'PAYMENT' && e.note === m.note && Number(e.amount) === m.amount && e.dateTime.getTime() === at(m.ymd).getTime()));
  const added = (hasSettle ? 0 : settle) + (link1075 ? 57_692_000 : 0) + manual.reduce((s, m) => s + m.amount, 0);
  const after = before - added;
  console.log('\nQODIR AKA');
  console.log(`  hozir: qarz ${fmt(sum(debt))} (${debt.length} chek), to'langan ${fmt(sum(pay))}, qoldiq ${fmt(before)}`);
  console.log(`  08.11 dan oldingi cheklar: ${fmt(oldDebt)}; keyingilari: ${fmt(newDebt)} (jadval: 52 124 000 + 69 803 160 = 121 927 160)`);
  console.log(`  + PAYMENT 07.11 "07.11 gacha hisob-kitob": ${fmt(settle)} (qolgan qarz 84$ = ${fmt(QODIR_START_DEBT)})${hasSettle ? ' — BOR, qo\'shilmaydi' : ''}`);
  console.log(`  + TX-1075 (09.11) 57 692 000 → to'lov${link1075 ? '' : ' — bog\'lanmaydi (topilmadi yoki allaqachon bog\'langan)'}`);
  for (const m of MANUAL_PAYMENTS) console.log(`  + PAYMENT ${m.ymd} ${fmt(m.amount)} (DDS'siz)${manual.includes(m) ? '' : ' — BOR'}`);
  console.log(`  natija: qoldiq ${fmt(before)} → ${fmt(after)} (kutilgan ${fmt(TARGET)}; farq ${fmt(after - TARGET)})`);

  if (!APPLY) {
    console.log('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.');
    return;
  }
  if (Math.round(after) !== TARGET) throw new Error('Qodir aka natijasi kutilganga teng emas — yozilmadi');
  if (!already && (Math.round(c.agentAmount) !== 2_800_000 || Math.round(c.profit) !== 4_480_000)) throw new Error('#8171 raqamlari kutilganga teng emas — yozilmadi');

  await prisma.$transaction(async (tx) => {
    if (!already) {
      await tx.deal.update({
        where: { id: d.id },
        data: {
          storeId: trustStore.id, providerId: trustProv.id,
          agentAmount: c.agentAmount, totalPurchaseCost: c.totalPurchaseCost, agentPct: c.agentPct, purchaseDiscountPct: c.purchaseDiscountPct,
          profit: c.profit, marginPct: c.marginPct, isActualDeviceSale: c.isActualDeviceSale, isDaftar: c.isDaftar, extraDaftar: c.extraDaftar,
          qodirDebt: c.qodirDebt, qodirBalance: c.qodirBalance, greenBazarBalance: c.greenBazarBalance, trustBalance: c.trustBalance,
          trustDebtAmount: c.trustDebtAmount, totalExtraBalance: c.totalExtraBalance,
        },
      });
      await syncTrustDebtForDeal(tx, d.id);
      await syncStoreDebtForDeal(tx, d.id);
      await tx.auditLog.create({ data: { entity: 'Deal', entityId: d.id, action: 'OVERRIDE', newValues: { rule: "Do'kon Novza → Trust, provayder 6 oylik Alif → Trust 1", reason: "8-blok (23.11.2026): egasining tuzatishi" } } });
    }
    if (!hasSettle) {
      await tx.storeLedgerEntry.create({ data: { storeId: qodir.id, type: StoreEntryType.PAYMENT, amount: settle, dateTime: at('2026-11-07'), note: `07.11 gacha hisob-kitob (qolgan qarz 84$ × 11 950 = ${fmt(QODIR_START_DEBT)})` } });
    }
    if (link1075 && tx1075) {
      await tx.storeLedgerEntry.create({ data: { storeId: qodir.id, type: StoreEntryType.PAYMENT, amount: tx1075.amount, dateTime: tx1075.dateTime, ddsTransactionId: tx1075.id, note: "Qodir aka to'lovi 09.11 (TX-1075)" } });
    }
    for (const m of manual) {
      await tx.storeLedgerEntry.create({ data: { storeId: qodir.id, type: StoreEntryType.PAYMENT, amount: m.amount, dateTime: at(m.ymd), note: m.note } });
    }
  });
  console.log('\nYOZILDI.');
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
