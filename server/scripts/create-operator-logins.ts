/**
 * Spravochnikdagi operatorlar (Agent yozuvlari) uchun login yaratadi / mavjud operator foydalanuvchisiga bog'laydi.
 *
 *   npx ts-node --transpile-only scripts/create-operator-logins.ts            (dry-run: faqat nima bo'lishini ko'rsatadi)
 *   npx ts-node --transpile-only scripts/create-operator-logins.ts --apply    (yozadi)
 *
 * - Har bir AGENT foydalanuvchi uchun uning agentligidagi FAOL Agent yozuvlari ko'riladi. Agent yozuvlariga tegilmaydi.
 * - Agentlikda bir nechta AGENT foydalanuvchi bo'lsa — o'sha agentlik o'tkazib yuboriladi (noaniq).
 * - Idempotent: foydalanuvchisi bor Agent yozuviga qayta tegilmaydi.
 * - Ekranga faqat ism va login chiqadi; parol HECH QACHON chiqmaydi.
 *   --apply bilan yangi login/parollar `backups/operator_logins.<sana>.txt` fayliga yoziladi (backups/ gitignore'da).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { formatTashkentDateTime } from '../src/services/calculation.service';
import { ensureOperatorsForAllAgents } from '../src/services/team.service';

const APPLY = process.argv.includes('--apply');
const SEPARATOR = ' | ';

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  console.log(`Baza: ${local ? 'lokal' : "MASOFAVIY (production bo'lishi mumkin)"}; rejim: ${APPLY ? '--apply (yozadi)' : 'dry-run (yozmaydi)'}`);

  const results = await ensureOperatorsForAllAgents({ dryRun: !APPLY });
  let created = 0;
  let linked = 0;
  let ambiguous = 0;
  const lines: string[] = [];

  for (const r of results) {
    if (r.ambiguous) {
      ambiguous++;
      console.log(`\n[${r.agentName}] agentlikda bir nechta AGENT foydalanuvchi bor — o'tkazib yuborildi (noaniq)`);
      continue;
    }
    console.log(`\n[${r.agentName}] foydalanuvchisiz operatorlar: ${r.missing}`);
    for (const l of r.linked) console.log(`  ${APPLY ? 'bog\'landi' : 'bog\'lanadi'}: ${l.fullName} -> ${l.username}`);
    for (const c of r.created) {
      console.log(`  ${APPLY ? 'yaratildi' : 'yaratiladi'}: ${c.fullName} -> ${c.username}`);
      if (c.password) lines.push([c.username, c.password, c.fullName, r.agentName].join(SEPARATOR));
    }
    created += r.created.length;
    linked += r.linked.length;
  }

  console.log(`\nJami: yaratiladi/yaratildi ${created}, bog'lanadi/bog'landi ${linked}, noaniq agentliklar ${ambiguous}`);

  if (APPLY && lines.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.resolve(__dirname, '../../backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `operator_logins.${stamp}.txt`);
    const header = [
      "# FinModel — operatorlar uchun login va parollar. MAXFIY: git'ga qo'shilmaydi.",
      `# Yaratilgan: ${formatTashkentDateTime(new Date())} (Toshkent vaqti)`,
      `# login${SEPARATOR}parol${SEPARATOR}ism${SEPARATOR}agent`,
    ];
    fs.writeFileSync(file, [...header, ...lines, ''].join('\n'), { encoding: 'utf8', mode: 0o600 });
    console.log(`Login va parollar faylga yozildi: ${file}`);
  } else if (!APPLY) {
    console.log("Dry-run: hech narsa yozilmadi. Yozish uchun --apply qo'shing.");
  }
}

main()
  .catch((error) => {
    console.error('Xatolik:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
