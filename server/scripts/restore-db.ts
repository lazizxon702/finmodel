/**
 * JSON zaxiradan bazani tiklash. FAQAT lokal (localhost) bazada ishlaydi — jonli bazani bosib ketmaslik uchun.
 * Ishga tushirish:  npx ts-node --transpile-only scripts/restore-db.ts [zaxira-fayl.json]
 * Fayl berilmasa, FinModel/backups ichidagi eng oxirgi zaxira olinadi. Baza bo'sh bo'lishi kerak.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || '';
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error('RAD ETILDI: DATABASE_URL lokal baza emas. Tiklash faqat localhost uchun ruxsat etilgan.');
  process.exit(1);
}

const prisma = new PrismaClient();

function reviveRow(model: Prisma.DMMF.Model, row: Record<string, any>) {
  const out: Record<string, any> = {};
  for (const f of model.fields) {
    if (f.kind !== 'scalar' && f.kind !== 'enum') continue;
    const v = row[f.name];
    if (v === null || v === undefined) continue;
    if (f.type === 'DateTime') out[f.name] = f.isList ? v.map((x: string) => new Date(x)) : new Date(v);
    else if (f.type === 'BigInt') out[f.name] = BigInt(v);
    else out[f.name] = v;
  }
  return out;
}

async function main() {
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  const file =
    process.argv[2] ||
    path.join(dir, fs.readdirSync(dir).filter((f) => f.startsWith('db-backup-') && f.endsWith('.json')).sort().pop()!);
  const { data } = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('Zaxira fayli:', file);

  const models = Prisma.dmmf.datamodel.models;
  const existing = await prisma.deal.count();
  if (existing > 0) {
    console.error(`RAD ETILDI: bazada allaqachon ${existing} ta bitim bor. Faqat bo'sh bazaga tiklanadi.`);
    process.exit(1);
  }

  const counts: Record<string, number> = {};
  await prisma.$transaction(
    async (tx) => {
      // FK tartibiga bog'lanmaslik uchun tekshiruvlarni shu tranzaksiya ichida o'chiramiz
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
      for (const model of models) {
        const rows: any[] = data[model.name] || [];
        if (!rows.length) continue;
        const key = model.name.charAt(0).toLowerCase() + model.name.slice(1);
        const revived = rows.map((r) => reviveRow(model, r));
        for (let i = 0; i < revived.length; i += 200) {
          await (tx as any)[key].createMany({ data: revived.slice(i, i + 200) });
        }
        counts[model.name] = rows.length;
      }
    },
    { timeout: 300000, maxWait: 20000 }
  );

  // Autoincrement ketma-ketliklarini maksimal qiymatga surish
  const seqs: { table_name: string; column_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`
  );
  for (const s of seqs) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${s.table_name}"', '${s.column_name}'),
              COALESCE((SELECT MAX("${s.column_name}") FROM "${s.table_name}"), 0) + 1, false)`
    );
  }

  console.log('Tiklandi:');
  console.table(counts);
}

main()
  .catch((e) => {
    console.error('Tiklashda xato:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
