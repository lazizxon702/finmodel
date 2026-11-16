/**
 * Takror operatorlarni tartibga keltirish (egasi qarori, 14.11.2026). Standart — DRY-RUN; yozish uchun --apply.
 *
 *  1) BITTA agentlik ichida bir xil ismli (kirill/lotin: "Гулнур" = "Gulnur") operator yozuvlari birlashtiriladi:
 *     lotincha yozuv qoladi, ikkinchisining bitimlari unga ko'chadi, ortiqcha login va yozuv o'chiriladi.
 *     TURLI agentliklardagi bir xil ismlar (Jahongirdagi Sevinch va Nazirbekdagi Sevinch) HECH QACHON birlashtirilmaydi.
 *  2) Agentning o'zi nomidagi operator logini (agent Farida jamoasidagi "Farida") o'chiriladi; spravochnik yozuviga tegilmaydi.
 *  3) Turli agentlarda bir xil ismli operatorlar loginiga agent logini qo'shiladi (ruxsora -> ruxsora_asadbek).
 *
 * Parollarga tegilmaydi va ular ekranga chiqmaydi. Qayta ishga tushirish xavfsiz (idempotent).
 *
 *   npx ts-node --transpile-only scripts/merge-operator-duplicates.ts            (dry-run)
 *   npx ts-node --transpile-only scripts/merge-operator-duplicates.ts --apply
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { normalizeName, usernameBase } from '../src/services/team.service';

const APPLY = process.argv.includes('--apply');
const lines: string[] = [];
const out = (s = '') => {
  lines.push(s);
  console.log(s);
};
const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);

const userCounts = { dealsCreated: true, transactions: true, botDeals: true, leadsCreated: true, dealsApproved: true, operators: true } as const;
type Counts = Record<keyof typeof userCounts, number>;
const activity = (c: Counts) => c.dealsCreated + c.transactions + c.botDeals + c.leadsCreated + c.dealsApproved + c.operators;

/** Foydalanuvchini o'chiradi; ishi (bitim, DDS ...) bo'lsa o'chirmaydi — nofaol qiladi va spravochnikdan uzadi */
async function removeUser(tx: any, user: { id: string; username: string; _count: Counts }): Promise<string> {
  if (activity(user._count) > 0) {
    await tx.user.update({ where: { id: user.id }, data: { isActive: false, agentId: null } });
    return 'nofaol qilindi (kiritgan ishlari bor)';
  }
  await tx.auditLog.updateMany({ where: { userId: user.id }, data: { userId: null } });
  await tx.user.delete({ where: { id: user.id } });
  return "o'chirildi";
}

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  out('═══ TAKROR OPERATORLARNI TARTIBGA KELTIRISH ═══');
  out(`Baza: ${local ? 'lokal' : 'MASOFAVIY (jonli)'}; rejim: ${APPLY ? '--apply (YOZADI)' : 'DRY-RUN (yozmaydi)'}`);
  out('');

  // ───────── 1) Bitta agentlik ichidagi takror operator yozuvlari ─────────
  const agents = await prisma.agent.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      agencyId: true,
      agency: { select: { name: true } },
      user: { select: { id: true, username: true, _count: { select: userCounts } } },
      _count: { select: { deals: true } },
    },
  });
  const groups = new Map<string, typeof agents>();
  for (const a of agents) {
    const key = `${a.agencyId}::${normalizeName(a.name)}`;
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  out(`── 1) BITTA AGENT ICHIDA BIRLASHTIRILADI: ${dupGroups.length} ta ism ──`);
  let movedDeals = 0;
  let removedUsers = 0;
  for (const g of dupGroups) {
    // Qoladigan yozuv: lotincha ism; bir nechta bo'lsa — bitimi ko'pi
    const sorted = [...g].sort((a, b) => Number(hasCyrillic(a.name)) - Number(hasCyrillic(b.name)) || b._count.deals - a._count.deals);
    const keeper = sorted[0];
    const others = sorted.slice(1);
    const total = g.reduce((s, a) => s + a._count.deals, 0);
    out(`  [${keeper.agency.name}] "${keeper.name}" qoladi (bitim ${keeper._count.deals} → ${total}), login: ${keeper.user?.username || '—'}`);
    for (const o of others) {
      const userNote = !o.user ? "logini yo'q" : keeper.user ? `login ${o.user.username} o'chiriladi` : `login ${o.user.username} "${keeper.name}" ga o'tadi`;
      out(`      ← "${o.name}" (bitim ${o._count.deals}) qo'shiladi; ${userNote}; yozuv o'chiriladi`);
      movedDeals += o._count.deals;
      if (o.user && keeper.user) removedUsers++;
      if (!APPLY) continue;
      await prisma.$transaction(async (tx) => {
        await tx.deal.updateMany({ where: { agentId: o.id }, data: { agentId: keeper.id } });
        if (o.user) {
          if (keeper.user) {
            const res = await removeUser(tx, o.user);
            out(`         login ${o.user.username}: ${res}`);
          } else {
            // Qoladigan yozuvning logini yo'q — mavjud login unga o'tadi
            await tx.user.update({ where: { id: o.user.id }, data: { agentId: keeper.id, fullName: keeper.name } });
            keeper.user = o.user;
          }
        }
        await tx.agent.delete({ where: { id: o.id } });
      });
    }
  }
  out(`  Jami: ${movedDeals} ta bitim ko'chadi, ${removedUsers} ta ortiqcha login o'chadi.`);
  out('');

  // ───────── 2) Agentning o'zi nomidagi operator logini ─────────
  const operators = await prisma.user.findMany({
    where: { role: Role.OPERATOR, parentAgentId: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      fullName: true,
      isActive: true,
      agentId: true,
      parentAgent: { select: { id: true, username: true, fullName: true } },
      _count: { select: userCounts },
    },
  });
  const selfOps = operators.filter((o) => o.parentAgent && normalizeName(o.fullName) === normalizeName(o.parentAgent.fullName));
  out(`── 2) AGENTNING O'ZI NOMIDAGI OPERATOR LOGINI: ${selfOps.length} ta ──`);
  const removedIds = new Set<string>();
  for (const o of selfOps) {
    out(`  agent ${o.parentAgent!.username}: login ${o.username} ("${o.fullName}") o'chiriladi — agent o'z logini bilan kiradi`);
    removedIds.add(o.id);
    if (!APPLY) continue;
    const res = await prisma.$transaction((tx) => removeUser(tx, o));
    out(`      ${res}`);
  }
  out('');

  // ───────── 3) Turli agentlarda bir xil ismli operatorlar — loginga agent nomi qo'shiladi ─────────
  // (1-bosqichda o'chadigan loginlar hisobga olinmaydi)
  const goneUserIds = new Set<string>(removedIds);
  for (const g of dupGroups) {
    const sorted = [...g].sort((a, b) => Number(hasCyrillic(a.name)) - Number(hasCyrillic(b.name)) || b._count.deals - a._count.deals);
    const keeperHadUser = !!agents.find((a) => a.id === sorted[0].id)?.user;
    for (const o of sorted.slice(1)) if (o.user && keeperHadUser && o.user.id !== sorted[0].user?.id) goneUserIds.add(o.user.id);
  }
  const alive = APPLY
    ? await prisma.user.findMany({
        where: { role: Role.OPERATOR, parentAgentId: { not: null }, isActive: true },
        select: { id: true, username: true, fullName: true, parentAgent: { select: { username: true } } },
      })
    : operators.filter((o) => o.isActive && !goneUserIds.has(o.id));
  const byName = new Map<string, typeof alive>();
  for (const o of alive) {
    const key = normalizeName(o.fullName);
    byName.set(key, [...(byName.get(key) || []), o] as typeof alive);
  }
  const taken = new Set((await prisma.user.findMany({ select: { username: true } })).map((u) => u.username.toLowerCase()));
  const crossGroups = [...byName.values()].filter((g) => new Set(g.map((o) => o.parentAgent?.username)).size > 1);
  out(`── 3) TURLI AGENTLARDA BIR XIL ISM — LOGIN O'ZGARADI: ${crossGroups.length} ta ism ──`);
  let renamed = 0;
  for (const g of crossGroups) {
    for (const o of g) {
      const agent = String(o.parentAgent?.username || '').toLowerCase();
      if (o.username.toLowerCase().endsWith(`_${agent}`)) {
        out(`  "${o.fullName}" (${agent}): login ${o.username} — o'zgarmaydi`);
        continue;
      }
      let next = `${usernameBase(o.fullName).slice(0, 31 - agent.length)}_${agent}`;
      for (let n = 2; taken.has(next); n++) next = `${usernameBase(o.fullName).slice(0, 30 - agent.length)}${n}_${agent}`;
      taken.add(next);
      out(`  "${o.fullName}" (${agent}): login ${o.username} → ${next} (parol o'zgarmaydi)`);
      renamed++;
      if (APPLY) await prisma.user.update({ where: { id: o.id }, data: { username: next } });
    }
  }
  out(`  Jami: ${renamed} ta login nomi o'zgaradi.`);
  out('');
  out(APPLY ? 'YOZILDI.' : 'DRY-RUN tugadi — bazaga hech narsa yozilmadi.');

  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, APPLY ? `merge-operator-duplicates-apply-${stamp}.txt` : 'merge-operator-duplicates-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
