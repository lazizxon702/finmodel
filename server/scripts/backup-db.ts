/**
 * Bazaning to'liq JSON zaxira nusxasi (faqat o'qiydi, hech narsani o'zgartirmaydi).
 * Ishga tushirish:  npx ts-node --transpile-only scripts/backup-db.ts
 * Natija:           FinModel/backups/db-backup-<sana-vaqt>.json  (.gitignore'da)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const models = Prisma.dmmf.datamodel.models.map((m) => m.name);
  const dump: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const model of models) {
    const key = model.charAt(0).toLowerCase() + model.slice(1);
    const delegate = (prisma as any)[key];
    if (!delegate?.findMany) continue;
    const rows = await delegate.findMany();
    dump[model] = rows;
    counts[model] = rows.length;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `db-backup-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ createdAt: new Date().toISOString(), counts, data: dump }, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )
  );

  console.log('Zaxira saqlandi:', file);
  console.table(counts);
}

main()
  .catch((e) => {
    console.error('Zaxira olishda xato:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
