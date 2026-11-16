/**
 * FAQAT O'QIYDI: takror (bir xil ismli) foydalanuvchi loginlari va spravochnikdagi takror operator (Agent) yozuvlari hisoboti.
 * Ismlar kirill→lotin o'girilib, kichik harfda solishtiriladi (Гулнур = Gulnur). Parollar HECH QACHON chiqmaydi.
 *
 *   npx ts-node --transpile-only scripts/report-duplicate-users.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { normalizeName } from '../src/services/team.service';

async function main() {
  const [users, agents] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        agentId: true,
        agency: { select: { name: true } },
        parentAgent: { select: { username: true, fullName: true } },
        agentRecord: { select: { name: true, agency: { select: { name: true } } } },
        _count: { select: { dealsCreated: true, transactions: true } },
      },
    }),
    prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        agency: { select: { name: true } },
        user: { select: { username: true } },
        _count: { select: { deals: true } },
      },
    }),
  ]);

  const byRole = new Map<string, number>();
  for (const u of users) byRole.set(u.role, (byRole.get(u.role) || 0) + 1);
  console.log(`Foydalanuvchilar: ${users.length} ta — ${[...byRole.entries()].map(([r, n]) => `${r} ${n}`).join(', ')}`);
  console.log(`Spravochnikdagi operator (Agent) yozuvlari: ${agents.length} ta\n`);

  const describeUser = (u: (typeof users)[number]) =>
    `    login ${u.username.padEnd(22)} | "${u.fullName}" | ${u.role}${u.isActive ? '' : ' (nofaol)'} | ` +
    `agent: ${u.parentAgent?.username || u.agency?.name || '—'} | spravochnik: ${u.agentRecord ? `${u.agentRecord.agency.name} / ${u.agentRecord.name}` : '—'} | ` +
    `kiritgan bitim ${u._count.dealsCreated}, DDS ${u._count.transactions} | yaratilgan ${u.createdAt.toISOString().slice(0, 10)}`;

  // 1) Bir xil ismli foydalanuvchilar
  const userGroups = new Map<string, typeof users>();
  for (const u of users) {
    const key = normalizeName(u.fullName);
    userGroups.set(key, [...(userGroups.get(key) || []), u]);
  }
  const dupUsers = [...userGroups.entries()].filter(([, g]) => g.length > 1);
  console.log(`── 1) BIR XIL ISMLI FOYDALANUVCHILAR: ${dupUsers.length} ta ism (${dupUsers.reduce((s, [, g]) => s + g.length, 0)} ta login) ──`);
  for (const [key, g] of dupUsers) {
    const sameAgent = new Set(g.map((u) => u.parentAgent?.username || u.agency?.name || '—')).size === 1;
    console.log(`  [${key}] ${g.length} ta login — ${sameAgent ? 'BITTA agent ichida' : 'TURLI agentlarda'}`);
    for (const u of g) console.log(describeUser(u));
  }

  // 2) Spravochnikda bir xil ismli operator yozuvlari
  const agentGroups = new Map<string, typeof agents>();
  for (const a of agents) {
    const key = normalizeName(a.name);
    agentGroups.set(key, [...(agentGroups.get(key) || []), a]);
  }
  const dupAgents = [...agentGroups.entries()].filter(([, g]) => g.length > 1);
  console.log(`\n── 2) SPRAVOCHNIKDA BIR XIL ISMLI OPERATOR YOZUVLARI: ${dupAgents.length} ta ism ──`);
  for (const [key, g] of dupAgents) {
    const sameAgency = new Set(g.map((a) => a.agency.name)).size === 1;
    console.log(`  [${key}] ${g.length} ta yozuv — ${sameAgency ? 'BITTA agentlik ichida' : 'TURLI agentliklarda'}`);
    for (const a of g) {
      console.log(
        `    "${a.name}" | agentlik: ${a.agency.name}${a.isActive ? '' : ' (yashirilgan)'} | bitim ${a._count.deals} | login: ${a.user?.username || '—'}`
      );
    }
  }

  // 3) Agentlar bo'yicha operatorlar soni
  console.log("\n── 3) AGENTLAR BO'YICHA ──");
  for (const agentUser of users.filter((u) => u.role === 'AGENT')) {
    const ops = users.filter((u) => u.parentAgent?.username === agentUser.username);
    console.log(`  ${agentUser.username} (${agentUser.agency?.name || '—'}): ${ops.length} ta operator logini`);
  }
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
