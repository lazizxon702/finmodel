import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { generatePassword, hashPassword } from '../routes/auth.routes';
import {
  REGISTRATURA_AGENCY_NAME,
  calcOperatorShares,
  personNameKey,
  tashkentDayRange,
  transliterate,
  type OperatorShareRule,
} from './calculation.service';

/**
 * Agent jamoasi: spravochnikdagi operatorlar (Agent yozuvlari) uchun avtomatik login yaratish / bog'lash
 * va davr bo'yicha statistika.
 *
 * Agent yozuvlarining o'ziga (ism, birlashtirish) HECH QACHON tegilmaydi — faqat User qatorlari yaratiladi yoki bog'lanadi.
 */

// ─────────────────────────── Sof funksiyalar (testlanadi) ───────────────────────────

// Ism solishtirish qoidasi yagona joyda — calculation.service (personNameKey). Bu yerda eski nomlar saqlangan.
export { transliterate };
/** Ismlarni solishtirish uchun: kichik harf, lotin, apostrof/tinish belgilarsiz, bo'shliqlar bitta */
export function normalizeName(name: string): string {
  return personNameKey(name);
}

/** Ismdan login asosi: "Sardor Aliyev" -> "sardor_aliyev" (3–32 belgi, faqat a-z0-9_) */
export function usernameBase(name: string): string {
  let base = transliterate(name)
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 28);
  if (base.length < 3) base = `op_${base}`.replace(/_$/, '');
  if (base.length < 3) base = 'operator';
  return base;
}

