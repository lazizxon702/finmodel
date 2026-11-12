import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';

// Baza o'rniga soxta prisma: testlar haqiqiy bazaga tegmaydi
const findUnique = vi.fn();
vi.mock('../src/lib/prisma', () => ({ prisma: { user: { findUnique: (...args: any[]) => findUnique(...args) } } }));

process.env.JWT_SECRET = 'test-secret-for-vitest';

import { AUTH_CACHE_TTL_MS, authenticateToken, invalidateAuthCache, requireRoles } from '../src/middleware/auth.middleware';

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  username: 'operator1',
  fullName: 'Operator Bir',
  role: 'OPERATOR',
  isActive: true,
  agencyId: null,
  parentAgentId: 'agent1',
  ...over,
});

function tokenFor(payload: Record<string, unknown>) {
  return jwt.sign(payload, 'test-secret-for-vitest', { expiresIn: '1h' });
}

function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: unknown) => {
    res.body = body;
    return res;
  };
  return res;
}

async function run(token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {}, query: {} };
  const res = mockRes();
  const next = vi.fn();
  await authenticateToken(req, res, next);
  return { req, res, next };
}

describe('authenticateToken — har so\'rovda foydalanuvchi holati tekshiriladi', () => {
  beforeEach(() => {
    findUnique.mockReset();
    invalidateAuthCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('token yo\'q bo\'lsa 401', async () => {
    const { res, next } = await run();
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('soxta imzoli token 401 va bazaga murojaat qilinmaydi', async () => {
    const forged = jwt.sign({ id: 'u1', role: 'ADMIN' }, 'boshqa-kalit');
    const { res, next } = await run(forged);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('faol foydalanuvchi o\'tadi; rol tokendan emas, bazadan olinadi', async () => {
    findUnique.mockResolvedValue(dbUser({ role: 'OPERATOR' }));
    // Token eski: unda hali ADMIN deb yozilgan
    const { req, res, next } = await run(tokenFor({ id: 'u1', username: 'operator1', fullName: 'Eski ism', role: 'ADMIN' }));
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(req.user).toMatchObject({ id: 'u1', role: 'OPERATOR', fullName: 'Operator Bir', parentAgentId: 'agent1' });
  });

  it('bloklangan foydalanuvchining tokeni 401 (USER_BLOCKED)', async () => {
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    const { res, next } = await run(tokenFor({ id: 'u1', role: 'OPERATOR' }));
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('USER_BLOCKED');
    expect(next).not.toHaveBeenCalled();
  });

  it('o\'chirilgan foydalanuvchining tokeni 401', async () => {
    findUnique.mockResolvedValue(null);
    const { res, next } = await run(tokenFor({ id: 'yoq', role: 'ADMIN' }));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('natija ~30 soniya keshlanadi, keyin bazadan qayta o\'qiladi', async () => {
    findUnique.mockResolvedValue(dbUser());
    const token = tokenFor({ id: 'u1', role: 'OPERATOR' });

    await run(token);
    await run(token);
    expect(findUnique).toHaveBeenCalledTimes(1);

    // Kesh muddati ichida bloklansa ham eski holat ko'rinadi...
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    vi.advanceTimersByTime(AUTH_CACHE_TTL_MS - 1000);
    expect((await run(token)).next).toHaveBeenCalled();

    // ...muddat o'tgach bloklangani aniqlanadi
    vi.advanceTimersByTime(2000);
    const after = await run(token);
    expect(after.res.statusCode).toBe(401);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('invalidateAuthCache bloklashni darhol kuchga kiritadi', async () => {
    findUnique.mockResolvedValue(dbUser());
    const token = tokenFor({ id: 'u1', role: 'OPERATOR' });
    expect((await run(token)).next).toHaveBeenCalled();

    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    invalidateAuthCache('u1');
    expect((await run(token)).res.statusCode).toBe(401);
  });

  it('baza ishlamasa 503 (401 emas — foydalanuvchi tizimdan chiqarib yuborilmaydi)', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'));
    const { res, next } = await run(tokenFor({ id: 'u1', role: 'OPERATOR' }));
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireRoles', () => {
  it('ruxsat etilmagan rol 403', () => {
    const res = mockRes();
    const next = vi.fn();
    requireRoles(['ADMIN'] as any)({ user: { role: 'OPERATOR' } } as any, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('ruxsat etilgan rol o\'tadi', () => {
    const res = mockRes();
    const next = vi.fn();
    requireRoles(['ADMIN'] as any)({ user: { role: 'ADMIN' } } as any, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
