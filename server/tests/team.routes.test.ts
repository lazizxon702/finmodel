import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ── Xotiradagi soxta baza: testlar haqiqiy bazaga tegmaydi ──
// vi.mock fayl boshiga ko'tariladi, shuning uchun soxta baza vi.hoisted ichida yaratiladi
const { db, store } = vi.hoisted(() => {
  const store = { users: [] as any[] };
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: any) =>
        store.users.find((u) => (where.id !== undefined ? u.id === where.id : u.username === where.username)) ?? null
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        store.users.find((u) => u.id === where.id && u.parentAgentId === where.parentAgentId && u.role === where.role) ?? null
      ),
      findMany: vi.fn(async ({ where }: any) =>
        store.users.filter((u) => u.parentAgentId === where.parentAgentId && u.role === where.role)
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: 'new-' + (store.users.length + 1),
          isActive: true,
          createdAt: new Date(),
          agencyId: null,
          parentAgentId: null,
          _count: { dealsCreated: 0 },
          ...data,
        };
        store.users.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.users.find((u) => u.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { db, store };
});
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

process.env.JWT_SECRET = 'test-secret-for-vitest';

import teamRoutes from '../src/routes/team.routes';
import { invalidateAuthCache } from '../src/middleware/auth.middleware';
import { PASSWORD_MIN_LENGTH, cleanUsername, generatePassword, passwordError } from '../src/routes/auth.routes';

const seedUser = (id: string, role: string, over: Record<string, unknown> = {}) => ({
  id,
  username: id,
  fullName: `Ism ${id}`,
  role,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  agencyId: null,
  parentAgentId: null,
  passwordHash: 'eski-xesh',
  _count: { dealsCreated: 0 },
  ...over,
});

let server: http.Server;
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/team', teamRoutes);
  // 0-port: tizim bo'sh portni o'zi tanlaydi (5000/5173 band qilinmaydi)
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  invalidateAuthCache();
  store.users = [
    seedUser('admin', 'ADMIN'),
    seedUser('agentA', 'AGENT', { agencyId: 'agencyA' }),
    seedUser('agentB', 'AGENT', { agencyId: 'agencyB' }),
    seedUser('opA1', 'OPERATOR', { parentAgentId: 'agentA', _count: { dealsCreated: 7 } }),
    seedUser('opB1', 'OPERATOR', { parentAgentId: 'agentB' }),
    seedUser('kassir', 'CASHIER'),
  ];
});

async function call(as: string, method: string, path: string, body?: unknown) {
  const token = jwt.sign({ id: as }, 'test-secret-for-vitest', { expiresIn: '1h' });
  const res = await fetch(baseUrl + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

describe('GET /api/team/operators', () => {
  it('agent faqat o\'z jamoasini ko\'radi (bitimlar soni bilan)', async () => {
    const { status, body } = await call('agentA', 'GET', '/api/team/operators');
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: 'opA1', username: 'opA1', isActive: true, dealsCount: 7 });
    expect(body[0]).not.toHaveProperty('passwordHash');
  });

  it('agent ?agentId= bilan boshqa jamoani ko\'ra olmaydi', async () => {
    const { body } = await call('agentA', 'GET', '/api/team/operators?agentId=agentB');
    expect(body.map((o: any) => o.id)).toEqual(['opA1']);
  });

  it('ADMIN ?agentId= bilan istalgan agent jamoasini ko\'radi', async () => {
    const { status, body } = await call('admin', 'GET', '/api/team/operators?agentId=agentB');
    expect(status).toBe(200);
    expect(body.map((o: any) => o.id)).toEqual(['opB1']);
  });

  it('ADMIN agentId siz → 400; agent bo\'lmagan ID → 404', async () => {
    expect((await call('admin', 'GET', '/api/team/operators')).status).toBe(400);
    expect((await call('admin', 'GET', '/api/team/operators?agentId=kassir')).status).toBe(404);
    expect((await call('admin', 'GET', '/api/team/operators?agentId=yoq')).status).toBe(404);
  });

  it('boshqa rollar → 403', async () => {
    expect((await call('kassir', 'GET', '/api/team/operators')).status).toBe(403);
    expect((await call('opA1', 'GET', '/api/team/operators')).status).toBe(403);
    expect((await call('opA1', 'POST', '/api/team/operators', { username: 'yangi', fullName: 'Yangi' })).status).toBe(403);
  });
});

