/**
 * Do'konlar tozalash va "provayder → do'kon" ro'yxati (egasi, 23.11.2026). Standart DRY-RUN; --apply bilan yozadi (avval backup-db-raw.ts!).
 *   1) Kerak emas do'konlar YASHIRILADI (isActive=false) — o'chirilmaydi: ularda eski cheklar, daftar va hisob-kitob bor.
 *   2) Nomlar: Chilonzor → Media park Chilonzor, Samarqand → Media park Samarqand, Gorkiy → Media park Gorkiy.
 *   3) Juftliklar (egasi ro'yxati; "Rebus" = "Iman rebus" do'koni) + Trust 1 → Trust; tekshiruv YOQILADI.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const APPLY = process.argv.includes('--apply');
const HIDE = ['Asosiy do\'kon', 'Birzum', 'Boshqa', 'Denov', 'Green Bazar', 'Angren', 'Jizzax', 'Novza', 'Xusanboy'];
const RENAME: [string, string][] = [
  ['Chilonzor', 'Media park Chilonzor'],
  ['Samarqand', 'Media park Samarqand'],
  ['Gorkiy', 'Media park Gorkiy'],
];
const PAIRS: [string, string][] = [
  ['Finsum Nasiya', 'Qodir aka'],
  ['Finsum Nasiya', 'Planet Phone'],
  ['Alif Offline', 'Iman rebus'],
  ['Alif Offline', 'Media park Angren'],
  ['Alif Offline', 'Media park Gorkiy'],
  ['Alif Offline', 'Media park Chilonzor'],
  ['Alif Offline', 'Media park Samarqand'],
  ['Alif Offline', 'Маргилон Медиа парк'],
  ['Alif Offline', 'Media park qoratosh'],
  ['Alif Online', 'Media park Gorkiy'],
  ['Imanum', 'Iman rebus'],
  ['Trust 1', 'Trust'],
];

async function main() {
  console.log(`═══ DO'KONLAR TOZALASH ═══ ${APPLY ? '(--apply: YOZADI)' : '(DRY-RUN: yozmaydi)'}`);
  const stores = await prisma.store.findMany({ select: { id: true, name: true, isActive: true, _count: { select: { deals: true } } } });
  const providers = await prisma.provider.findMany({ select: { id: true, name: true } });
  const byName = (n: string) => stores.find((s) => s.name === n);

  console.log('\n1) Yashiriladi (cheklar saqlanadi):');
  const hide = HIDE.map((n) => byName(n)).filter(Boolean) as typeof stores;
  for (const n of HIDE) {
    const s = byName(n);
    console.log(`   ${n}: ${s ? `${s._count.deals} chek${s.isActive ? '' : ' — allaqachon yashirin'}` : 'TOPILMADI'}`);
  }
  console.log('\n2) Nomi o\'zgaradi:');
  for (const [a, b] of RENAME) {
    const s = byName(a);
    const clash = byName(b);
    console.log(`   ${a} → ${b}: ${!s ? 'TOPILMADI' : clash ? 'BU NOM BAND — o\'tkazib yuboriladi' : `${s._count.deals} chek`}`);
  }
  const finalName = (n: string) => RENAME.find(([, b]) => b === n)?.[0] || n;
  console.log('\n3) Juftliklar:');
  const pairRows: { storeId: string; providerId: string }[] = [];
  for (const [pn, sn] of PAIRS) {
    const p = providers.find((x) => x.name === pn);
    const s = byName(sn) || byName(finalName(sn));
    console.log(`   ${pn} → ${sn}: ${p && s ? 'ok' : `TOPILMADI (${!p ? 'provayder' : "do'kon"})`}`);
    if (p && s) pairRows.push({ storeId: s.id, providerId: p.id });
  }
  console.log(`\n   Tekshiruv yoqiladi. Ro'yxatda yo'q provayderlar (Variant, Paylater, Payme, Infin, 6 oylik Alif, Alif nasiya, Birzum...) — hamma faol do'konlar bilan.`);
  const left = stores.filter((s) => s.isActive && !HIDE.includes(s.name)).map((s) => RENAME.find(([a]) => a === s.name)?.[1] || s.name);
  console.log(`\n   Formada qoladigan do'konlar (${left.length}): ${left.sort().join(', ')}`);

  if (!APPLY) {
    console.log('\nDRY-RUN tugadi — bazaga hech narsa yozilmadi.');
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.store.updateMany({ where: { id: { in: hide.map((s) => s.id) } }, data: { isActive: false } });
    for (const [a, b] of RENAME) {
      const s = byName(a);
      if (s && !byName(b)) await tx.store.update({ where: { id: s.id }, data: { name: b } });
    }
    await tx.storeProviderPair.createMany({ data: pairRows, skipDuplicates: true });
    await tx.appSetting.upsert({
      where: { key: 'store_provider_check' },
      update: { value: 'on' },
      create: { key: 'store_provider_check', value: 'on', description: "Do'kon — provayder juftligi tekshiruvi" },
    });
  }, { timeout: 60_000, maxWait: 30_000 });
  console.log('\nYOZILDI.');
}
main().catch((e) => { console.error('Xato:', e?.message || e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
