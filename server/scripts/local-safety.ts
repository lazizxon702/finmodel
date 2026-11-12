/**
 * Lokal nusxa bazani tashqi tizimlardan uzish: jonli bazadan ko'chirilgan sozlamalar ichida haqiqiy
 * Google Sheets / webhook manzillari bo'ladi — lokal sinovda bitim yaratilsa haqiqiy jadvalga yozilib ketadi.
 * Bu skript FAQAT localhost bazada ishlaydi va shunday manzillarni bo'shatadi (asl qiymat *_disabled kalitida saqlanadi).
 *
 *   npx ts-node --transpile-only scripts/local-safety.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('RAD ETILDI: bu skript faqat lokal bazada ishlaydi.');
  process.exit(1);
}

async function main() {
  const settings = await prisma.appSetting.findMany();
  let changed = 0;
  for (const s of settings) {
    const value = String((s as any).value ?? '');
    const isExternal = /^https?:\/\//i.test(value.trim());
    const isSyncKey = /script|webhook|sheet|sync_url/i.test(s.key);
    if (!isExternal || !isSyncKey || s.key.endsWith('_disabled')) continue;
    await prisma.appSetting.upsert({
      where: { key: `${s.key}_disabled` },
      create: { key: `${s.key}_disabled`, value } as any,
      update: { value } as any,
    });
    await prisma.appSetting.update({ where: { key: s.key }, data: { value: '' } as any });
    console.log(`uzildi: ${s.key}`);
    changed++;
  }
  console.log(changed ? `Jami ${changed} ta tashqi manzil uzildi.` : 'Tashqi manzilli sozlama topilmadi.');
  console.log('Sozlama kalitlari:', settings.map((s) => s.key).join(', '));
}

main()
  .catch((e) => {
    console.error('Xato:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
