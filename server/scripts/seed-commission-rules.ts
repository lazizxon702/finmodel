/**
 * Spravochnikdagi foiz qoidalarini egasi ro'yxatiga (14.11.2026) keltiradi. Qayta ishga tushirish xavfsiz (idempotent).
 * Manba — calculation.service.ts dagi DEFAULT_COMMISSION_RULES (yagona ro'yxat).
 *
 *   • har bir qoida uchun do'kon/provayder spravochnikdan kanonik nom bo'yicha topiladi (yo'q bo'lsa — yaratiladi);
 *   • shu do'kon/provayderning eski qoidalari (dublikatlari bilan) O'CHIRILADI va o'rniga ro'yxatdagisi yoziladi;
 *   • ro'yxatda yo'q do'kon/provayder qoidalariga tegilmaydi; do'koni ham, provayderi ham yo'q "bo'sh" qoidalar o'chiriladi.
 *
 *   npx ts-node --transpile-only scripts/seed-commission-rules.ts            (DRY-RUN: faqat ko'rsatadi)
 *   npx ts-node --transpile-only scripts/seed-commission-rules.ts --apply    (bazaga yozadi)
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import {
  DEFAULT_COMMISSION_RULES,
  canonicalProviderName,
  canonicalStoreName,
  normalizeName,
} from '../src/services/calculation.service';

const APPLY = process.argv.includes('--apply');
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 10000) / 100}%`);

function describeDatabase(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (e) {
    return "(DATABASE_URL o'qilmadi)";
  }
}

async function main() {
  console.log('═══ FOIZ QOIDALARI: spravochnikni egasi ro\'yxatiga keltirish ═══');
  console.log(APPLY ? '>>> YOZISH rejimi (--apply)' : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  console.log(`Baza: ${describeDatabase()}\n`);

  const [stores, providers, existing] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true } }),
    prisma.provider.findMany({ select: { id: true, name: true } }),
    prisma.commissionRule.findMany({ include: { store: true, provider: true } }),
  ]);
  const storeByKey = new Map(stores.map((s) => [normalizeName(canonicalStoreName(s.name)), s]));
  const providerByKey = new Map(providers.map((p) => [normalizeName(canonicalProviderName(p.name)), p]));

  // Ro'yxatdagi har bir nom → spravochnik yozuvi (yo'q bo'lsa yaratiladi)
  const targets = new Map<string, { kind: 'store' | 'provider'; name: string; id: string | null }>();
  for (const d of DEFAULT_COMMISSION_RULES) {
    const key = `${d.kind}:${normalizeName(d.name)}`;
    if (targets.has(key)) continue;
    const found =
      d.kind === 'store'
        ? storeByKey.get(normalizeName(canonicalStoreName(d.name)))
        : providerByKey.get(normalizeName(canonicalProviderName(d.name)));
    targets.set(key, { kind: d.kind, name: found?.name || d.name, id: found?.id || null });
  }

  const toCreateRefs = [...targets.values()].filter((t) => !t.id);
  if (toCreateRefs.length) {
    console.log('Spravochnikda yo\'q — YARATILADI:');
    for (const t of toCreateRefs) console.log(`   ${t.kind === 'store' ? "do'kon" : 'provayder'}: ${t.name}`);
    console.log('');
  }

  const targetStoreIds = new Set([...targets.values()].filter((t) => t.kind === 'store' && t.id).map((t) => t.id as string));
  const targetProviderIds = new Set(
    [...targets.values()].filter((t) => t.kind === 'provider' && t.id).map((t) => t.id as string)
  );
  const toDelete = existing.filter(
    (r) =>
      (!r.storeId && !r.providerId) ||
      (r.storeId && !r.providerId && targetStoreIds.has(r.storeId)) ||
      (r.providerId && !r.storeId && targetProviderIds.has(r.providerId))
  );
  const untouched = existing.filter((r) => !toDelete.includes(r));

  console.log(`Eski qoidalar: ${existing.length} ta; o'chiriladi (almashtiriladi): ${toDelete.length} ta; tegilmaydi: ${untouched.length} ta.`);
  for (const r of toDelete)
    console.log(`   − ${r.name} | ${r.store?.name || r.provider?.name || "(bo'sh)"} | ${pct(Number(r.ratePercent))}`);
  if (untouched.length) {
    console.log('Tegilmaydigan qoidalar:');
    for (const r of untouched) console.log(`   = ${r.name} | ${r.store?.name || ''} ${r.provider?.name || ''} | ${pct(Number(r.ratePercent))}`);
  }

  console.log(`\nYangi qoidalar: ${DEFAULT_COMMISSION_RULES.length} ta`);
  for (const d of DEFAULT_COMMISSION_RULES) {
    const t = targets.get(`${d.kind}:${normalizeName(d.name)}`)!;
    const period =
      d.validFromYmd || d.validToYmd ? ` | ${d.validFromYmd || '…'} → ${d.validToYmd || '…'}` : '';
    console.log(
      `   + ${t.kind === 'store' ? "do'kon  " : 'provayder'} ${t.name.padEnd(22)} ulush ${pct(d.ratePercent).padEnd(6)} foyda ${pct(d.profitPercent ?? d.ratePercent)}${period}`
    );
  }

  if (!APPLY) {
    console.log('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      for (const t of targets.values()) {
        if (t.id) continue;
        const created =
          t.kind === 'store'
            ? await tx.store.create({ data: { name: t.name } })
            : await tx.provider.create({ data: { name: t.name } });
        t.id = created.id;
      }
      if (toDelete.length) await tx.commissionRule.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });
      for (const d of DEFAULT_COMMISSION_RULES) {
        const t = targets.get(`${d.kind}:${normalizeName(d.name)}`)!;
        await tx.commissionRule.create({
          data: {
            name: `${t.name} — ${pct(d.ratePercent)}`,
            storeId: t.kind === 'store' ? t.id : null,
            providerId: t.kind === 'provider' ? t.id : null,
            ratePercent: d.ratePercent,
            profitPercent: d.profitPercent ?? null,
            validFrom: d.validFromYmd ? new Date(`${d.validFromYmd}T00:00:00+05:00`) : null,
            validTo: d.validToYmd ? new Date(`${d.validToYmd}T23:59:59.999+05:00`) : null,
            priority: d.kind === 'store' ? 10 : 5,
            isActive: true,
          },
        });
      }
    },
    { timeout: 60000, maxWait: 20000 }
  );
  console.log('\nYOZILDI.');
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
