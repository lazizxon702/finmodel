/**
 * Jamoalarni egasi bergan Google jadval ("Agentar": xodim → rahbar, 14.11.2026) bo'yicha tartibga keltiradi.
 * Standart — DRY-RUN; yozish uchun --apply.
 *
 *  1) Agentlik nomi kirillda bo'lsa lotinga o'tadi ("Нафиса" → "Nafisa"); jadvalda bor, bazada yo'q agentlik yaratiladi.
 *  2) Operator (Agent yozuvi) jadvalda BOSHQA rahbarga yozilgan bo'lsa — o'sha rahbarga ko'chadi (bitimlari bilan).
 *     U yerda shu ismli yozuv bo'lsa — unga qo'shiladi. Jadvalda bir nechta rahbarda bor ismlarga (Sarvinoz ...) tegilmaydi.
 *  3) Bitim agentligi operatorining agentligidan farq qilsa — operatornikiga tenglashtiriladi.
 *  4) Jadvalda bor, spravochnikda yo'q operatorlar qo'shiladi.
 *
 * Summalar (limit, agent foydasi, foyda) O'ZGARMAYDI — faqat bitim qaysi jamoaga tegishli ekani o'zgaradi.
 *
 *   npx ts-node --transpile-only scripts/apply-team-sheet.ts            (dry-run)
 *   npx ts-node --transpile-only scripts/apply-team-sheet.ts --apply
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { personNameKey } from '../src/services/calculation.service';

const APPLY = process.argv.includes('--apply');

// Jadval: [xodim, rahbar]
const SHEET: [string, string][] = [
  ['Manzura', 'Asadbek'], ['Ruxsora', 'Asadbek'], ['Mubina', 'Asadbek'], ['Charos', 'Asadbek'], ['Malika', 'Asadbek'],
  ['Nozanin', 'Asadbek'], ['Gulsanam', 'Asadbek'], ['Xudoyor', 'Asadbek'], ['Safina', 'Asadbek'], ['Durdona', 'Asadbek'],
  ['Madina', 'Asadbek'], ['Iroda', 'Davlatbek'], ['Sevinch', 'Davlatbek'], ["Go'zal", 'Davlatbek'], ['Ayzoda', 'Davlatbek'],
  ['Zulfiya', 'Davlatbek'], ['Nozima', 'Davlatbek'], ['Sarvinoz', 'Davlatbek'], ['Davlatbek', 'Davlatbek'], ['Sevara', 'Davlatbek'],
  ['Farangiz', 'Davlatbek'], ['Shaxzodbek', 'Davlatbek'], ['Mushtariy', 'Nazirbek'], ['Sarvinoz', 'Nazirbek'], ['Javlonbek', 'Nazirbek'],
  ["Sug'diyona", 'Nazirbek'], ['Ozoda', 'Ozoda'], ['Apple', 'Apple'], ['Farida', 'Farida'], ['Nafisa', 'Nafisa'],
  ['Ruxshona', 'Asadbek'], ['Gulzoda', 'Asadbek'], ['Shaxzoda', 'Jahongir'], ['Roziya', 'Nazirbek'], ['Izzatbek', 'Nafisa'],
  ['Sarvinoz', 'Nafisa'], ['Sarvinoz', 'Asadbek'], ['Xosila', 'Jahongir'], ['Asadbek', 'Asadbek'],
  ['Bonu', 'Nazirbek'], ['Sitorabonu', 'Nazirbek'], ['Muslima', 'Nazirbek'], ['Kamron', 'Asadbek'], ['Nazokat', 'Jahongir'],
  ['Nigora', 'Nazirbek'], ['Gulnur', 'Jahongir'], ['Nargiza', 'Jahongir'], ['Oyqiz', 'Nazirbek'], ['Nasrin', 'Nazirbek'],
  ['Gavharoy', 'Nazirbek'], ['Ruxshona', 'Nazirbek'], ['Dilshoda', 'Nazirbek'], ['Shoxida', 'Nazirbek'], ['Xasan', 'Jahongir'],
  ['Ismigul', 'Asadbek'], ['Doniyor', 'Asadbek'], ['Muyassar', 'Jahongir'], ['Nozima', 'Asadbek'], ['Gulzoda', 'Nafisa'],
  ['Nazirbek', 'Nazirbek'], ['Nozi', 'Nafisa'], ['Safiya', 'Nazirbek'], ['Anvar', 'Anvar'], ['Shahlo', 'Jahongir'],
  ['Sabina', 'Nafisa'], ['Muborak', 'Jahongir'], ['Temur', 'Asadbek'], ['Marjona', 'Jahongir'], ['Sitora', 'Jahongir'],
  ['Muslima', 'Farida'],
  ['Ruxsora', 'Nazirbek'], // jadvalda yo'q; egasi 14.11 da aytdi: #3549 — agent Nazirbek, operator Ruxsora (Asadbekdagi Ruxsoradan boshqa odam)
  // Jadvalda "Xudoyor" va "Hudoyor" ikkalasi ham Asadbekda — bitta odam (x = h), bir marta olingan.
];

/** Egasi javobini kutadigan yozuvlar ("agentlik kaliti::ism kaliti") — tegilmaydi */
const HOLD = new Set<string>([
]);

