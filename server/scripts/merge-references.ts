/**
 * Spravochnik dublikatlarini birlashtirish: do'konlar, provayderlar, agentliklar va (bitta agentlik ichida) agentlar.
 *
 *   npx ts-node --transpile-only scripts/merge-references.ts            (DRY-RUN: faqat ro'yxat, bazaga yozilmaydi)
 *   npx ts-node --transpile-only scripts/merge-references.ts --apply    (bazaga yozadi — BITTA tranzaksiyada)
 *
 * Qoidalar:
 *   - Guruhlash: kanonik nom (calculation.service: STORE_/PROVIDER_/AGENCY_ALIASES) + normalizeName
 *     (katta-kichik harf, ortiqcha bo'shliq, tirnoq farqi) bo'yicha bir xil chiqadigan yozuvlar — bitta guruh.
 *   - Omon qoluvchi: nomi kanonik nomga aynan teng yozuv; bo'lmasa bitimi eng ko'p yozuv kanonik nomga qayta nomlanadi.
 *   - Qolgan yozuvlarning barcha bog'lanishlari omon qoluvchiga ko'chiriladi, so'ng ular o'chiriladi:
 *       Store    ← Deal.storeId, CommissionRule.storeId
 *       Provider ← Deal.providerId, CommissionRule.providerId
 *       Agency   ← Deal.agencyId, Agent.agencyId, User.agencyId
 *       Agent    ← Deal.agentId
 *     Nomni MATN sifatida saqlaydigan maydonlar ham yangi nomga o'tkaziladi:
 *       BotDeal.storeName / providerName / agencyName, BotOperatorReport.storeName, Lead.providerName,
 *       SwotAgencyAnalysis.agencyName
 *   - Kirill/lotin juftliklari ("Малика" / "Malika") avtomatik BIRLASHTIRILMAYDI — "ehtimoliy dublikatlar" ro'yxatida ko'rsatiladi.
 *   - Yo'q bo'lsa qo'shiladi: do'kon "Маргилон Медиа парк", agentlik "MacMobi".
 *
 * Natija FinModel/backups/merge-dry-run.txt (yoki merge-apply-<vaqt>.txt) fayliga ham yoziladi.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';
import { CalculationService, CommissionRuleItem, normalizeName } from '../src/services/calculation.service';
import {
  ReferenceGroup,
  ReferenceKind,
  canonicalReferenceName,
  cleanName,
  groupReferences,
  referenceKey,
} from '../src/services/sheetsSync.service';

// ════════════════════════════════════════════════════════════════════
//  SOF FUNKSIYALAR (tests/merge-references.test.ts da sinalgan)
// ════════════════════════════════════════════════════════════════════

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '',
  ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/**
 * Ismning "skeleti": kirill → lotin, so'ng yozilish farqlari tekislanadi (x/h/kh, q/k, yo/o, ya/a, qo'sh harflar).
 * "Шахло", "Shaxlo", "Shahlo" → bir xil skelet. Faqat EHTIMOLIY dublikatni ko'rsatish uchun — avtomatik birlashtirish uchun emas.
 */
