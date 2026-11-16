import { describe, it, expect, vi, beforeEach } from 'vitest';

// Xotiradagi soxta baza — haqiqiy bazaga tegmaydi
const { db } = vi.hoisted(() => {
  const db = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    agent: { count: vi.fn(), findMany: vi.fn() },
    deal: { findMany: vi.fn() },
  };
  return { db };
});
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
process.env.JWT_SECRET = 'test-secret-for-vitest';

import {
  aggregateTeamStats,
  cleanYmd,
  ensureOperatorsForAgent,
  normalizeName,
  pickUsername,
  planOperators,
  todayTashkentYmd,
  usernameBase,
} from '../src/services/team.service';
import { dealScopeWhere } from '../src/services/access.service';

describe('ism va login yordamchilari', () => {
  it('normalizeName: kirill/lotin, registr va apostrof farqi e\'tiborga olinmaydi', () => {
    expect(normalizeName('  Гулнур  ')).toBe(normalizeName('gulnur'));
    expect(normalizeName("Sardor  ALIYEV")).toBe('sardor aliyev');
    expect(normalizeName("O'tkir")).toBe('otkir');
    expect(normalizeName('Шахло')).toBe(normalizeName('Shahlo'));
  });

  it('usernameBase: faqat a-z0-9_, 3–32 belgi', () => {
    expect(usernameBase('Sardor Aliyev')).toBe('sardor_aliyev');
    expect(usernameBase('Гулнур')).toBe('gulnur');
    expect(usernameBase('Ab')).toMatch(/^[a-z0-9_]{3,32}$/);
    expect(usernameBase('Я'.repeat(60)).length).toBeLessThanOrEqual(32);
    expect(usernameBase('!!!')).toMatch(/^[a-z0-9_]{3,32}$/);
  });

  it('pickUsername: band bo\'lsa raqam qo\'shadi va 32 belgidan oshmaydi', () => {
    expect(pickUsername('aziz', new Set())).toBe('aziz');
    expect(pickUsername('aziz', new Set(['aziz']))).toBe('aziz2');
    expect(pickUsername('aziz', new Set(['aziz', 'aziz2']))).toBe('aziz3');
    const long = 'a'.repeat(32);
    const picked = pickUsername(long, new Set([long]));
    expect(picked.length).toBeLessThanOrEqual(32);
    expect(picked).not.toBe(long);
  });
});

describe('planOperators', () => {
  it('ismi mos, bog\'lanmagan operator bo\'lsa — bog\'laydi (bir marta), qolganiga yangi login', () => {
    const plans = planOperators(
      [
        { id: 'a1', name: 'Гулнур' },
        { id: 'a2', name: 'gulnur' },
        { id: 'a3', name: 'Aziz' },
      ],
      [{ id: 'u1', fullName: 'Gulnur', username: 'gulnur' }],
      ['gulnur', 'admin']
    );
    expect(plans[0]).toMatchObject({ agentRecordId: 'a1', action: 'link', userId: 'u1', username: 'gulnur' });
    expect(plans[1]).toMatchObject({ agentRecordId: 'a2', action: 'create', username: 'gulnur2' });
    expect(plans[2]).toMatchObject({ agentRecordId: 'a3', action: 'create', username: 'aziz' });
  });

  it('bir xil ismli ikki yangi operatorga turli loginlar beriladi', () => {
    const plans = planOperators([{ id: '1', name: 'Aziz' }, { id: '2', name: 'Aziz' }], [], []);
    expect(plans.map((p) => p.username)).toEqual(['aziz', 'aziz2']);
  });
});

