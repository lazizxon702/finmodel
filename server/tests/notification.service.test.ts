import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Soxta tashqi dunyo: baza, Telegram va Firebase. Testlar hech qayerga haqiqiy so'rov yubormaydi. ──
const db = {
  user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  deviceToken: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
};
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

const sendMessage = vi.fn();
const apiConstructed = vi.fn();
vi.mock('grammy', () => ({
  Api: class {
    constructor(...args: any[]) {
      apiConstructed(...args);
    }
    sendMessage(...args: any[]) {
      return sendMessage(...args);
    }
  },
}));

const sendEachForMulticast = vi.fn();
const initializeApp = vi.fn(() => ({ name: 'finmodel-notifications' }));
vi.mock('firebase-admin/app', () => ({
  initializeApp: (...args: any[]) => initializeApp(...(args as [])),
  cert: (value: unknown) => value,
  getApps: () => [],
}));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: (...args: any[]) => sendEachForMulticast(...args) }),
}));

const ENV_KEYS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'FIREBASE_SERVICE_ACCOUNT_PATH'];
const savedEnv: Record<string, string | undefined> = {};
let warnSpy: ReturnType<typeof vi.spyOn>;

/** Modul ichidagi keshlar (service account, messaging) har testda yangidan boshlansin */
async function loadService() {
  vi.resetModules();
  return import('../src/services/notification.service');
}

const FAKE_TG_TOKEN = '1:soxta-test-tokeni';
const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'soxta-loyiha',
  client_email: 'test@soxta-loyiha.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\\nsoxta\\n-----END PRIVATE KEY-----\\n',
});

const notice = {
  dealId: 'd1',
  dealNumber: 3521,
  decision: 'APPROVED' as const,
  recipientUserId: 'u1',
  customerName: 'Aliyev <Vali>',
  amount: 10_000_000,
  decidedByName: 'Bosh Administrator',
};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Standart fayl (server/firebase-service-account.json) mavjud bo'lsa ham testga ta'sir qilmasin
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH = 'mavjud-bolmagan-fayl-test.json';
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ telegramId: 777n, isActive: true });
  db.deviceToken.findMany.mockResolvedValue([]);
  db.deviceToken.deleteMany.mockResolvedValue({ count: 0 });
  sendMessage.mockResolvedValue({});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  warnSpy.mockRestore();
});

describe('buildDealDecisionText', () => {
  it('tasdiqlangan bitim: raqam, mijoz, summa, qaror, Toshkent vaqti', async () => {
    const { buildDealDecisionText } = await loadService();
    const msg = buildDealDecisionText(notice, new Date('2026-11-12T09:05:00Z'));
    expect(msg.title).toBe('Bitim №3521 tasdiqlandi');
    expect(msg.body).toContain('Mijoz: Aliyev <Vali>');
    expect(msg.body).toContain("Summa: 10 000 000 so'm");
    expect(msg.body).toContain('Qaror: Tasdiqlandi');
    expect(msg.body).toContain('Sana: 12.11.2026 14:05 (Toshkent vaqti)');
    expect(msg.body).not.toContain('sababi');
    // Telegram HTML: foydalanuvchi matni ekranlanadi
    expect(msg.html).toContain('Aliyev &lt;Vali&gt;');
    expect(msg.data).toMatchObject({ type: 'deal_decision', dealId: 'd1', dealNumber: '3521', decision: 'APPROVED' });
  });

  it('rad etilgan bitim: sabab ko\'rsatiladi', async () => {
    const { buildDealDecisionText } = await loadService();
    const msg = buildDealDecisionText({ ...notice, decision: 'REJECTED', reason: 'Pasport rasmi yo\'q' });
    expect(msg.title).toBe('Bitim №3521 rad etildi');
    expect(msg.body).toContain("Rad etish sababi: Pasport rasmi yo'q");
    expect(msg.data.reason).toBe("Pasport rasmi yo'q");
    // FCM data faqat satrlardan iborat bo'lishi shart
    for (const value of Object.values(msg.data)) expect(typeof value).toBe('string');
  });
});