export function translitSkeleton(name?: string | null, collapseDoubles = true): string {
  let s = normalizeName(name);
  s = [...s].map((ch) => (Object.prototype.hasOwnProperty.call(CYRILLIC_TO_LATIN, ch) ? CYRILLIC_TO_LATIN[ch] : ch)).join('');
  s = s.replace(/[^a-z0-9 ]/g, '');
  s = s.replace(/kh/g, 'h').replace(/x/g, 'h').replace(/q/g, 'k');
  s = s.replace(/y(?=[aeou])/g, '');
  if (collapseDoubles) s = s.replace(/([a-z])\1+/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export interface NamedItem {
  id: string;
  name: string;
  /** Faqat bir xil doiradagi (masalan, bitta agentlikdagi) nomlar solishtiriladi */
  scope: string;
}

export interface ProbablePair<T extends NamedItem> {
  a: T;
  b: T;
  reason: 'translit' | 'similar' | 'swapped';
}

/**
 * Ehtimoliy dublikat juftliklari (avtomatik birlashtirilmaydi):
 *   translit — kirill/lotin yozuvi bir xil o'qiladi ("Малика" / "Malika");
 *   similar  — skeletlar bitta harf bilan farq qiladi ("Сугдиена" / "Sug'diyona");
 *   swapped  — harflar bir xil, o'rni almashgan ("Paylater" / "Payletar").
 * normalizeName bo'yicha AYNAN bir xil nomlar bu yerga kirmaydi — ular avtomatik birlashtiriladi.
 */
export function findProbableDuplicates<T extends NamedItem>(items: T[]): ProbablePair<T>[] {
  const pairs: ProbablePair<T>[] = [];
  const enriched = items.map((it) => {
    const skeleton = translitSkeleton(it.name);
    // "bir harf farq" qo'sh harflar saqlangan holda o'lchanadi ("offline" / "online" bitta harf farq deb chiqmasin)
    const full = translitSkeleton(it.name, false);
    return { it, norm: normalizeName(it.name), skeleton, full, letters: [...full.replace(/ /g, '')].sort().join('') };
  });
  for (let i = 0; i < enriched.length; i++) {
    for (let j = i + 1; j < enriched.length; j++) {
      const x = enriched[i];
      const y = enriched[j];
      if (x.it.scope !== y.it.scope || x.norm === y.norm || !x.skeleton || !y.skeleton) continue;
      const minLen = Math.min(x.full.length, y.full.length);
      let reason: ProbablePair<T>['reason'] | null = null;
      if (x.skeleton === y.skeleton) reason = 'translit';
      else if (minLen >= 5 && levenshtein(x.full, y.full) <= 1) reason = 'similar';
      else if (minLen >= 6 && x.letters === y.letters) reason = 'swapped';
      if (reason) pairs.push({ a: x.it, b: y.it, reason });
    }
  }
  return pairs;
}

export interface AgentLite {
  id: string;
  name: string;
  agencyId: string;
  dealCount: number;
}

export interface AgentMergeGroup<T extends AgentLite> {
  /** Birlashtirishdan keyingi agentlik */
  agencyId: string;
  survivor: T;
  duplicates: T[];
}

/**
 * Agentliklar birlashgach, BITTA agentlik ichida normalizeName bo'yicha aynan bir xil ismli agentlarni guruhlaydi.
 * agencyIdMap: o'chiriladigan agentlik id → omon qoluvchi agentlik id.
 * Omon qoluvchi agent: bitimi eng ko'p; teng bo'lsa — allaqachon omon qoluvchi agentlikda turgani.
 */
export function planAgentMerges<T extends AgentLite>(agents: T[], agencyIdMap: Map<string, string>): AgentMergeGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const a of agents) {
    const finalAgencyId = agencyIdMap.get(a.agencyId) || a.agencyId;
    const key = `${finalAgencyId}|${normalizeName(a.name)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(a);
  }
  const groups: AgentMergeGroup<T>[] = [];
  for (const [key, members] of buckets) {
    if (members.length < 2) continue;
    const agencyId = key.slice(0, key.indexOf('|'));
    const sorted = [...members].sort(
      (a, b) =>
        b.dealCount - a.dealCount ||
        Number(b.agencyId === agencyId) - Number(a.agencyId === agencyId) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id)
    );
    groups.push({ agencyId, survivor: sorted[0], duplicates: sorted.slice(1) });
  }
  return groups;
}

// ════════════════════════════════════════════════════════════════════
//  SKRIPT
// ════════════════════════════════════════════════════════════════════

const REQUIRED_STORES = ['Маргилон Медиа парк'];
const REQUIRED_AGENCIES = ['MacMobi'];

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

const lines: string[] = [];
function out(line = '') {
  lines.push(line);
  console.log(line);
}

function table(headers: string[], rows: (string | number)[][], rightAlign: number[] = []) {
  const all = [headers, ...rows.map((r) => r.map((c) => String(c)))];
  const widths = headers.map((_, i) => Math.max(...all.map((r) => (r[i] || '').length)));
  const render = (r: string[]) =>
    '  ' + r.map((c, i) => (rightAlign.includes(i) ? (c || '').padStart(widths[i]) : (c || '').padEnd(widths[i]))).join('  │  ').trimEnd();
  out(render(headers));
  out('  ' + widths.map((w) => '─'.repeat(w)).join('──┼──'));
  for (const r of all.slice(1)) out(render(r));
}

/** Baza manzili (parol/loginlarsiz) — qaysi bazada ishlayotganini ko'rsatish uchun */
function describeDatabase(): string {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (e) {
    return "(DATABASE_URL o'qilmadi)";
  }
}

const KIND_LABEL: Record<ReferenceKind, string> = { store: "Do'kon", provider: 'Provayder', agency: 'Agentlik' };

interface RefRow {
  id: string;
  name: string;
  dealCount: number;
  ruleCount: number;
  agentCount: number;
  userCount: number;
  attrs: Record<string, any>;
}

interface KindPlan {
  kind: ReferenceKind;
  groups: ReferenceGroup<RefRow>[];
  /** O'zgarish bo'ladigan guruhlar (dublikat bor yoki qayta nomlanadi yoki atribut to'ldiriladi) */
  active: { group: ReferenceGroup<RefRow>; attrUpdates: Record<string, any>; attrNotes: string[] }[];
  /** o'chiriladigan id → omon qoluvchi id */
  idMap: Map<string, string>;
  /** yozuv id → yakuniy nom */
  finalNameById: Map<string, string>;
  /** kalit → yakuniy nom */
  finalNameByKey: Map<string, string>;
}

const isEmpty = (v: any) => v === null || v === undefined || String(v).trim() === '';

/** Omon qoluvchida bo'sh/standart turgan atributlarni o'chiriladigan dublikatlardan to'ldirish */
function inheritAttrs(kind: ReferenceKind, group: ReferenceGroup<RefRow>) {
  const updates: Record<string, any> = {};
  const notes: string[] = [];
  const s = group.survivor;
  const donors = group.duplicates; // bitimi ko'pidan boshlab tartiblangan
  const fill = (field: string, label: string) => {
    if (!isEmpty(s.attrs[field])) return;
    const donor = donors.find((d) => !isEmpty(d.attrs[field]));
    if (donor) {
      updates[field] = donor.attrs[field];
      notes.push(`${label}: "${donor.attrs[field]}" ("${donor.name}" dan olinadi)`);
    }
  };
  const orFlag = (field: string, label: string) => {
    if (s.attrs[field] === false && donors.some((d) => d.attrs[field] === true)) {
      updates[field] = true;
      notes.push(`${label}: ha (dublikatda yoqilgan)`);
    }
  };

  if (kind === 'store') {
    fill('contactPhone', 'telefon');
    fill('address', 'manzil');
    orFlag('isActive', 'faol');
  } else if (kind === 'provider') {
    if (Number(s.attrs.defaultDiscount) === 0) {
      const donor = donors.find((d) => Number(d.attrs.defaultDiscount) !== 0);
      if (donor) {
        updates.defaultDiscount = donor.attrs.defaultDiscount;
        notes.push(`standart diskont: 0 → ${Number(donor.attrs.defaultDiscount)} ("${donor.name}" dan olinadi)`);
      }
    }
    orFlag('isDaftarDefault', 'daftar (standart)');
    orFlag('isActive', 'faol');
  } else {
    fill('phone', 'telefon');
  }
  return { updates, notes };
}

function buildKindPlan(kind: ReferenceKind, rows: RefRow[]): KindPlan {
  const groups = groupReferences(kind, rows);
  const idMap = new Map<string, string>();
  const finalNameById = new Map<string, string>();
  const finalNameByKey = new Map<string, string>();
  const active: KindPlan['active'] = [];
  for (const g of groups) {
    finalNameByKey.set(g.key, g.canonicalName);
    finalNameById.set(g.survivor.id, g.canonicalName);
    for (const d of g.duplicates) {
      idMap.set(d.id, g.survivor.id);
      finalNameById.set(d.id, g.canonicalName);
    }
    const { updates, notes } = inheritAttrs(kind, g);
    if (g.duplicates.length || g.rename || notes.length) active.push({ group: g, attrUpdates: updates, attrNotes: notes });
  }
  return { kind, groups, active, idMap, finalNameById, finalNameByKey };
}

function printKindPlan(plan: KindPlan) {
  const label = KIND_LABEL[plan.kind];
  out('');
  out(`── ${label.toUpperCase()}LAR ──`);
  if (!plan.active.length) {
    out(`  Dublikat topilmadi (${plan.groups.length} ta yozuv o'zgarmaydi).`);
    return;
  }
  const isAgency = plan.kind === 'agency';
  const headers = isAgency
    ? ['Turi', 'Eski nom → Yangi nom', 'Amal', 'Bitimlar', 'Agentlar', 'Userlar']
    : ['Turi', 'Eski nom → Yangi nom', 'Amal', 'Bitimlar', 'Qoidalar'];
  const rows: (string | number)[][] = [];
  for (const { group: g } of plan.active) {
    const s = g.survivor;
    const tail = (r: RefRow) => (isAgency ? [r.dealCount, r.agentCount, r.userCount] : [r.dealCount, r.ruleCount]);
    rows.push([
      label,
      g.rename ? `"${s.name}" → "${g.canonicalName}"` : `"${s.name}"`,
      g.rename ? 'qoladi (qayta nomlanadi)' : 'qoladi',
      ...tail(s),
    ]);
    for (const d of g.duplicates) {
      rows.push([label, `"${d.name}" → "${g.canonicalName}"`, "ko'chadi, o'chadi", ...tail(d)]);
    }
    if (g.duplicates.length) {
      const sum = (f: (r: RefRow) => number) => [s, ...g.duplicates].reduce((a, r) => a + f(r), 0);
      rows.push([
        '',
        `   = "${g.canonicalName}" (birlashgach)`,
        '',
        ...(isAgency ? [sum((r) => r.dealCount), sum((r) => r.agentCount), sum((r) => r.userCount)] : [sum((r) => r.dealCount), sum((r) => r.ruleCount)]),
      ]);
    }
  }
  table(headers, rows, isAgency ? [3, 4, 5] : [3, 4]);
  for (const a of plan.active) {
    for (const n of a.attrNotes) out(`  • "${a.group.canonicalName}": ${n}`);
  }
  const untouched = plan.groups.length - plan.active.length;
  out(`  O'zgarmaydigan ${label.toLowerCase()}lar: ${untouched} ta.`);
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const startedAt = new Date();

  out('═══════════════════════════════════════════════════════════════════════');
  out(' SPRAVOCHNIK DUBLIKATLARINI BIRLASHTIRISH');
  out('═══════════════════════════════════════════════════════════════════════');
  out(APPLY ? '>>> YOZISH rejimi (--apply): o\'zgarishlar bitta tranzaksiyada bazaga yoziladi' : '>>> DRY-RUN: bazaga HECH NARSA yozilmaydi. Yozish uchun: --apply');
  out(`Baza: ${describeDatabase()}`);
  out(`Vaqt: ${startedAt.toISOString()}`);

  // ── 1. Hozirgi holatni o'qish ──
  const [stores, providers, agencies, agents, deals, rules, counts] = await Promise.all([
    prisma.store.findMany({ include: { _count: { select: { deals: true, commissionRules: true } } } }),
    prisma.provider.findMany({ include: { _count: { select: { deals: true, commissionRules: true } } } }),
    prisma.agency.findMany({ include: { _count: { select: { deals: true, agents: true, users: true } } } }),
    prisma.agent.findMany({ include: { _count: { select: { deals: true } } } }),
    prisma.deal.findMany({
      select: {
        id: true,
        dealNumber: true,
        date: true,
        storeId: true,
        providerId: true,
        agencyId: true,
        agentId: true,
        withdrawnLimit: true,
        calculatedAmount: true,
        qodirDebt: true,
        qodirBalance: true,
      },
    }),
    prisma.commissionRule.findMany({ orderBy: { priority: 'desc' } }),
    Promise.all([
      prisma.deal.count(),
      prisma.store.count(),
      prisma.provider.count(),
      prisma.agency.count(),
      prisma.agent.count(),
      prisma.commissionRule.count(),
      prisma.user.count({ where: { agencyId: { not: null } } }),
    ]),
  ]);
  const [dealsBefore, storesBefore, providersBefore, agenciesBefore, agentsBefore, rulesBefore, agencyUsersBefore] = counts;

  out('');
  out(`Hozir bazada: bitimlar ${dealsBefore}, do'konlar ${storesBefore}, provayderlar ${providersBefore}, agentliklar ${agenciesBefore}, agentlar ${agentsBefore}, komissiya qoidalari ${rulesBefore}`);

  // ── 2. Reja ──
  const storePlan = buildKindPlan(
    'store',
    stores.map((s) => ({
      id: s.id,
      name: s.name,
      dealCount: s._count.deals,
      ruleCount: s._count.commissionRules,
      agentCount: 0,
      userCount: 0,
      attrs: { contactPhone: s.contactPhone, address: s.address, isActive: s.isActive },
    }))
  );
  const providerPlan = buildKindPlan(
    'provider',
    providers.map((p) => ({
      id: p.id,
      name: p.name,
      dealCount: p._count.deals,
      ruleCount: p._count.commissionRules,
      agentCount: 0,
      userCount: 0,
      attrs: { defaultDiscount: p.defaultDiscount, isDaftarDefault: p.isDaftarDefault, isActive: p.isActive },
    }))
  );
  const agencyPlan = buildKindPlan(
    'agency',
    agencies.map((a) => ({
      id: a.id,
      name: a.name,
      dealCount: a._count.deals,
      ruleCount: 0,
      agentCount: a._count.agents,
      userCount: a._count.users,
      attrs: { phone: a.phone },
    }))
  );
  const plans = [storePlan, providerPlan, agencyPlan];
  for (const p of plans) printKindPlan(p);

  // Agentlar (agentliklar birlashgandan keyingi holat bo'yicha)
  const agentRows: AgentLite[] = agents.map((a) => ({ id: a.id, name: a.name, agencyId: a.agencyId, dealCount: a._count.deals }));
  const agentGroups = planAgentMerges(agentRows, agencyPlan.idMap);
  const agentIdMap = new Map<string, string>();
  for (const g of agentGroups) for (const d of g.duplicates) agentIdMap.set(d.id, g.survivor.id);
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const finalAgencyOfAgent = (a: { agencyId: string }) => agencyPlan.idMap.get(a.agencyId) || a.agencyId;
  const finalAgencyName = (agencyId: string) => agencyPlan.finalNameById.get(agencyId) || '?';
  // Omon qoluvchi agentlarning nomidagi ortiqcha bo'shliqlar tozalanadi
  const agentRenames = agents.filter((a) => !agentIdMap.has(a.id) && a.name !== cleanName(a.name));

  out('');
  out('── AGENTLAR (bitta agentlik ichida aynan bir xil ism) ──');
  if (!agentGroups.length) {
    out('  Aynan bir xil ismli agent dublikati topilmadi.');
  } else {
    const rows: (string | number)[][] = [];
    for (const g of agentGroups) {
      rows.push(['Agent', finalAgencyName(g.agencyId), `"${g.survivor.name}"`, 'qoladi', g.survivor.dealCount]);
      for (const d of g.duplicates) {
        rows.push(['Agent', finalAgencyName(g.agencyId), `"${d.name}" → "${cleanName(g.survivor.name)}"`, "ko'chadi, o'chadi", d.dealCount]);
      }
    }
    table(['Turi', 'Agentlik', 'Eski nom → Yangi nom', 'Amal', 'Bitimlar'], rows, [4]);
  }
  const movedAgentsToOtherAgency = agents.filter((a) => agencyPlan.idMap.has(a.agencyId)).length;
  out(`  Agentligi o'zgaradigan (birlashgan agentlikka o'tadigan) agentlar: ${movedAgentsToOtherAgency} ta.`);

  // Ehtimoliy dublikatlar (avtomatik birlashtirilmaydi)
  const survivingAgents = agents.filter((a) => !agentIdMap.has(a.id));
  const probableAgents = findProbableDuplicates(
    survivingAgents.map((a) => ({ id: a.id, name: a.name, scope: finalAgencyOfAgent(a), dealCount: a._count.deals }))
  );
  const reasonLabel = { translit: 'kirill/lotin — bir xil o\'qiladi', similar: 'bir harf farq', swapped: "harflar o'rni almashgan" };
  out('');
  out('── EHTIMOLIY DUBLIKATLAR — AGENTLAR (avtomatik BIRLASHTIRILMAYDI, qo\'lda qaror kerak) ──');
  if (!probableAgents.length) {
    out('  Topilmadi.');
  } else {
    table(
      ['Agentlik', 'Agent 1', 'Bitim', 'Agent 2', 'Bitim', 'Sabab'],
      probableAgents
        .sort((x, y) => finalAgencyName(x.a.scope).localeCompare(finalAgencyName(y.a.scope)) || x.a.name.localeCompare(y.a.name))
        .map((p) => [finalAgencyName(p.a.scope), p.a.name, (p.a as any).dealCount, p.b.name, (p.b as any).dealCount, reasonLabel[p.reason]]),
      [2, 4]
    );
    out(`  Jami: ${probableAgents.length} ta juftlik.`);
  }

  // Do'kon / provayder / agentlik nomlari orasidagi ehtimoliy dublikatlar (birlashtirishdan keyingi nomlar bo'yicha)
  const probableRefs = plans.flatMap((p) =>
    findProbableDuplicates(p.groups.map((g) => ({ id: g.survivor.id, name: g.canonicalName, scope: p.kind }))).map((pair) => ({ kind: p.kind, pair }))
  );
  out('');
  out("── EHTIMOLIY DUBLIKATLAR — DO'KON / PROVAYDER / AGENTLIK (avtomatik BIRLASHTIRILMAYDI) ──");
  if (!probableRefs.length) out('  Topilmadi.');
  else table(['Turi', 'Nom 1', 'Nom 2', 'Sabab'], probableRefs.map(({ kind, pair }) => [KIND_LABEL[kind], pair.a.name, pair.b.name, reasonLabel[pair.reason]]));

  // Qo'shiladigan yozuvlar
  const storesToAdd = REQUIRED_STORES.filter((n) => !storePlan.finalNameByKey.has(referenceKey('store', n)));
  const agenciesToAdd = REQUIRED_AGENCIES.filter((n) => !agencyPlan.finalNameByKey.has(referenceKey('agency', n)));
  out('');
  out('── QO\'SHILADIGAN YOZUVLAR ──');
  for (const n of REQUIRED_STORES) out(`  Do'kon "${n}": ${storesToAdd.includes(n) ? "QO'SHILADI" : 'bazada bor — qo\'shilmaydi'}`);
  for (const n of REQUIRED_AGENCIES) out(`  Agentlik "${n}": ${agenciesToAdd.includes(n) ? "QO'SHILADI" : 'bazada bor — qo\'shilmaydi'}`);

  // Matn sifatida saqlangan nomlar
  const finalName = (plan: KindPlan, value: string) => plan.finalNameByKey.get(referenceKey(plan.kind, value)) || canonicalReferenceName(plan.kind, value);
  const textTargets: { model: 'botDeal' | 'botOperatorReport' | 'lead' | 'swotAgencyAnalysis'; field: string; plan: KindPlan; label: string }[] = [
    { model: 'botDeal', field: 'storeName', plan: storePlan, label: 'BotDeal.storeName' },
    { model: 'botDeal', field: 'providerName', plan: providerPlan, label: 'BotDeal.providerName' },
    { model: 'botDeal', field: 'agencyName', plan: agencyPlan, label: 'BotDeal.agencyName' },
    { model: 'botOperatorReport', field: 'storeName', plan: storePlan, label: 'BotOperatorReport.storeName' },
    { model: 'lead', field: 'providerName', plan: providerPlan, label: 'Lead.providerName' },
    { model: 'swotAgencyAnalysis', field: 'agencyName', plan: agencyPlan, label: 'SwotAgencyAnalysis.agencyName' },
  ];
  const textUpdates: { model: string; field: string; label: string; from: string; to: string; count: number; blocked?: string }[] = [];
  for (const t of textTargets) {
    const grouped: { [k: string]: any }[] = await (prisma as any)[t.model].groupBy({ by: [t.field], _count: { _all: true } });
    const values = grouped.map((g) => ({ value: g[t.field] as string | null, count: g._count._all as number })).filter((g) => g.value);
    const present = new Set(values.map((v) => v.value as string));
    for (const v of values) {
      const to = finalName(t.plan, v.value as string);
      if (to === v.value) continue;
      // SwotAgencyAnalysis.agencyName — unique: yangi nomli yozuv allaqachon bo'lsa tegilmaydi
      const blocked = t.model === 'swotAgencyAnalysis' && present.has(to) ? `"${to}" nomli SWOT yozuvi allaqachon bor — qo'lda birlashtiring` : undefined;
      textUpdates.push({ model: t.model, field: t.field, label: t.label, from: v.value as string, to, count: v.count, blocked });
    }
  }
  out('');
  out('── MATN SIFATIDA SAQLANGAN NOMLAR ──');
  if (!textUpdates.length) out("  O'zgaradigan yozuv yo'q (BotDeal, BotOperatorReport, Lead, SwotAgencyAnalysis tekshirildi).");
  else
    table(
      ['Maydon', 'Eski qiymat → Yangi qiymat', 'Yozuvlar', 'Izoh'],
      textUpdates.map((u) => [u.label, `"${u.from}" → "${u.to}"`, u.count, u.blocked ? `O'TKAZIB YUBORILADI: ${u.blocked}` : 'yangilanadi']),
      [2]
    );

  // ── 3. Yig'ma ──
  const movedBy = (field: 'storeId' | 'providerId' | 'agencyId' | 'agentId', map: Map<string, string>) =>
    deals.filter((d) => d[field] && map.has(d[field] as string));
  const movedStoreDeals = movedBy('storeId', storePlan.idMap);
  const movedProviderDeals = movedBy('providerId', providerPlan.idMap);
  const movedAgencyDeals = movedBy('agencyId', agencyPlan.idMap);
  const movedAgentDeals = movedBy('agentId', agentIdMap);
  const touchedDealIds = new Set([...movedStoreDeals, ...movedProviderDeals, ...movedAgencyDeals, ...movedAgentDeals].map((d) => d.id));
  const movedStoreRules = rules.filter((r) => r.storeId && storePlan.idMap.has(r.storeId)).length;
  const movedProviderRules = rules.filter((r) => r.providerId && providerPlan.idMap.has(r.providerId)).length;
  const movedUsers = agencies.filter((a) => agencyPlan.idMap.has(a.id)).reduce((s, a) => s + a._count.users, 0);
  const renamedCount = plans.reduce((s, p) => s + p.active.filter((a) => a.group.rename).length, 0);

  const expected = {
    deals: dealsBefore,
    stores: storesBefore - storePlan.idMap.size + storesToAdd.length,
    providers: providersBefore - providerPlan.idMap.size,
    agencies: agenciesBefore - agencyPlan.idMap.size + agenciesToAdd.length,
    agents: agentsBefore - agentIdMap.size,
    rules: rulesBefore,
    agencyUsers: agencyUsersBefore,
  };

  out('');
  out('═══════════════════════════════════════════════════════════════════════');
  out(" YIG'MA");
  out('═══════════════════════════════════════════════════════════════════════');
  table(
    ['Turi', 'Oldin', "O'chadi", "Qo'shiladi", 'Keyin'],
    [
      ["Do'konlar", storesBefore, storePlan.idMap.size, storesToAdd.length, expected.stores],
      ['Provayderlar', providersBefore, providerPlan.idMap.size, 0, expected.providers],
      ['Agentliklar', agenciesBefore, agencyPlan.idMap.size, agenciesToAdd.length, expected.agencies],
      ['Agentlar', agentsBefore, agentIdMap.size, 0, expected.agents],
    ],
    [1, 2, 3, 4]
  );
  const deletedTotal = storePlan.idMap.size + providerPlan.idMap.size + agencyPlan.idMap.size + agentIdMap.size;
  out('');
  out(`  O'chadigan yozuvlar jami: ${deletedTotal} ta (do'kon ${storePlan.idMap.size}, provayder ${providerPlan.idMap.size}, agentlik ${agencyPlan.idMap.size}, agent ${agentIdMap.size})`);
  out(`  Qayta nomlanadigan omon qoluvchi yozuvlar: ${renamedCount} ta`);
  out(`  Ko'chadigan bitim bog'lanishlari: do'kon bo'yicha ${movedStoreDeals.length}, provayder bo'yicha ${movedProviderDeals.length}, agentlik bo'yicha ${movedAgencyDeals.length}, agent bo'yicha ${movedAgentDeals.length}`);
  out(`  Kamida bitta bog'lanishi ko'chadigan bitimlar: ${touchedDealIds.size} ta (jami ${dealsBefore} tadan)`);
  out(`  Ko'chadigan komissiya qoidalari: ${movedStoreRules + movedProviderRules} ta (do'kon ${movedStoreRules}, provayder ${movedProviderRules})`);
  out(`  Agentligi o'zgaradigan agentlar: ${movedAgentsToOtherAgency} ta; foydalanuvchilar (User.agencyId): ${movedUsers} ta`);

  // ── 4. Tekshiruv (xotirada): har bir bitim birlashtirishdan keyin ham mavjud yozuvlarga ishora qiladimi ──
  const survivingStoreIds = new Set(stores.filter((s) => !storePlan.idMap.has(s.id)).map((s) => s.id));
  const survivingProviderIds = new Set(providers.filter((p) => !providerPlan.idMap.has(p.id)).map((p) => p.id));
  const survivingAgencyIds = new Set(agencies.filter((a) => !agencyPlan.idMap.has(a.id)).map((a) => a.id));
  const survivingAgentIds = new Set(survivingAgents.map((a) => a.id));
  let dangling = 0;
  const expectedDealsByStore = new Map<string, number>();
  const expectedDealsByProvider = new Map<string, number>();
  for (const d of deals) {
    const s = storePlan.idMap.get(d.storeId) || d.storeId;
    const p = providerPlan.idMap.get(d.providerId) || d.providerId;
    const a = d.agencyId ? agencyPlan.idMap.get(d.agencyId) || d.agencyId : null;
    const g = d.agentId ? agentIdMap.get(d.agentId) || d.agentId : null;
    if (!survivingStoreIds.has(s) || !survivingProviderIds.has(p) || (a && !survivingAgencyIds.has(a)) || (g && !survivingAgentIds.has(g))) dangling++;
    expectedDealsByStore.set(s, (expectedDealsByStore.get(s) || 0) + 1);
    expectedDealsByProvider.set(p, (expectedDealsByProvider.get(p) || 0) + 1);
  }
  out('');
  out('── TEKSHIRUV ──');
  out(`  Bitimlar umumiy soni: oldin ${dealsBefore} = keyin ${deals.length} ${dealsBefore === deals.length ? '✓' : '✗'}  (bitimlar o'chirilmaydi, faqat bog'lanishi ko'chadi)`);
  out(`  Birlashtirishdan keyin mavjud bo'lmagan yozuvga ishora qiladigan bitimlar: ${dangling} ${dangling === 0 ? '✓' : '✗'}`);
  if (dangling > 0 || dealsBefore !== deals.length) throw new Error('Reja tekshiruvdan o\'tmadi — hech narsa yozilmadi');

  // ── 5. Eslatmalar ──
  out('');
  out('── ESLATMALAR ──');

  // 5a. Qodir aka: saqlangan hisob maydonlari
  const qodirGroup = storePlan.groups.find((g) => g.canonicalName === 'Qodir aka');
  if (qodirGroup && qodirGroup.duplicates.length) {
    const dupIds = new Set(qodirGroup.duplicates.map((d) => d.id));
    const moved = deals.filter((d) => dupIds.has(d.storeId));
    let balanceDiff = 0;
    let balanceDelta = 0;
    let debtDiff = 0;
    for (const d of moved) {
      const expBalance = Number(d.withdrawnLimit) * 0.05;
      const expDebt = Number(d.calculatedAmount);
      if (Math.abs(Number(d.qodirBalance) - expBalance) > 0.5) {
        balanceDiff++;
        balanceDelta += expBalance - Number(d.qodirBalance);
      }
      if (Math.abs(Number(d.qodirDebt) - expDebt) > 0.5) debtDiff++;
    }
    out(`  1) Qodir aka: ${qodirGroup.duplicates.map((d) => `"${d.name}"`).join(', ')} do'konidan "Qodir aka" ga ${moved.length} ta bitim ko'chadi.`);
    out("     Bu bitimlarda saqlangan hisob maydonlari (qodirDebt, qodirBalance, totalExtraBalance, profit ...) bu skriptda O'ZGARMAYDI —");
    out("     faqat do'kon bog'lanishi ko'chadi. Bitim keyingi safar tahrirlanganda ular amaldagi formula bilan QAYTA HISOBLANADI:");
    out(`       • qodirBalance (yechilgan limit × 5%): ${moved.length} tadan ${balanceDiff} tasida hozirgi qiymat boshqacha — tahrirda jami ${balanceDelta >= 0 ? '+' : ''}${fmt(balanceDelta)} so'mga o'zgaradi`);
    out(`         (varaq formulasi faqat "Qodir aka" yozuvini tanigani uchun "Qodir oka" bitimlarida 0 saqlangan);`);
    out(`       • qodirDebt (mijozga to'lov): ${debtDiff} tasida hozirgi qiymat boshqacha.`);
  } else {
    out('  1) Qodir aka: ko\'chadigan bitim yo\'q.');
  }

  // 5b. Agent foizi: komissiya qoidalari nom bo'yicha ("ichida bor") solishtiriladi — nom o'zgarsa qoida qamrovi o'zgarishi mumkin
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const providerNameById = new Map(providers.map((p) => [p.id, p.name]));
  const toRuleItems = (after: boolean): CommissionRuleItem[] =>
    rules
      .filter((r) => r.isActive)
      .map((r) => ({
        storeName: r.storeId ? (after ? storePlan.finalNameById.get(r.storeId) : storeNameById.get(r.storeId)) || null : null,
        providerName: r.providerId ? (after ? providerPlan.finalNameById.get(r.providerId) : providerNameById.get(r.providerId)) || null : null,
        ratePercent: Number(r.ratePercent),
        priority: r.priority,
      }));
  const rulesNow = toRuleItems(false);
  const rulesAfter = toRuleItems(true);
  const rateChanges = new Map<string, number>();
  for (const d of deals) {
    const before = CalculationService.getAgentRate(storeNameById.get(d.storeId) || '', providerNameById.get(d.providerId) || '', rulesNow, d.date);
    const after = CalculationService.getAgentRate(
      storePlan.finalNameById.get(d.storeId) || '',
      providerPlan.finalNameById.get(d.providerId) || '',
      rulesAfter,
      d.date
    );
    if (Math.abs(before - after) > 1e-9) {
      const k = `${providerNameById.get(d.providerId)} / ${storeNameById.get(d.storeId)}: ${pct(before)} → ${pct(after)}`;
      rateChanges.set(k, (rateChanges.get(k) || 0) + 1);
    }
  }
  const rateChangeTotal = [...rateChanges.values()].reduce((s, n) => s + n, 0);
  if (rateChangeTotal) {
    out(`  2) Agent foizi: birlashtirishdan keyin ${rateChangeTotal} ta bitim keyingi tahrirda BOSHQA foiz bilan qayta hisoblanadi`);
    out("     (komissiya qoidasi provayder/do'kon nomi bo'yicha qidiriladi; nom o'zgargach qoida ko'proq bitimga to'g'ri keladi):");
    for (const [k, n] of [...rateChanges.entries()].sort()) out(`       • ${k} — ${n} ta bitim`);
    out("     Saqlangan summalar hozir o'zgarmaydi. Qaysi foiz to'g'riligini tekshirib, kerak bo'lsa qoidani tahrirlang.");
  } else {
    out("  2) Agent foizi: birlashtirish hech bir bitimning qoida bo'yicha foizini o'zgartirmaydi.");
  }

  // 5c. Bir xil komissiya qoidalari
  const ruleKeys = new Map<string, number>();
  for (const r of rules) {
    const k = [r.name, r.storeId ? storePlan.idMap.get(r.storeId) || r.storeId : '-', r.providerId ? providerPlan.idMap.get(r.providerId) || r.providerId : '-', Number(r.ratePercent), r.priority].join('|');
    ruleKeys.set(k, (ruleKeys.get(k) || 0) + 1);
  }
  const duplicateRules = [...ruleKeys.values()].filter((n) => n > 1).reduce((s, n) => s + (n - 1), 0);
  out(`  3) Komissiya qoidalari: ${rulesBefore} tadan ${duplicateRules} tasi aynan takror (nomi, do'koni/provayderi, foizi bir xil). Bu skript ularni O'CHIRMAYDI.`);
  out("  4) Yozishdan oldin zaxira oling:  npx ts-node --transpile-only scripts/backup-db.ts");

  // ── 6. Yozish ──
  if (APPLY) {
    out('');
    out('── YOZISH ──');
    await prisma.$transaction(
      async (tx) => {
        // Do'konlar
        for (const { group: g, attrUpdates } of storePlan.active) {
          const dupIds = g.duplicates.map((d) => d.id);
          if (dupIds.length) {
            await tx.deal.updateMany({ where: { storeId: { in: dupIds } }, data: { storeId: g.survivor.id } });
            await tx.commissionRule.updateMany({ where: { storeId: { in: dupIds } }, data: { storeId: g.survivor.id } });
            // Do'kon daftari yozuvlari ham omon qoluvchiga ko'chadi (aks holda Cascade ularni o'chirib yuborardi)
            await tx.storeLedgerEntry.updateMany({ where: { storeId: { in: dupIds } }, data: { storeId: g.survivor.id } });
            await tx.store.deleteMany({ where: { id: { in: dupIds } } });
          }
          // Nom unique — dublikatlar o'chirilgandan KEYIN qayta nomlanadi
          const data = { ...attrUpdates, ...(g.rename ? { name: g.canonicalName } : {}) };
          if (Object.keys(data).length) await tx.store.update({ where: { id: g.survivor.id }, data });
        }
        // Provayderlar
        for (const { group: g, attrUpdates } of providerPlan.active) {
          const dupIds = g.duplicates.map((d) => d.id);
          if (dupIds.length) {
            await tx.deal.updateMany({ where: { providerId: { in: dupIds } }, data: { providerId: g.survivor.id } });
            await tx.commissionRule.updateMany({ where: { providerId: { in: dupIds } }, data: { providerId: g.survivor.id } });
            await tx.provider.deleteMany({ where: { id: { in: dupIds } } });
          }
          const data = { ...attrUpdates, ...(g.rename ? { name: g.canonicalName } : {}) };
          if (Object.keys(data).length) await tx.provider.update({ where: { id: g.survivor.id }, data });
        }
        // Agentliklar
        for (const { group: g, attrUpdates } of agencyPlan.active) {
          const dupIds = g.duplicates.map((d) => d.id);
          if (dupIds.length) {
            await tx.deal.updateMany({ where: { agencyId: { in: dupIds } }, data: { agencyId: g.survivor.id } });
            await tx.agent.updateMany({ where: { agencyId: { in: dupIds } }, data: { agencyId: g.survivor.id } });
            await tx.user.updateMany({ where: { agencyId: { in: dupIds } }, data: { agencyId: g.survivor.id } });
            await tx.agency.deleteMany({ where: { id: { in: dupIds } } });
          }
          const data = { ...attrUpdates, ...(g.rename ? { name: g.canonicalName } : {}) };
          if (Object.keys(data).length) await tx.agency.update({ where: { id: g.survivor.id }, data });
        }
        // Agentlar (agentliklar birlashgandan keyin)
        for (const g of agentGroups) {
          const dupIds = g.duplicates.map((d) => d.id);
          await tx.deal.updateMany({ where: { agentId: { in: dupIds } }, data: { agentId: g.survivor.id } });
          await tx.agent.deleteMany({ where: { id: { in: dupIds } } });
          const src = agentById.get(g.survivor.id)!;
          const donors = g.duplicates.map((d) => agentById.get(d.id)!);
          const data: Record<string, any> = {};
          if (isEmpty(src.phone)) {
            const donor = donors.find((d) => !isEmpty(d.phone));
            if (donor) data.phone = donor.phone;
          }
          if (!src.isActive && donors.some((d) => d.isActive)) data.isActive = true;
          if (Object.keys(data).length) await tx.agent.update({ where: { id: g.survivor.id }, data });
        }
        for (const a of agentRenames) await tx.agent.update({ where: { id: a.id }, data: { name: cleanName(a.name) } });

        // Yangi yozuvlar
        for (const name of storesToAdd) await tx.store.create({ data: { name } });
        for (const name of agenciesToAdd) await tx.agency.create({ data: { name } });

        // Matn sifatida saqlangan nomlar
        for (const u of textUpdates) {
          if (u.blocked) continue;
          await (tx as any)[u.model].updateMany({ where: { [u.field]: u.from }, data: { [u.field]: u.to } });
        }

        // Tranzaksiya ichida yakuniy tekshiruv — mos kelmasa hammasi bekor qilinadi (rollback)
        const [dealsAfter, storesAfter, providersAfter, agenciesAfter, agentsAfter, rulesAfterCount, agencyUsersAfter] = await Promise.all([
          tx.deal.count(),
          tx.store.count(),
          tx.provider.count(),
          tx.agency.count(),
          tx.agent.count(),
          tx.commissionRule.count(),
          tx.user.count({ where: { agencyId: { not: null } } }),
        ]);
        const problems: string[] = [];
        const check = (label: string, actual: number, exp: number) => {
          if (actual !== exp) problems.push(`${label}: kutilgan ${exp}, chiqdi ${actual}`);
        };
        check('bitimlar', dealsAfter, expected.deals);
        check("do'konlar", storesAfter, expected.stores);
        check('provayderlar', providersAfter, expected.providers);
        check('agentliklar', agenciesAfter, expected.agencies);
        check('agentlar', agentsAfter, expected.agents);
        check('komissiya qoidalari', rulesAfterCount, expected.rules);
        check('agentlikka biriktirilgan foydalanuvchilar', agencyUsersAfter, expected.agencyUsers);
        const byStore = await tx.deal.groupBy({ by: ['storeId'], _count: { _all: true } });
        for (const row of byStore) check(`do'kon bo'yicha bitimlar (${row.storeId})`, row._count._all, expectedDealsByStore.get(row.storeId) || 0);
        const byProvider = await tx.deal.groupBy({ by: ['providerId'], _count: { _all: true } });
        for (const row of byProvider) check(`provayder bo'yicha bitimlar (${row.providerId})`, row._count._all, expectedDealsByProvider.get(row.providerId) || 0);
        if (problems.length) {
          throw new Error(`Yakuniy tekshiruv o'tmadi — barcha o'zgarishlar BEKOR QILINDI:\n  - ${problems.join('\n  - ')}`);
        }
      },
      { maxWait: 20_000, timeout: 180_000 }
    );
    // Tranzaksiya muvaffaqiyatli yopilgandan keyingi haqiqiy holat
    const [dealsAfter, storesAfter, providersAfter, agenciesAfter, agentsAfter] = await Promise.all([
      prisma.deal.count(),
      prisma.store.count(),
      prisma.provider.count(),
      prisma.agency.count(),
      prisma.agent.count(),
    ]);
    out(`  Yozildi. Bitimlar: oldin ${dealsBefore} = keyin ${dealsAfter} ${dealsBefore === dealsAfter ? '✓' : '✗'}`);
    out(`  Do'konlar ${storesAfter}, provayderlar ${providersAfter}, agentliklar ${agenciesAfter}, agentlar ${agentsAfter}`);
  } else {
    out('');
    out('DRY-RUN tugadi — bazaga hech narsa yozilmadi. Ro\'yxat ma\'qul bo\'lsa:  npx ts-node --transpile-only scripts/merge-references.ts --apply');
  }

  // Natijani faylga ham saqlash
  const dir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, APPLY ? `merge-apply-${startedAt.toISOString().replace(/[:.]/g, '-')}.txt` : 'merge-dry-run.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  console.log(`\nNatija saqlandi: ${file}`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('Xato:', e.message || e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