describe('sana yordamchilari', () => {
  it('cleanYmd', () => {
    expect(cleanYmd('2026-11-01')).toBe('2026-11-01');
    expect(cleanYmd('01.11.2026')).toBeUndefined();
    expect(cleanYmd('2026-13-45')).toBeUndefined();
    expect(cleanYmd(undefined)).toBeUndefined();
  });
  it('todayTashkentYmd: UTC 20:00 allaqachon ertangi kun (UTC+5)', () => {
    expect(todayTashkentYmd(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15');
    expect(todayTashkentYmd(new Date('2026-11-14T18:59:00Z'))).toBe('2026-11-14');
  });
});

describe('aggregateTeamStats', () => {
  const deal = (id: string, createdById: string | null, agentId: string | null, approvalStatus: string, limit: number, amount: number) => ({
    id, createdById, agentId, approvalStatus, withdrawnLimit: limit, agentAmount: amount,
  });

  it('o\'zi kiritgan + Agent yozuviga bog\'langan bitim bir marta; summalar faqat tasdiqlanganlardan', () => {
    const ops = [{ id: 'u1', agentId: 'r1' }, { id: 'u2', agentId: 'r2' }];
    const { perOperator, total } = aggregateTeamStats(ops, [
      deal('d1', 'u1', 'r1', 'APPROVED', 100, 10), // ikkala shart ham — bir marta
      deal('d2', null, 'r1', 'APPROVED', 50, 5), // eski bitim (faqat agentId)
      deal('d3', 'u1', null, 'PENDING_APPROVAL', 70, 7),
      deal('d4', 'u2', 'r2', 'REJECTED', 30, 3),
      deal('d5', 'u1', 'r2', 'APPROVED', 20, 2), // u1 kiritgan, r2 ga yozilgan — ikkalasida ham; jamida bir marta
      deal('d6', 'boshqa', 'rX', 'APPROVED', 999, 99), // jamoaniki emas
    ]);
    expect(perOperator.get('u1')).toEqual({
      dealsCount: 4, approvedCount: 3, pendingCount: 1, rejectedCount: 0, totalWithdrawnLimit: 170, totalAgentAmount: 17, operatorShare: 0,
    });
    expect(perOperator.get('u2')).toMatchObject({ dealsCount: 2, approvedCount: 1, rejectedCount: 1, totalWithdrawnLimit: 20 });
    expect(total).toEqual({
      dealsCount: 5, approvedCount: 3, pendingCount: 1, rejectedCount: 1, totalWithdrawnLimit: 170, totalAgentAmount: 17, operatorShare: 0,
    });
  });
});

describe('ensureOperatorsForAgent', () => {
  beforeEach(() => Object.values(db).forEach((m: any) => Object.values(m).forEach((f: any) => f.mockReset())));

  it('yetishmayotgan operator bo\'lmasa — hech narsa yozmaydi', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'ag', role: 'AGENT', agencyId: 'y1' });
    db.agent.count.mockResolvedValue(0);
    const r = await ensureOperatorsForAgent('ag');
    expect(r.missing).toBe(0);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('agentlikda bir nechta AGENT bo\'lsa — noaniq, yozmaydi', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'ag', role: 'AGENT', agencyId: 'y1' });
    db.agent.count.mockResolvedValue(3);
    db.user.count.mockResolvedValue(2);
    const r = await ensureOperatorsForAgent('ag');
    expect(r.ambiguous).toBe(true);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('dry-run: yozmaydi, parol qaytarmaydi', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'ag', role: 'AGENT', agencyId: 'y1' });
    db.agent.count.mockResolvedValue(1);
    db.user.count.mockResolvedValue(1);
    db.agent.findMany.mockResolvedValue([{ id: 'a1', name: 'Aziz' }]);
    db.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ username: 'admin' }]);
    const r = await ensureOperatorsForAgent('ag', { dryRun: true });
    expect(r.created).toEqual([{ agentRecordId: 'a1', fullName: 'Aziz', username: 'aziz' }]);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('apply: mavjud operatorni bog\'laydi, yangisini xeshlangan parol bilan yaratadi', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'ag', role: 'AGENT', agencyId: 'y1' });
    db.agent.count.mockResolvedValue(2);
    db.user.count.mockResolvedValue(1);
    db.agent.findMany.mockResolvedValue([{ id: 'a1', name: 'Aziz' }, { id: 'a2', name: 'Bobur' }]);
    db.user.findMany
      .mockResolvedValueOnce([{ id: 'u1', fullName: 'aziz', username: 'aziz_old' }])
      .mockResolvedValueOnce([{ username: 'aziz_old' }]);
    db.user.update.mockResolvedValue({});
    db.user.create.mockResolvedValue({});
    const r = await ensureOperatorsForAgent('ag');
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { agentId: 'a1' } });
    expect(r.linked).toHaveLength(1);
    expect(r.created).toHaveLength(1);
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ username: 'bobur', role: 'OPERATOR', parentAgentId: 'ag', agentId: 'a2' });
    expect(data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(data.passwordHash).not.toBe(data.initialPassword);
  });
});

describe('dealScopeWhere: operator va agent', () => {
  beforeEach(() => Object.values(db).forEach((m: any) => Object.values(m).forEach((f: any) => f.mockReset())));

  it('OPERATOR agentId bilan: o\'zi kiritgan YOKI o\'z Agent yozuviga bog\'langan', async () => {
    db.user.findUnique.mockResolvedValue({ agentId: 'r1' });
    expect(await dealScopeWhere({ id: 'op1', role: 'OPERATOR' })).toEqual({ OR: [{ createdById: 'op1' }, { agentId: 'r1' }] });
  });

  it('OPERATOR agentId yo\'q: faqat o\'zi kiritgan', async () => {
    db.user.findUnique.mockResolvedValue({ agentId: null });
    expect(await dealScopeWhere({ id: 'op1', role: 'OPERATOR' })).toEqual({ createdById: 'op1' });
  });

  it('AGENT: jamoadagi operatorlarning Agent yozuvlari ham qo\'shiladi', async () => {
    db.user.findMany.mockImplementation(async ({ select }: any) =>
      select.agentId ? [{ agentId: 'r1' }, { agentId: 'r2' }] : [{ id: 'op1' }, { id: 'op2' }]
    );
    db.user.findUnique.mockResolvedValue({ agencyId: 'y1' });
    expect(await dealScopeWhere({ id: 'ag', role: 'AGENT' })).toEqual({
      OR: [{ createdById: { in: ['ag', 'op1', 'op2'] } }, { agencyId: 'y1' }, { agentId: { in: ['r1', 'r2'] } }],
    });
  });
});