describe('notifyDealDecision — hech qachon xato tashlamaydi', () => {
  it('Telegram tokeni va Firebase yo\'q: jim o\'tadi, hech narsa yuborilmaydi', async () => {
    const { notifyDealDecision, getNotificationStatus } = await loadService();
    await expect(notifyDealDecision(notice)).resolves.toBeUndefined();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(getNotificationStatus()).toEqual({ telegramConfigured: false, pushConfigured: false });
  });

  it('"MISSING_TELEGRAM_BOT_TOKEN" o\'rinbosari token deb qabul qilinmaydi', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'MISSING_TELEGRAM_BOT_TOKEN';
    const { notifyDealDecision, getNotificationStatus } = await loadService();
    await notifyDealDecision(notice);
    expect(apiConstructed).not.toHaveBeenCalled();
    expect(getNotificationStatus().telegramConfigured).toBe(false);
  });

  it('Firebase ogohlantirishi faqat bir marta chiqadi', async () => {
    const { notifyDealDecision } = await loadService();
    await notifyDealDecision(notice);
    await notifyDealDecision(notice);
    const pushWarnings = (console.warn as any).mock.calls.filter((c: any[]) => String(c[0]).includes('Push bildirishnomalar'));
    expect(pushWarnings).toHaveLength(1);
  });

  it('qabul qiluvchi yo\'q bo\'lsa bazaga ham murojaat qilinmaydi', async () => {
    const { notifyDealDecision } = await loadService();
    await notifyDealDecision({ ...notice, recipientUserId: null });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('baza xato bersa ham xato tashlanmaydi', async () => {
    db.user.findUnique.mockRejectedValue(new Error('db down'));
    const { notifyDealDecision } = await loadService();
    await expect(notifyDealDecision(notice)).resolves.toBeUndefined();
  });

  it('Telegram bog\'langan bo\'lsa chat_id ga HTML xabar ketadi', async () => {
    process.env.TELEGRAM_BOT_TOKEN = FAKE_TG_TOKEN;
    const { notifyDealDecision } = await loadService();
    await notifyDealDecision(notice);
    expect(sendMessage).toHaveBeenCalledOnce();
    const [chatId, text, options] = sendMessage.mock.calls[0];
    expect(chatId).toBe('777');
    expect(text).toContain('Bitim №3521 tasdiqlandi');
    expect(options).toEqual({ parse_mode: 'HTML' });
  });

  it('Telegram xatosi yutiladi va logga token tushmaydi', async () => {
    process.env.TELEGRAM_BOT_TOKEN = FAKE_TG_TOKEN;
    sendMessage.mockRejectedValue(new Error(`request to https://api.telegram.org/bot${FAKE_TG_TOKEN}/sendMessage failed`));
    const { notifyDealDecision } = await loadService();
    await expect(notifyDealDecision(notice)).resolves.toBeUndefined();
    const logged = JSON.stringify((console.warn as any).mock.calls);
    expect(logged).not.toContain(FAKE_TG_TOKEN);
  });

  it('Telegram bog\'lanmagan foydalanuvchiga xabar yuborilmaydi', async () => {
    process.env.TELEGRAM_BOT_TOKEN = FAKE_TG_TOKEN;
    db.user.findUnique.mockResolvedValue({ telegramId: null, isActive: true });
    const { notifyDealDecision } = await loadService();
    await notifyDealDecision(notice);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('bloklangan foydalanuvchiga hech narsa yuborilmaydi', async () => {
    process.env.TELEGRAM_BOT_TOKEN = FAKE_TG_TOKEN;
    db.user.findUnique.mockResolvedValue({ telegramId: 777n, isActive: false });
    const { notifyDealDecision } = await loadService();
    await notifyDealDecision(notice);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('Android push (FCM)', () => {
  beforeEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;
    db.deviceToken.findMany.mockResolvedValue([{ token: 'yaxshi-token' }, { token: 'eskirgan-token' }, { token: 'vaqtincha-xato' }]);
  });

  it('yuboradi va yaroqsiz tokenlarni bazadan o\'chiradi', async () => {
    sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 2,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    db.deviceToken.deleteMany.mockResolvedValue({ count: 1 });

    const { sendTestNotification, getNotificationStatus } = await loadService();
    expect(getNotificationStatus().pushConfigured).toBe(true);

    const result = await sendTestNotification('u1');
    expect(result.push).toMatchObject({ status: 'sent', sent: 1, failed: 2, removed: 1 });

    const payload = sendEachForMulticast.mock.calls[0][0];
    expect(payload.tokens).toEqual(['yaxshi-token', 'eskirgan-token', 'vaqtincha-xato']);
    expect(payload.android.priority).toBe('high');
    // Faqat ro'yxatdan chiqqan token o'chiriladi; vaqtinchalik xato bergani qoladi
    expect(db.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['eskirgan-token'] } } });
    // Env'dagi "\n" matni haqiqiy qator ko'chirishiga aylantirilgan
    expect((initializeApp.mock.calls[0] as any[])[0].credential.privateKey).toContain('\nsoxta\n');
  });

  it('FCM butunlay ishlamasa ham notifyDealDecision xato tashlamaydi', async () => {
    sendEachForMulticast.mockRejectedValue(Object.assign(new Error('boom'), { code: 'app/invalid-credential' }));
    const { notifyDealDecision } = await loadService();
    await expect(notifyDealDecision(notice)).resolves.toBeUndefined();
    expect(db.deviceToken.deleteMany).not.toHaveBeenCalled();
  });

  it('yaroqsiz JSON: push o\'chiq, ilova buzilmaydi', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{bu json emas';
    const { notifyDealDecision, getNotificationStatus } = await loadService();
    expect(getNotificationStatus().pushConfigured).toBe(false);
    await expect(notifyDealDecision(notice)).resolves.toBeUndefined();
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('qurilma tokeni yo\'q foydalanuvchi: FCM chaqirilmaydi', async () => {
    db.deviceToken.findMany.mockResolvedValue([]);
    const { sendTestNotification } = await loadService();
    const result = await sendTestNotification('u1');
    expect(result.push).toMatchObject({ status: 'skipped', reason: 'NO_DEVICE_TOKENS' });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });
});

describe('Telegram\'ni bog\'lash kodi', () => {
  it('kod Telegram deep link talabiga mos va muddati ichida saqlanadi', async () => {
    const { createTelegramLinkCode, telegramLinkCodeExpiry, TELEGRAM_LINK_CODE_TTL_MS } = await loadService();
    const now = Date.parse('2026-11-12T10:00:00Z');
    const { code, expiresAt } = createTelegramLinkCode(now);
    expect(code).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(expiresAt.getTime()).toBe(now + TELEGRAM_LINK_CODE_TTL_MS);
    expect(telegramLinkCodeExpiry(code)?.getTime()).toBe(expiresAt.getTime());
    expect(createTelegramLinkCode(now).code).not.toBe(code);
  });

  it('to\'g\'ri kod: telegramId yoziladi, kod o\'chiriladi, eski bog\'lanish uziladi', async () => {
    const { createTelegramLinkCode, linkTelegramByCode } = await loadService();
    const { code } = createTelegramLinkCode();
    db.user.findUnique.mockResolvedValue({ id: 'u1', fullName: 'Operator Bir', username: 'operator1', isActive: true });

    // Foydalanuvchi kodni kichik harflarda yozsa ham ishlaydi
    const result = await linkTelegramByCode(code.toLowerCase(), 555);
    expect(result).toEqual({ ok: true, fullName: 'Operator Bir', username: 'operator1' });
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ telegramLinkCode: code });
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { telegramId: 555n, NOT: { id: 'u1' } }, data: { telegramId: null } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { telegramId: 555n, telegramLinkCode: null } });
  });

  it('noma\'lum kod: NOT_FOUND, hech narsa yozilmaydi', async () => {
    const { linkTelegramByCode } = await loadService();
    db.user.findUnique.mockResolvedValue(null);
    expect(await linkTelegramByCode('ABCDEFGHJK-ZZZZZZ', 555)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('muddati o\'tgan kod: EXPIRED va kod bekor qilinadi', async () => {
    const { createTelegramLinkCode, linkTelegramByCode, TELEGRAM_LINK_CODE_TTL_MS } = await loadService();
    const { code } = createTelegramLinkCode(Date.now() - TELEGRAM_LINK_CODE_TTL_MS - 60_000);
    db.user.findUnique.mockResolvedValue({ id: 'u1', fullName: 'X', username: 'x', isActive: true });
    expect(await linkTelegramByCode(code, 555)).toEqual({ ok: false, reason: 'EXPIRED' });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { telegramLinkCode: null } });
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('yaroqsiz belgilar: bazaga murojaat qilinmaydi', async () => {
    const { linkTelegramByCode } = await loadService();
    expect(await linkTelegramByCode("x'; DROP TABLE", 555)).toEqual({ ok: false, reason: 'INVALID' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('bot nomi env\'dan olinadi; yo\'q yoki yaroqsiz bo\'lsa null', async () => {
    const { getTelegramBotUsername } = await loadService();
    expect(getTelegramBotUsername()).toBeNull();
    process.env.TELEGRAM_BOT_USERNAME = '@FinModelTestBot';
    expect(getTelegramBotUsername()).toBe('FinModelTestBot');
    process.env.TELEGRAM_BOT_USERNAME = 'bad name/../x';
    expect(getTelegramBotUsername()).toBeNull();
  });
});
