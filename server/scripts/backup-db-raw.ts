/**
 * Bazaning to'liq JSON zaxirasi — sxemaga bog'liq emas (bazadagi mavjud jadvallarni SQL orqali o'qiydi),
 * shuning uchun sxema yangilanishidan OLDIN ham ishlaydi. Faqat o'qiydi.
 *   npx ts-node --transpile-only scripts/backup-db-raw.ts [yorliq]
 * Natija: FinModel/backups/db-raw-<yorliq>-<sana-vaqt>.json
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tables: { table_name: string }[] = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    // row_to_json: Decimal/BigInt/sana turlari aniq saqlanadi
    const rows: { r: unknown }[] = await prisma.$queryRawUnsafe(`SELECT row_to_json(t) AS r FROM "${table_name}" t`);
    data[table_name] = rows.map((x) => x.r);
    counts[table_name] = rows.length;
  }
  const label = (process.argv[2] || 'db').replace(/[^a-z0-9_-]/gi, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `db-raw-${label}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), counts, data }));
  console.log('Zaxira saqlandi:', file, `(${Math.round(fs.statSync(file).size / 1024)} KB)`);
  console.log(
    Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join('  ')
  );
}

main()
  .catch((e) => {
    console.error('Zaxira olishda xato:', e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