describe('POST /api/team/operators', () => {
  it("parolsiz: tasodifiy parol yaratiladi; agent uni o'z jamoasi ro'yxatida ko'radi, boshqa agent ko'rmaydi", async () => {
    const { status, body } = await call('agentA', 'POST', '/api/team/operators', { username: ' yangi_op ', fullName: 'Yangi Operator' });
    expect(status).toBe(201);
    expect(body).toMatchObject({ username: 'yangi_op', fullName: 'Yangi Operator', isActive: true, dealsCount: 0 });
    expect(typeof body.generatedPassword).toBe('string');
    expect(body.generatedPassword.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);

    const row = store.users.find((u) => u.username === 'yangi_op');
    expect(row.role).toBe('OPERATOR');
    expect(row.parentAgentId).toBe('agentA');
    // Ochiq parol saqlanadi: ADMIN (Foydalanuvchilar) va shu operatorning agenti (Jamoa) ko'rib turadi
    expect(row.initialPassword).toBe(body.generatedPassword);
    expect(body).not.toHaveProperty('initialPassword');
    expect(body.visiblePassword).toBe(body.generatedPassword);
    expect(row.passwordHash).not.toContain(body.generatedPassword);
    expect(await bcrypt.compare(body.generatedPassword, row.passwordHash)).toBe(true);

    // O'z agenti ro'yxatda parolni ko'radi
    const list = await call('agentA', 'GET', '/api/team/operators');
    expect(list.body.find((o: any) => o.username === 'yangi_op').visiblePassword).toBe(body.generatedPassword);
    // Boshqa agentning ro'yxatida bu operator ham, uning paroli ham yo'q
    const other = await call('agentB', 'GET', '/api/team/operators');
    expect(JSON.stringify(other.body)).not.toContain(body.generatedPassword);
  });

  it('parol berilsa: kamida 8 belgi; generatedPassword qaytmaydi, parol visiblePassword da', async () => {
    const short = await call('agentA', 'POST', '/api/team/operators', { username: 'op2', fullName: 'Op', password: '1234567' });
    expect(short.status).toBe(400);
    expect(store.users.some((u) => u.username === 'op2')).toBe(false);

    const ok = await call('agentA', 'POST', '/api/team/operators', { username: 'op2', fullName: 'Op', password: 'uzunparol1' });
    expect(ok.status).toBe(201);
    expect(ok.body).not.toHaveProperty('generatedPassword');
    expect(ok.body.visiblePassword).toBe('uzunparol1');
  });

  it('login band bo\'lsa 409', async () => {
    const { status } = await call('agentA', 'POST', '/api/team/operators', { username: 'opB1', fullName: 'Takror' });
    expect(status).toBe(409);
  });

  it('ADMIN ?agentId= bilan yaratsa operator o\'sha agent jamoasiga tushadi', async () => {
    const { status } = await call('admin', 'POST', '/api/team/operators?agentId=agentB', { username: 'opB2', fullName: 'B Ikki' });
    expect(status).toBe(201);
    expect(store.users.find((u) => u.username === 'opB2').parentAgentId).toBe('agentB');
  });

  it('login yoki ism yo\'q → 400', async () => {
    expect((await call('agentA', 'POST', '/api/team/operators', { fullName: 'Ism' })).status).toBe(400);
    expect((await call('agentA', 'POST', '/api/team/operators', { username: 'op3' })).status).toBe(400);
    expect((await call('agentA', 'POST', '/api/team/operators', { username: 'a b', fullName: 'Ism' })).status).toBe(400);
  });
});

