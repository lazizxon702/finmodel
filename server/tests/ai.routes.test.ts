import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Sof funksiyalar tekshiriladi — baza va tarmoq soxta
vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

import {
  AI_ERRORS,
  DEFAULT_GEMINI_MODEL,
  AiContext,
  buildSystemPrompt,
  callGemini,
  classifyGeminiFailure,
  extractGeminiReply,
  getGeminiModel,
  normalizeHistory,
  parseLang,
  renderAiContext,
  tashkentPeriods,
} from '../src/routes/ai.routes';

const stats = (count: number, withdrawnLimit: number, profit: number, agentCommission: number) => ({
  count,
  withdrawnLimit,
  profit,
  agentCommission,
});

const baseContext = (over: Partial<AiContext> = {}): AiContext => ({
  generatedAt: new Date('2026-11-12T09:00:00Z'),
  todayLabel: '12.11.2026',
  monthLabel: '11.2026',
  user: { fullName: 'Bosh Administrator', role: 'ADMIN' },
  scope: 'all',
  deals: {
    today: stats(2, 20_000_000, 1_234_567, 600_000),
    month: stats(15, 150_000_000, 9_000_000, 4_000_000),
    total: stats(208, 2_000_000_000, 120_000_000, 55_000_000),
    pendingApproval: 3,
    rejected: 1,
  },
  ...over,
});

describe('Gemini xatolarini tasniflash', () => {
  it('yaroqsiz kalit (Google 400 + API_KEY_INVALID qaytaradi) → INVALID_KEY', () => {
    const body = {
      error: {
        code: 400,
        status: 'INVALID_ARGUMENT',
        message: 'API key not valid. Please pass a valid API key.',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
      },
    };
    expect(classifyGeminiFailure(400, body)).toBe('INVALID_KEY');
  });

  it('403 PERMISSION_DENIED → INVALID_KEY', () => {
    expect(classifyGeminiFailure(403, { error: { status: 'PERMISSION_DENIED', message: 'denied' } })).toBe('INVALID_KEY');
  });

  it('429 RESOURCE_EXHAUSTED → QUOTA_EXCEEDED', () => {
    expect(classifyGeminiFailure(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).toBe('QUOTA_EXCEEDED');
  });

  it('404 NOT_FOUND → MODEL_NOT_FOUND', () => {
    const body = { error: { status: 'NOT_FOUND', message: 'models/gemini-x is not found for API version v1beta' } };
    expect(classifyGeminiFailure(404, body)).toBe('MODEL_NOT_FOUND');
  });

  it('boshqa xatolar → UPSTREAM_ERROR; javob JSON bo\'lmasa ham yiqilmaydi', () => {
    expect(classifyGeminiFailure(500, { error: { status: 'INTERNAL' } })).toBe('UPSTREAM_ERROR');
    expect(classifyGeminiFailure(503, null)).toBe('UPSTREAM_ERROR');
    expect(classifyGeminiFailure(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad contents' } })).toBe('UPSTREAM_ERROR');
  });

  it('har bir kod uchun HTTP status va uch tilda matn bor; 401/403 ishlatilmaydi', () => {
    expect(AI_ERRORS.NO_KEY.status).toBe(503);
    expect(AI_ERRORS.QUOTA_EXCEEDED.status).toBe(429);
    expect(AI_ERRORS.TIMEOUT.status).toBe(504);
    expect(AI_ERRORS.NETWORK.status).toBe(502);
    for (const entry of Object.values(AI_ERRORS)) {
      // 401 klientda "sessiya tugadi" deb qabul qilinadi — AI xatolari uni hech qachon qaytarmasligi kerak
      expect([401, 403]).not.toContain(entry.status);
      expect(entry.uz && entry.ru && entry.en).toBeTruthy();
    }
  });

  it('til: faqat uz | ru | en, qolgani uz', () => {
    expect(parseLang('ru')).toBe('ru');
    expect(parseLang('en')).toBe('en');
    expect(parseLang('de')).toBe('uz');
    expect(parseLang(undefined)).toBe('uz');
  });
});

describe('Gemini javobini o\'qish', () => {
  it('matn qismlari birlashtiriladi, "thought" qismlari tashlab ketiladi', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'ichki fikr', thought: true }, { text: 'Salom, ' }, { text: 'dunyo' }] } }] };
    expect(extractGeminiReply(body)).toEqual({ text: 'Salom, dunyo' });
  });

  it('bloklangan so\'rov / javob → BLOCKED', () => {
    expect(extractGeminiReply({ promptFeedback: { blockReason: 'SAFETY' } })).toEqual({ code: 'BLOCKED' });
    expect(extractGeminiReply({ candidates: [{ finishReason: 'SAFETY' }] })).toEqual({ code: 'BLOCKED' });
  });

  it('matnsiz javob → EMPTY_RESPONSE (soxta javob o\'ylab topilmaydi)', () => {
    expect(extractGeminiReply({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] })).toEqual({ code: 'EMPTY_RESPONSE' });
    expect(extractGeminiReply({})).toEqual({ code: 'EMPTY_RESPONSE' });
    expect(extractGeminiReply(null)).toEqual({ code: 'EMPTY_RESPONSE' });
  });
});