const lines: string[] = [];
const out = (s = '') => {
  lines.push(s);
  console.log(s);
};
const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);
const num = (v: unknown) => Math.round(Number(v || 0)).toLocaleString('ru-RU');

async function main() {
  const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
  out('═══ JAMOALARNI JADVAL BO\'YICHA TARTIBGA KELTIRISH ═══');
  out(`Baza: ${local ? 'lokal' : 'MASOFAVIY (jonli)'}; rejim: ${APPLY ? '--apply (YOZADI)' : 'DRY-RUN (yozmaydi)'}`);
  out('');

  const leadersByOp = new Map<string, Set<string>>();
  const leaderNames = new Map<string, string>(); // kalit -> jadvaldagi lotin nom
  for (const [op, lead] of SHEET) {
    const lk = personNameKey(lead);
    leaderNames.set(lk, lead);
    leadersByOp.set(personNameKey(op), (leadersByOp.get(personNameKey(op)) || new Set()).add(lk));
  }

  await prisma.$transaction(
    async (tx) => {
      // ───────── 1) Agentliklar ─────────
      out('── 1) AGENTLIKLAR ──');
      let agencies = await tx.agency.findMany({ select: { id: true, name: true } });
      for (const a of agencies) {
        const want = leaderNames.get(personNameKey(a.name));
        if (want && a.name !== want && hasCyrillic(a.name) && !agencies.some((x) => x.name === want)) {
          out(`  "${a.name}" → "${want}" (nomi lotinga o'tadi)`);
          if (APPLY) await tx.agency.update({ where: { id: a.id }, data: { name: want } });
          a.name = want;
        }
      }
      for (const [lk, name] of leaderNames) {
        if (agencies.some((a) => personNameKey(a.name) === lk)) continue;
        out(`  "${name}" — yangi agentlik yaratiladi`);
        const created = APPLY ? await tx.agency.create({ data: { name }, select: { id: true, name: true } }) : { id: `yangi:${lk}`, name };
        agencies.push(created);
      }
      const agencyByKey = new Map(agencies.map((a) => [personNameKey(a.name), a]));
      const agencyById = new Map(agencies.map((a) => [a.id, a]));
      out('');

      // ───────── 2) Operator boshqa rahbarga yozilgan ─────────
      out('── 2) OPERATOR BOSHQA RAHBARGA KO\'CHADI ──');
      const rows = await tx.agent.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          agencyId: true,
          user: { select: { id: true, username: true, _count: { select: { dealsCreated: true, transactions: true, botDeals: true, leadsCreated: true, dealsApproved: true } } } },
          deals: { select: { withdrawnLimit: true, agentAmount: true } },
        },
      });
      let moved = 0;
      for (const r of rows) {
        const from = agencyById.get(r.agencyId)!;
        const fromKey = personNameKey(from.name);
        const opKey = personNameKey(r.name);
        const leaders = leadersByOp.get(opKey);
        const stat = `bitim ${r.deals.length}, limit ${num(r.deals.reduce((s, d) => s + Number(d.withdrawnLimit), 0))}, agent foydasi ${num(r.deals.reduce((s, d) => s + Number(d.agentAmount), 0))}`;
        if (HOLD.has(`${fromKey}::${opKey}`)) {
          out(`  ?? [${from.name}] "${r.name}" (${stat}) — EGASI JAVOBINI KUTADI, tegilmaydi`);
          continue;
        }
        if (!leaders) {
          out(`  ?? [${from.name}] "${r.name}" (${stat}) — jadvalda yo'q, tegilmaydi`);
          continue;
        }
        if (leaders.has(fromKey)) continue; // to'g'ri joyda
        if (leaders.size > 1) {
          out(`  ?? [${from.name}] "${r.name}" (${stat}) — jadvalda bir nechta rahbarda (${[...leaders].join(', ')}), tegilmaydi`);
          continue;
        }
        const target = agencyByKey.get([...leaders][0])!;
        const twin = rows.find((x) => x.agencyId === target.id && x.id !== r.id && personNameKey(x.name) === opKey);
        moved++;
        if (twin) {
          const userNote = r.user ? `; login ${r.user.username} ${twin.user ? "o'chiriladi (yoki ishi bo'lsa nofaol)" : `"${twin.name}" ga o'tadi`}` : '';
          out(`  [${from.name}] "${r.name}" → [${target.name}] "${twin.name}" ga qo'shiladi (${stat})${userNote}`);
          if (!APPLY) continue;
          await tx.deal.updateMany({ where: { agentId: r.id }, data: { agentId: twin.id, agencyId: target.id } });
          if (r.user) {
            if (twin.user) {
              const c = r.user._count;
              if (c.dealsCreated + c.transactions + c.botDeals + c.leadsCreated + c.dealsApproved > 0) {
                await tx.user.update({ where: { id: r.user.id }, data: { isActive: false, agentId: null } });
              } else {
                await tx.auditLog.updateMany({ where: { userId: r.user.id }, data: { userId: null } });
                await tx.user.delete({ where: { id: r.user.id } });
              }
            } else {
              // Login egasi boshqa jamoada edi — yangi jamoaning agenti (logini bo'lsa) ga o'tadi
              const lead = await tx.user.findFirst({ where: { role: 'AGENT', agencyId: target.id }, select: { id: true } });
              await tx.user.update({ where: { id: r.user.id }, data: { agentId: twin.id, parentAgentId: lead?.id ?? null } });
            }
          }
          await tx.agent.delete({ where: { id: r.id } });
        } else {
          out(`  [${from.name}] "${r.name}" → [${target.name}] ga ko'chadi (${stat})${r.user ? `; login ${r.user.username} ham shu jamoaga o'tadi` : ''}`);
          if (!APPLY) continue;
          await tx.agent.update({ where: { id: r.id }, data: { agencyId: target.id } });
          await tx.deal.updateMany({ where: { agentId: r.id }, data: { agencyId: target.id } });
          if (r.user) {
            const lead = await tx.user.findFirst({ where: { role: 'AGENT', agencyId: target.id }, select: { id: true } });
            await tx.user.update({ where: { id: r.user.id }, data: { parentAgentId: lead?.id ?? null } });
          }
        }
      }
      out(`  Jami: ${moved} ta operator yozuvi.`);
      out('');

      // ───────── 3) Bitim agentligi ≠ operator agentligi ─────────
      out('── 3) BITIM AGENTLIGI OPERATORNIKIGA TENGLASHTIRILADI ──');
      const deals = await tx.deal.findMany({
        where: { agentId: { not: null } },
        select: { id: true, dealNumber: true, agencyId: true, withdrawnLimit: true, agentAmount: true, agent: { select: { name: true, agencyId: true } } },
        orderBy: { dealNumber: 'asc' },
      });
      let fixed = 0;
      for (const d of deals) {
        if (!d.agent || d.agencyId === d.agent.agencyId) continue;
        // 2-bosqichda (dry-run) ko'chadigan yozuvlar bu yerda qayta chiqmasligi uchun: operator o'z agentligida to'g'ri turgan bo'lsagina
        const opLeaders = leadersByOp.get(personNameKey(d.agent.name));
        const agentAgency = agencyById.get(d.agent.agencyId);
        if (!APPLY && (!opLeaders || !agentAgency || !opLeaders.has(personNameKey(agentAgency.name)))) continue;
        fixed++;
        out(
          `  #${d.dealNumber}: operator "${d.agent.name}" — agentlik "${d.agencyId ? agencyById.get(d.agencyId)?.name : '—'}" → "${agentAgency?.name}" (limit ${num(d.withdrawnLimit)}, agent foydasi ${num(d.agentAmount)})`
        );
        if (APPLY) await tx.deal.update({ where: { id: d.id }, data: { agencyId: d.agent.agencyId } });
      }
      out(`  Jami: ${fixed} ta bitim.`);
      out('');

      // ───────── 4) Jadvalda bor, spravochnikda yo'q operatorlar ─────────
      out("── 4) SPRAVOCHNIKKA QO'SHILADIGAN OPERATORLAR ──");
      const after = APPLY ? await tx.agent.findMany({ select: { name: true, agencyId: true } }) : rows;
      const have = new Set(after.map((r) => `${personNameKey(agencyById.get(r.agencyId)?.name)}::${personNameKey(r.name)}`));
      // dry-run: 2-bosqichda ko'chadiganlar ham hisobga olinadi
      if (!APPLY) for (const r of rows) for (const lk of leadersByOp.get(personNameKey(r.name)) || []) if ((leadersByOp.get(personNameKey(r.name)) || new Set()).size === 1) have.add(`${lk}::${personNameKey(r.name)}`);
      const byLeader = new Map<string, string[]>();
      for (const [op, lead] of SHEET) {
        const key = `${personNameKey(lead)}::${personNameKey(op)}`;
        if (have.has(key)) continue;
        have.add(key);
        byLeader.set(lead, [...(byLeader.get(lead) || []), op]);
        if (APPLY) await tx.agent.create({ data: { name: op, agencyId: agencyByKey.get(personNameKey(lead))!.id } });
      }
      let added = 0;
      for (const [lead, ops] of byLeader) {
        added += ops.length;
        out(`  ${lead}: ${ops.join(', ')}`);
      }
      out(`  Jami: ${added} ta yangi operator yozuvi.`);
      out('');

      // ───────── Yakun: agentliklar bo'yicha (tasdiqlangan bitimlar) ─────────
      if (APPLY) {
        out('── YAKUN: AGENTLIKLAR BO\'YICHA (tasdiqlangan bitimlar) ──');
        const g = await tx.deal.groupBy({ by: ['agencyId'], where: { approvalStatus: 'APPROVED' }, _count: true, _sum: { withdrawnLimit: true, agentAmount: true } });
        const names = new Map((await tx.agency.findMany({ select: { id: true, name: true } })).map((a) => [a.id, a.name]));
        for (const x of g.sort((a, b) => Number(b._sum.withdrawnLimit) - Number(a._sum.withdrawnLimit))) {
          out(`  ${(x.agencyId ? names.get(x.agencyId) : '—') || '—'}: bitim ${x._count}, limit ${num(x._sum.withdrawnLimit)}, agent foydasi ${num(x._sum.agentAmount)}`);
        }
        // Bo'sh qolgan, jadvalda yo'q agentliklar
        const empty = await tx.agency.findMany({ where: { agents: { none: {} }, deals: { none: {} }, users: { none: {} } }, select: { id: true, name: true } });
        for (const e of empty) {
          if (leaderNames.has(personNameKey(e.name))) continue;
          out(`  Bo'sh agentlik "${e.name}" o'chirildi`);
          await tx.agency.delete({ where: { id: e.id } });
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  out(APPLY ? 'YOZILDI.' : 'DRY-RUN tugadi — bazaga hech narsa yozilmadi.');
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, APPLY ? `apply-team-sheet-apply-${stamp}.txt` : 'apply-team-sheet-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

main()
  .catch((e) => {
    console.error('Xato:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