/** Band bo'lmagan login tanlaydi: asos, keyin asos2, asos3 ... (32 belgidan oshmaydi). `taken` kichik harfda. */
export function pickUsername(base: string, taken: Set<string>, clashSuffix?: string): string {
  const root = base.toLowerCase();
  if (!taken.has(root)) return root;
  // Login band (odatda boshqa agentdagi shu ismli operator) — avval "ism_agent" ko'rinishi sinab ko'riladi
  const tail = String(clashSuffix || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (tail) {
    const withAgent = `${root.slice(0, 31 - tail.length)}_${tail}`;
    if (!taken.has(withAgent)) return withAgent;
  }
  for (let n = 2; n < 10_000; n++) {
    const suffix = String(n);
    const candidate = `${root.slice(0, 32 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Bo\'sh login topilmadi');
}

export interface AgentRowLite {
  id: string;
  name: string;
}
export interface ExistingOperatorLite {
  id: string;
  fullName: string;
  username: string;
}
export interface OperatorPlan {
  agentRecordId: string;
  fullName: string;
  /** link — mavjud operator foydalanuvchisiga bog'lanadi; create — yangi foydalanuvchi yaratiladi */
  action: 'link' | 'create';
  userId?: string; // link uchun
  username: string;
}

/**
 * Qaysi Agent yozuviga nima qilinishini rejalashtiradi (bazaga tegmaydi).
 *  - bir xil (normallashgan) ismli, hali bog'lanmagan operator bo'lsa — bog'lanadi (har operator faqat bir marta);
 *  - aks holda yangi operator yaratiladi, logini band bo'lmagan qilib tanlanadi.
 */
export function planOperators(
  agentRows: AgentRowLite[],
  unlinkedOperators: ExistingOperatorLite[],
  takenUsernames: Iterable<string>,
  clashSuffix?: string
): OperatorPlan[] {
  const taken = new Set<string>();
  for (const u of takenUsernames) taken.add(String(u).toLowerCase());
  const pool = unlinkedOperators.map((o) => ({ ...o, key: normalizeName(o.fullName), used: false }));
  const plans: OperatorPlan[] = [];

  for (const row of agentRows) {
    const key = normalizeName(row.name);
    const match = key ? pool.find((o) => !o.used && o.key === key) : undefined;
    if (match) {
      match.used = true;
      plans.push({ agentRecordId: row.id, fullName: row.name, action: 'link', userId: match.id, username: match.username });
      continue;
    }
    const username = pickUsername(usernameBase(row.name), taken, clashSuffix);
    taken.add(username);
    plans.push({ agentRecordId: row.id, fullName: row.name, action: 'create', username });
  }
  return plans;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD bo'lsa o'zini, aks holda undefined */
export function cleanYmd(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!YMD_RE.test(v) || isNaN(new Date(`${v}T00:00:00+05:00`).getTime())) return undefined;
  return v;
}

/** Bugungi sana Asia/Tashkent bo'yicha (YYYY-MM-DD) */
export function todayTashkentYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface DealStatRow {
  id: string;
  createdById: string | null;
  agentId: string | null;
  approvalStatus: string;
  withdrawnLimit: number;
  agentAmount: number;
  date?: Date;
}
export interface PeriodStats {
  dealsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalWithdrawnLimit: number;
  totalAgentAmount: number;
  /** Operator ulushi (agent foydasidan foiz) — faqat qoida bor jamoada (Jahongir), aks holda 0 */
  operatorShare: number;
}

export function emptyStats(): PeriodStats {
  return { dealsCount: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0, totalWithdrawnLimit: 0, totalAgentAmount: 0, operatorShare: 0 };
}

/** Bitta bitimni statistikaga qo'shadi. Summalar faqat APPROVED bitimlardan. */
export function addDealToStats(stats: PeriodStats, deal: Pick<DealStatRow, 'approvalStatus' | 'withdrawnLimit' | 'agentAmount'>) {
  stats.dealsCount += 1;
  if (deal.approvalStatus === 'APPROVED') {
    stats.approvedCount += 1;
    stats.totalWithdrawnLimit += deal.withdrawnLimit;
    stats.totalAgentAmount += deal.agentAmount;
  } else if (deal.approvalStatus === 'PENDING_APPROVAL') {
    stats.pendingCount += 1;
  } else if (deal.approvalStatus === 'REJECTED') {
    stats.rejectedCount += 1;
  }
}

/**
 * Operatorlar bo'yicha statistika: bitim operatorniki, agar uni operator kiritgan (createdById) YOKI
 * u operatorning Agent yozuviga bog'langan (agentId). Bir bitim bir operator uchun bir marta sanaladi.
 * Jamoa jami esa har bitimni bir marta sanaydi.
 */
export function aggregateTeamStats(
  operators: { id: string; agentId: string | null }[],
  deals: DealStatRow[],
  /** shareRule — operator ulushi qoidasi; countFrom — shu sanadan oldingi bitimlar faqat oylik chegara uchun (statistikaga kirmaydi) */
  opts: { shareRule?: OperatorShareRule | null; countFrom?: Date } = {}
): { perOperator: Map<string, PeriodStats>; total: PeriodStats } {
  const perOperator = new Map<string, PeriodStats>();
  const byCreator = new Map<string, string>(); // userId -> operator id
  const byAgentRecord = new Map<string, string>(); // agentId -> operator id
  for (const op of operators) {
    perOperator.set(op.id, emptyStats());
    byCreator.set(op.id, op.id);
    if (op.agentId) byAgentRecord.set(op.agentId, op.id);
  }
  const total = emptyStats();
  const ownedApproved = new Map<string, DealStatRow[]>(); // operator id -> tasdiqlangan bitimlari (ulush uchun)
  const inRange = (deal: DealStatRow) => !opts.countFrom || !deal.date || deal.date.getTime() >= opts.countFrom.getTime();
  for (const deal of deals) {
    const owners = new Set<string>();
    const c = deal.createdById ? byCreator.get(deal.createdById) : undefined;
    if (c) owners.add(c);
    const a = deal.agentId ? byAgentRecord.get(deal.agentId) : undefined;
    if (a) owners.add(a);
    if (!owners.size) continue;
    if (deal.approvalStatus === 'APPROVED' && deal.date) {
      for (const id of owners) ownedApproved.set(id, [...(ownedApproved.get(id) || []), deal]);
    }
    if (!inRange(deal)) continue;
    for (const id of owners) addDealToStats(perOperator.get(id)!, deal);
    addDealToStats(total, deal);
  }
  if (opts.shareRule) {
    for (const [id, own] of ownedApproved) {
      const shares = calcOperatorShares(own as Required<DealStatRow>[], opts.shareRule);
      let sum = 0;
      for (const d of own) if (inRange(d)) sum += shares.get(d.id) || 0;
      perOperator.get(id)!.operatorShare = Math.round(sum);
    }
    for (const s of perOperator.values()) total.operatorShare += s.operatorShare;
  }
  return { perOperator, total };
}

// ─────────────────────────── Bazaga yozuvchi qism ───────────────────────────

export interface EnsureResult {
  agentUserId: string;
  agencyId: string | null;
  /** Agentlikda bir nechta AGENT foydalanuvchi bor — hech narsa qilinmadi */
  ambiguous: boolean;
  /** Agent yozuvlari (faol) ichida hali foydalanuvchisi yo'qlar soni (boshlanishda) */
  missing: number;
  linked: { agentRecordId: string; fullName: string; username: string }[];
  /** password faqat apply rejimida to'ldiriladi — loglarga/javobga chiqarilmaydi */
  created: { agentRecordId: string; fullName: string; username: string; password?: string }[];
}

const MAX_CREATE_RETRIES = 5;

/**
 * Agent foydalanuvchisining agentligidagi har bir FAOL Agent yozuvi uchun operator loginini ta'minlaydi (idempotent).
 * `dryRun` — hech narsa yozmaydi, faqat nima bo'lishini qaytaradi.
 */
export async function ensureOperatorsForAgent(agentUserId: string, opts: { dryRun?: boolean } = {}): Promise<EnsureResult> {
  const result: EnsureResult = { agentUserId, agencyId: null, ambiguous: false, missing: 0, linked: [], created: [] };

  const agentUser = await prisma.user.findUnique({ where: { id: agentUserId }, select: { id: true, role: true, agencyId: true, fullName: true, username: true } });
  if (!agentUser || agentUser.role !== Role.AGENT || !agentUser.agencyId) return result;
  result.agencyId = agentUser.agencyId;

  // Arzon oldindan tekshiruv: yetishmayotgan operator bo'lmasa — bitta COUNT bilan chiqamiz
  const missing = await prisma.agent.count({ where: { agencyId: agentUser.agencyId, isActive: true, user: null } });
  result.missing = missing;
  if (missing === 0) return result;

  // Agentlikda bitta AGENT foydalanuvchi bo'lmasa, operator kimning jamoasiga tushishi noaniq
  const agentUsers = await prisma.user.count({ where: { role: Role.AGENT, agencyId: agentUser.agencyId } });
  if (agentUsers > 1) {
    result.ambiguous = true;
    return result;
  }

  // Agentning o'zi nomidagi yozuv (agent Farida agentligidagi "Farida") uchun operator logini ochilmaydi — u o'z logini bilan kiradi
  const selfKey = normalizeName(agentUser.fullName);
  const agentRows = (
    await prisma.agent.findMany({
      where: { agencyId: agentUser.agencyId, isActive: true, user: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  ).filter((row) => !selfKey || normalizeName(row.name) !== selfKey);
  result.missing = agentRows.length;
  if (!agentRows.length) return result;
  const unlinked = await prisma.user.findMany({
    where: { role: Role.OPERATOR, parentAgentId: agentUserId, agentId: null },
    select: { id: true, fullName: true, username: true },
  });
  const allUsernames = await prisma.user.findMany({ select: { username: true } });
  const plans = planOperators(agentRows, unlinked, allUsernames.map((u) => u.username), agentUser.username);

  for (const plan of plans) {
    if (plan.action === 'link') {
      if (!opts.dryRun) {
        try {
          await prisma.user.update({ where: { id: plan.userId! }, data: { agentId: plan.agentRecordId } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue; // boshqa so'rov bog'lab ulgurgan
          throw e;
        }
      }
      result.linked.push({ agentRecordId: plan.agentRecordId, fullName: plan.fullName, username: plan.username });
      continue;
    }

    if (opts.dryRun) {
      result.created.push({ agentRecordId: plan.agentRecordId, fullName: plan.fullName, username: plan.username });
      continue;
    }

    const password = generatePassword(12);
    const passwordHash = await hashPassword(password);
    let username = plan.username;
    for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt++) {
      try {
        await prisma.user.create({
          data: {
            username,
            fullName: plan.fullName.trim().slice(0, 120) || username,
            passwordHash,
            initialPassword: password,
            role: Role.OPERATOR,
            parentAgentId: agentUserId,
            agentId: plan.agentRecordId,
          },
        });
        result.created.push({ agentRecordId: plan.agentRecordId, fullName: plan.fullName, username, password });
        break;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
        const target = String((e.meta as any)?.target || '');
        if (target.includes('agentId')) break; // boshqa so'rov allaqachon yaratgan
        // login band bo'lib qoldi — keyingisini tanlaymiz
        username = `${usernameBase(plan.fullName).slice(0, 28)}${Math.floor(100 + Math.random() * 900)}`;
      }
    }
  }
  return result;
}

/** Barcha AGENT foydalanuvchilar uchun (skript) */
export async function ensureOperatorsForAllAgents(opts: { dryRun?: boolean } = {}): Promise<(EnsureResult & { agentName: string })[]> {
  const agents = await prisma.user.findMany({
    where: { role: Role.AGENT, agencyId: { not: null } },
    select: { id: true, fullName: true },
    orderBy: { createdAt: 'asc' },
  });
  const out: (EnsureResult & { agentName: string })[] = [];
  for (const a of agents) out.push({ ...(await ensureOperatorsForAgent(a.id, opts)), agentName: a.fullName });
  return out;
}

// ─────────────────────────── Statistika ───────────────────────────

export interface TeamOperatorStats extends PeriodStats {
  id: string;
}

function dateWhere(from?: string, to?: string): Prisma.DealWhereInput {
  const { start, end } = tashkentDayRange(from, to);
  if (!start && !end) return {};
  return { date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } };
}

/** Berilgan operatorlar uchun davr statistikasi (bitta so'rov, JS'da guruhlanadi) */
export async function statsForOperators(
  operators: { id: string; agentId: string | null }[],
  from?: string,
  to?: string,
  shareRule?: OperatorShareRule | null
): Promise<{ perOperator: Map<string, PeriodStats>; total: PeriodStats }> {
  if (!operators.length) return { perOperator: new Map(), total: emptyStats() };
  const ids = operators.map((o) => o.id);
  const agentIds = operators.map((o) => o.agentId).filter((v): v is string => !!v);
  const or: Prisma.DealWhereInput[] = [{ createdById: { in: ids } }];
  if (agentIds.length) or.push({ agentId: { in: agentIds } });

  // Ulush qoidasi bo'lsa, oylik chegara to'g'ri sanalishi uchun bitimlar OY BOSHIDAN olinadi (statistikaga faqat davrdagilari kiradi)
  const countFrom = tashkentDayRange(from, to).start;
  const fetchFrom = shareRule && from ? `${from.slice(0, 7)}-01` : from;
  const rows = await prisma.deal.findMany({
    where: { AND: [{ OR: or }, dateWhere(fetchFrom, to)] },
    select: { id: true, createdById: true, agentId: true, approvalStatus: true, withdrawnLimit: true, agentAmount: true, date: true },
  });
  const deals: DealStatRow[] = rows.map((r) => ({
    id: r.id,
    createdById: r.createdById,
    agentId: r.agentId,
    approvalStatus: r.approvalStatus,
    withdrawnLimit: Number(r.withdrawnLimit),
    agentAmount: Number(r.agentAmount),
    date: r.date,
  }));
  return aggregateTeamStats(operators, deals, { shareRule, countFrom });
}

// ─────────────────────────── Registratura ───────────────────────────

/**
 * Registratura xodimi uchun spravochnik yozuvlari: "Registratura" agentligi (yo'q bo'lsa yaratiladi) va shu agentlik
 * ichida xodimning o'z Agent yozuvi (User.agentId orqali bog'lanadi). Xodim kiritgan bitim shu ikkalasiga yoziladi —
 * hisobotlarda kim urgani ko'rinadi, agent ulushi esa hisoblanmaydi (calculation.service: isRegistraturaAgency).
 * Qayta chaqirish xavfsiz (idempotent).
 */
export async function ensureRegistraturaRecord(userId: string): Promise<{ agencyId: string; agentId: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, role: true, agentId: true, agentRecord: { select: { id: true, agencyId: true } } },
  });
  if (!user || user.role !== Role.REGISTRATURA) throw new Error('Registratura xodimi topilmadi');

  const agency =
    (await prisma.agency.findUnique({ where: { name: REGISTRATURA_AGENCY_NAME } })) ||
    (await prisma.agency.create({ data: { name: REGISTRATURA_AGENCY_NAME } }).catch(async (e) => {
      // parallel so'rov yaratib ulgurgan bo'lsa (P2002) — o'shani olamiz
      const again = await prisma.agency.findUnique({ where: { name: REGISTRATURA_AGENCY_NAME } });
      if (!again) throw e;
      return again;
    }));

  if (user.agentRecord && user.agentRecord.agencyId === agency.id) {
    return { agencyId: agency.id, agentId: user.agentRecord.id };
  }

  // Shu agentlikda xuddi shu ismli, hech kimga bog'lanmagan yozuv bo'lsa — o'shani bog'laymiz
  const free = await prisma.agent.findMany({ where: { agencyId: agency.id, user: null }, select: { id: true, name: true } });
  const same = free.find((a) => personNameKey(a.name) === personNameKey(user.fullName));
  const record = same || (await prisma.agent.create({ data: { agencyId: agency.id, name: user.fullName }, select: { id: true, name: true } }));
  await prisma.user.update({ where: { id: user.id }, data: { agentId: record.id } });
  return { agencyId: agency.id, agentId: record.id };
}

/**
 * Operator chek kiritganda agentlik va operator AVTOMATIK qo'yiladi (egasi, 20.11.2026) — buning uchun operatorning
 * o'z Agent yozuvi kerak. Yozuv bog'lanmagan bo'lsa: agentining agentligida shu ismli bo'sh yozuv topiladi yoki yaratiladi.
 * Agentligi aniqlanmasa (agent agentlikka biriktirilmagan) — null qaytadi va chekda formadan kelgan qiymatlar qoladi.
 */
export async function ensureOperatorRecord(
  userId: string
): Promise<{ agencyId: string; agencyName: string; agentId: string; agentName: string } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      agencyId: true,
      agentRecord: { select: { id: true, name: true, agencyId: true, agency: { select: { name: true } } } },
      parentAgent: { select: { agencyId: true, agency: { select: { id: true, name: true } } } },
    },
  });
  if (!user || user.role !== Role.OPERATOR) return null;
  if (user.agentRecord) {
    return { agencyId: user.agentRecord.agencyId, agencyName: user.agentRecord.agency?.name || '', agentId: user.agentRecord.id, agentName: user.agentRecord.name };
  }
  const agencyId = user.parentAgent?.agencyId || user.agencyId || null;
  if (!agencyId) return null;
  const agency = user.parentAgent?.agency || (await prisma.agency.findUnique({ where: { id: agencyId }, select: { id: true, name: true } }));
  const free = await prisma.agent.findMany({ where: { agencyId, user: null }, select: { id: true, name: true } });
  const same = free.find((a) => personNameKey(a.name) === personNameKey(user.fullName));
  const record = same || (await prisma.agent.create({ data: { agencyId, name: user.fullName }, select: { id: true, name: true } }));
  await prisma.user.update({ where: { id: user.id }, data: { agentId: record.id } });
  return { agencyId, agencyName: agency?.name || '', agentId: record.id, agentName: record.name };
}