describe('suhbat tarixi', () => {
  it('rollar moslanadi, bo\'sh xabarlar tashlanadi, birinchi xabar doim foydalanuvchiniki', () => {
    const contents = normalizeHistory([
      { role: 'model', text: 'Assalomu alaykum!' },
      { role: 'user', text: ' Bugun nechta bitim? ' },
      { role: 'agent', text: '2 ta' },
      { role: 'user', text: '' },
      { role: 'user', text: 123 },
    ]);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'Bugun nechta bitim?' }] },
      { role: 'model', parts: [{ text: '2 ta' }] },
    ]);
  });

  it('massiv bo\'lmasa bo\'sh', () => {
    expect(normalizeHistory('x')).toEqual([]);
    expect(normalizeHistory(undefined)).toEqual([]);
  });
});

describe('kontekst matni (rolga qarab)', () => {
  it('moliyaviy rol: bitimlar, Trust, DDS va qarzdorlar real raqamlar bilan', () => {
    const text = renderAiContext(
      baseContext({
        trust: { totalDebt: 16_000_000, totalPaid: 6_000_000, balance: 10_000_000 },
        dds: {
          balances: { CASH: 5_000_000, BANK_CARD: 2_000_000, SETTLEMENT_ACCOUNT: 0, total: 7_000_000 },
          monthIncome: 30_000_000,
          monthExpense: 12_000_000,
          topIncome: [{ category: 'Trust 1 daromadi', amount: 6_000_000 }],
          topExpense: [{ category: 'Ijara', amount: 4_000_000 }],
        },
        debtors: {
          count: 1,
          totalDebt: 3_000_000,
          top: [{ dealNumber: 3501, name: 'Karimov Anvar', debt: 3_000_000, dueDate: new Date('2026-11-01T00:00:00Z') }],
        },
      })
    );
    expect(text).toContain('Bugun (12.11.2026): soni 2 ta; yechilgan limit 20000000; foyda 1234567; agent komissiyasi 600000');
    expect(text).toContain('Tasdiq kutayotgan bitimlar: 3 ta');
    expect(text).toContain('Jami qarz (Trust bizga qarzdor): 16000000');
    expect(text).toContain('Qoldiq: 10000000');
    expect(text).toContain('kassa (naqd) 5000000');
    expect(text).toContain('kirim 30000000; chiqim 12000000; sof oqim 18000000');
    expect(text).toContain('Ijara — 4000000');
    expect(text).toContain("Bitim №3501 — Karimov Anvar — qarz 3000000; to'lov muddati 01.11.2026 (muddati o'tgan)");
  });

  it('OPERATOR/AGENT: faqat o\'z bitimlari — foyda, Trust, DDS va qarzdorlar yo\'q', () => {
    const text = renderAiContext(baseContext({ scope: 'own', user: { fullName: 'Назирбек', role: 'AGENT' } }));
    expect(text).toContain("BITIMLAR (o'z doirasi)");
    expect(text).toContain('agent komissiyasi 600000');
    // Kompaniya foydasi agent/operatorga ko'rsatilmaydi
    expect(text).not.toContain('; foyda ');
    expect(text).not.toContain('1234567');
    expect(text).not.toContain('TRUST HISOB-KITOBI');
    expect(text).not.toContain('DDS (pul harakati)');
    expect(text).not.toContain('QARZDORLAR');
  });

  it('tizim ko\'rsatmasi: faqat berilgan raqamlar, o\'ylab topmaslik, javob tili', () => {
    const prompt = buildSystemPrompt('KONTEKST-MATNI', 'ru');
    expect(prompt).toContain("O'YLAB TOPMA");
    expect(prompt).toContain('<malumotlar>\nKONTEKST-MATNI\n</malumotlar>');
    expect(prompt).toContain('rus tili');
  });

  it('Toshkent vaqti bo\'yicha kun va oy chegaralari', () => {
    // 31.10.2026 20:30 UTC = 01.11.2026 01:30 Toshkent
    const p = tashkentPeriods(new Date('2026-10-31T20:30:00Z'));
    expect(p.todayLabel).toBe('01.11.2026');
    expect(p.monthLabel).toBe('11.2026');
    expect(p.today.gte.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(p.today.lt.toISOString()).toBe('2026-11-01T19:00:00.000Z');
    expect(p.month.gte.toISOString()).toBe('2026-10-31T19:00:00.000Z');
    expect(p.month.lt.toISOString()).toBe('2026-11-30T19:00:00.000Z');
    // Dekabrdan keyingi oy — yangi yil
    expect(tashkentPeriods(new Date('2026-12-15T10:00:00Z')).month.lt.toISOString()).toBe('2026-12-31T19:00:00.000Z');
  });
});

describe('callGemini (tarmoq soxta)', () => {
  const FAKE_KEY = 'soxta-test-kaliti-123';
  const contents = [{ role: 'user' as const, parts: [{ text: 'Salom' }] }];
  const realFetch = globalThis.fetch;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    warnSpy.mockRestore();
    delete process.env.GEMINI_MODEL;
  });

  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  it('kalit sarlavhada yuboriladi, URL\'da emas', async () => {
    const fetchMock = respond(200, { candidates: [{ content: { parts: [{ text: 'Javob' }] } }] });
    globalThis.fetch = fetchMock as any;

    const result = await callGemini(FAKE_KEY, 'gemini-test', 'tizim', contents);
    expect(result).toEqual({ ok: true, text: 'Javob' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(url).not.toContain(FAKE_KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY);
    const sent = JSON.parse(String(init.body));
    expect(sent.systemInstruction.parts[0].text).toBe('tizim');
    expect(sent.contents).toEqual(contents);
    expect(String(init.body)).not.toContain(FAKE_KEY);
  });

  it('xato javob kodga aylanadi va logga kalit tushmaydi', async () => {
    globalThis.fetch = respond(400, {
      error: { status: 'INVALID_ARGUMENT', message: `API key not valid: ${FAKE_KEY}`, details: [{ reason: 'API_KEY_INVALID' }] },
    }) as any;
    expect(await callGemini(FAKE_KEY, 'gemini-test', 'tizim', contents)).toEqual({ ok: false, code: 'INVALID_KEY' });
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(FAKE_KEY);
  });

  it('kvota tugasa QUOTA_EXCEEDED, model topilmasa MODEL_NOT_FOUND', async () => {
    globalThis.fetch = respond(429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }) as any;
    expect((await callGemini(FAKE_KEY, 'm', 's', contents)).code).toBe('QUOTA_EXCEEDED');
    globalThis.fetch = respond(404, { error: { status: 'NOT_FOUND', message: 'models/m is not found' } }) as any;
    expect((await callGemini(FAKE_KEY, 'm', 's', contents)).code).toBe('MODEL_NOT_FOUND');
  });

  it('tarmoq uzilsa NETWORK, vaqt tugasa TIMEOUT', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as any;
    expect((await callGemini(FAKE_KEY, 'm', 's', contents)).code).toBe('NETWORK');

    globalThis.fetch = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    }) as any;
    expect((await callGemini(FAKE_KEY, 'm', 's', contents)).code).toBe('TIMEOUT');
  });

  it('model: GEMINI_MODEL bilan almashtiriladi, yaroqsiz qiymatda standart model', () => {
    delete process.env.GEMINI_MODEL;
    expect(getGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);
    process.env.GEMINI_MODEL = 'gemini-custom-1';
    expect(getGeminiModel()).toBe('gemini-custom-1');
    process.env.GEMINI_MODEL = 'x/../../y?key=1';
    expect(getGeminiModel()).toBe(DEFAULT_GEMINI_MODEL);
  });
});
