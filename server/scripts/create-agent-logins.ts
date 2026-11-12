/**
 * Agentlar uchun kirish (login) yaratadi: har bir agent o'z agentligiga bog'langan AGENT rolidagi foydalanuvchi bo'ladi.
 *
 *   npx ts-node --transpile-only scripts/create-agent-logins.ts            (yo'q foydalanuvchilarni yaratadi)
 *   npx ts-node --transpile-only scripts/create-agent-logins.ts --reset    (mavjudlarining parolini ham yangilaydi)
 *
 * - Agentlik canonicalAgencyName orqali topiladi; kirill/lotin dublikat bo'lsa LOTIN nomlisi tanlanadi,
 *   lotin nomlisi yo'q bo'lsa shu nom bilan yaratiladi.
 * - Parol crypto.randomBytes asosida tasodifiy 14 belgi; bazaga FAQAT bcrypt xeshi yoziladi.
 * - Login/parollar FAQAT loyiha ildizidagi `agent_logins.local.txt` fayliga yoziladi (.gitignore'da bor).
 *   Ekranga (stdout) parol HECH QACHON chiqmaydi.
 * - Idempotent: mavjud foydalanuvchi o'zgartirilmaydi (faqat --reset bilan paroli yangilanadi).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { canonicalAgencyName, formatTashkentDateTime } from '../src/services/calculation.service';
import { generatePassword, hashPassword } from '../src/routes/auth.routes';

const RESET = process.argv.includes('--reset');
const PASSWORD_LENGTH = 14;
const OUTPUT_FILE = path.resolve(__dirname, '../../agent_logins.local.txt');
const SEPARATOR = ' | ';

/** fullName — foydalanuvchi yozganidek; agency — bazadagi yagona (lotin) agentlik nomi */
const AGENTS = [
  { fullName: 'Назирбек', agency: 'Nazirbek', username: 'nazirbek' },
  { fullName: 'Асадбек', agency: 'Asadbek', username: 'asadbek' },
  { fullName: 'Фарида', agency: 'Farida', username: 'farida' },
  { fullName: 'Жахонгир', agency: 'Jahongir', username: 'jahongir' },
  { fullName: 'MacMobi', agency: 'MacMobi', username: 'macmobi' },
];

interface LoginLine {
  username: string;
  password: string;
  fullName: string;
  agency: string;
}

/** Fayldagi avvalgi yozuvlar — qayta ishga tushirilganda o'zgarmagan loginlar yo'qolib qolmasin */
function readExistingFile(): Map<string, LoginLine> {
  const entries = new Map<string, LoginLine>();
  if (!fs.existsSync(OUTPUT_FILE)) return entries;
  for (const raw of fs.readFileSync(OUTPUT_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [username, password, fullName, agency] = line.split(SEPARATOR).map((part) => part.trim());
    if (username && password) entries.set(username, { username, password, fullName: fullName || '', agency: agency || '' });
  }
  return entries;
}

function writeFile(entries: Map<string, LoginLine>) {
  const lines = [
    '# FinModel — agentlar uchun login va parollar. MAXFIY: git\'ga qo\'shilmaydi, hech kimga ochiq yubormang.',
    `# Yangilangan: ${formatTashkentDateTime(new Date())} (Toshkent vaqti)`,
    '# Parol bazada faqat xesh ko\'rinishida saqlanadi — bu fayl yo\'qolsa, parolni --reset bilan yangilang.',
    `# login${SEPARATOR}parol${SEPARATOR}ism${SEPARATOR}agentlik`,
    ...AGENTS.filter((a) => entries.has(a.username)).map((a) => {
      const e = entries.get(a.username)!;
      return [e.username, e.password, e.fullName, e.agency].join(SEPARATOR);
    }),
    '',
  ];
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
}

/** Agentlikni topadi (lotin nomlisi ustun) yoki lotin nom bilan yaratadi */
async function findOrCreateAgency(latinName: string): Promise<{ id: string; name: string }> {
  const all = await prisma.agency.findMany({ select: { id: true, name: true } });
  const matches = all.filter((a) => canonicalAgencyName(a.name) === latinName);
  const isLatin = (name: string) => /^[\x20-\x7E]+$/.test(name);
  const chosen = matches.find((a) => a.name === latinName) || matches.find((a) => isLatin(a.name));
  if (chosen) {
    const duplicates = matches.filter((a) => a.id !== chosen.id).length;
    if (duplicates) console.log(`  diqqat: "${latinName}" agentligining ${duplicates} ta dublikati bor (birlashtirilmagan)`);
    return chosen;
  }
  const created = await prisma.agency.create({ data: { name: latinName }, select: { id: true, name: true } });
  console.log(`agentlik yaratildi: ${latinName}`);
  return created;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  console.log(`Baza: ${local ? 'lokal' : 'MASOFAVIY (production bo\'lishi mumkin)'}${RESET ? '; rejim: --reset (parollar yangilanadi)' : ''}`);

  const entries = readExistingFile();
  let fileChanged = false;

  for (const agent of AGENTS) {
    const agency = await findOrCreateAgency(agent.agency);
    const existing = await prisma.user.findUnique({
      where: { username: agent.username },
      select: { id: true, role: true, agencyId: true },
    });

    if (existing && !RESET) {
      const notes: string[] = [];
      if (existing.role !== Role.AGENT) notes.push(`roli ${existing.role} (AGENT emas)`);
      if (existing.agencyId !== agency.id) notes.push('boshqa agentlikka bog\'langan yoki bog\'lanmagan');
      console.log(`mavjud: ${agent.username}${notes.length ? ' — diqqat: ' + notes.join(', ') : ''} (o'zgartirilmadi)`);
      continue;
    }

    const password = generatePassword(PASSWORD_LENGTH);
    const passwordHash = await hashPassword(password);

    if (existing) {
      // --reset: faqat parol yangilanadi (rol va agentlik bog'lanishiga tegilmaydi)
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, initialPassword: null } });
      console.log(`parol yangilandi: ${agent.username}`);
    } else {
      await prisma.user.create({
        data: {
          username: agent.username,
          fullName: agent.fullName,
          passwordHash,
          role: Role.AGENT,
          agencyId: agency.id,
        },
      });
      console.log(`yaratildi: ${agent.username}`);
    }

    entries.set(agent.username, { username: agent.username, password, fullName: agent.fullName, agency: agency.name });
    fileChanged = true;
  }

  if (fileChanged) {
    writeFile(entries);
    console.log(`Login va parollar faylga yozildi: ${OUTPUT_FILE}`);
  } else {
    console.log("Yangi login yaratilmadi — fayl o'zgartirilmadi.");
  }
}

main()
  .catch((error) => {
    // Xato matnida parol bo'lmaydi (parollar faqat xotirada va faylda)
    console.error('Xatolik:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