describe('PUT /api/team/operators/:id', () => {
  it('boshqa agentning operatori → 404 va u o\'zgarmaydi', async () => {
    const { status } = await call('agentA', 'PUT', '/api/team/operators/opB1', { isActive: false, fullName: 'Buzildi', resetPassword: true });
    expect(status).toBe(404);
    const opB1 = store.users.find((u) => u.id === 'opB1');
    expect(opB1).toMatchObject({ isActive: true, fullName: 'Ism opB1', passwordHash: 'eski-xesh' });
  });

  it('agentning o\'zini yoki boshqa agentni operator sifatida o\'zgartirib bo\'lmaydi', async () => {
    expect((await call('agentA', 'PUT', '/api/team/operators/agentB', { isActive: false })).status).toBe(404);
    expect((await call('agentA', 'PUT', '/api/team/operators/admin', { isActive: false })).status).toBe(404);
    expect(store.users.find((u) => u.id === 'admin').isActive).toBe(true);
  });

  it('o\'z operatorini bloklaydi va ismini o\'zgartiradi', async () => {
    const { status, body } = await call('agentA', 'PUT', '/api/team/operators/opA1', { isActive: false, fullName: 'Yangi Ism' });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 'opA1', isActive: false, fullName: 'Yangi Ism' });
    expect(body).not.toHaveProperty('generatedPassword');
  });

  it('resetPassword: true → yangi parol bir marta qaytadi', async () => {
    const { status, body } = await call('agentA', 'PUT', '/api/team/operators/opA1', { resetPassword: true });
    expect(status).toBe(200);
    const row = store.users.find((u) => u.id === 'opA1');
    expect(await bcrypt.compare(body.generatedPassword, row.passwordHash)).toBe(true);
    expect(row.initialPassword).toBe(body.generatedPassword);
  });

  it('qisqa parol → 400; bo\'sh so\'rov → 400', async () => {
    expect((await call('agentA', 'PUT', '/api/team/operators/opA1', { resetPassword: 'qisqa' })).status).toBe(400);
    expect((await call('agentA', 'PUT', '/api/team/operators/opA1', {})).status).toBe(400);
    expect(store.users.find((u) => u.id === 'opA1').passwordHash).toBe('eski-xesh');
  });

  it('ADMIN ?agentId= bilan faqat o\'sha agent jamoasidagi operatorni o\'zgartiradi', async () => {
    expect((await call('admin', 'PUT', '/api/team/operators/opA1?agentId=agentB', { isActive: false })).status).toBe(404);
    expect((await call('admin', 'PUT', '/api/team/operators/opB1?agentId=agentB', { isActive: false })).status).toBe(200);
    expect(store.users.find((u) => u.id === 'opB1').isActive).toBe(false);
  });
});

describe('bloklangan foydalanuvchi', () => {
  it('bloklangan agentning tokeni 401', async () => {
    store.users.find((u) => u.id === 'agentA').isActive = false;
    const { status, body } = await call('agentA', 'GET', '/api/team/operators');
    expect(status).toBe(401);
    expect(body.code).toBe('USER_BLOCKED');
  });
});

describe('parol va login yordamchilari', () => {
  it('generatePassword: so\'ralgan uzunlik, xavfsiz alifbo, takrorlanmaydi', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword(14);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
    expect(generatePassword()).toHaveLength(12);
  });

  it('passwordError: kamida 8 belgi, 72 baytdan uzun emas', () => {
    expect(passwordError('1234567')).toBeTruthy();
    expect(passwordError(undefined)).toBeTruthy();
    expect(passwordError('12345678')).toBeNull();
    expect(passwordError('a'.repeat(73))).toBeTruthy();
  });

  it('cleanUsername: bo\'shliqlar kesiladi, ichida bo\'shliq bo\'lsa xato', () => {
    expect(cleanUsername('  nazirbek ')).toBe('nazirbek');
    expect(() => cleanUsername('ab')).toThrow();
    expect(() => cleanUsername('a b c')).toThrow();
    expect(() => cleanUsername(undefined)).toThrow();
  });
});
