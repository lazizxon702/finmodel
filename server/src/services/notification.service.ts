/**
 * Bildirishnomalar (Telegram + Android push / Firebase Cloud Messaging).
 *
 * Qoidasi: notifyDealDecision HECH QACHON xato tashlamaydi — bildirishnoma ketmasa ham bitim tasdiqlanaveradi.
 * Telegram tokeni yoki Firebase kaliti yo'q bo'lsa tegishli kanal jim o'tkazib yuboriladi, ilova buzilmaydi.
 * Maxfiy qiymatlar (bot tokeni, service account, qurilma tokenlari) hech qayerda loglanmaydi.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Api } from 'grammy';
import type { Messaging } from 'firebase-admin/messaging';
import { prisma } from '../lib/prisma';
import { formatTashkentDateTime } from './calculation.service';

export interface DealDecisionNotice {
  dealId: string;
  dealNumber: number;
  decision: 'APPROVED' | 'REJECTED';
  reason?: string | null;
  /** Bitimni kiritgan foydalanuvchi (operator/agent) */
  recipientUserId: string | null;
  customerName?: string | null;
  amount?: number;
  decidedByName?: string;
}

export interface ChannelOutcome {
  status: 'sent' | 'skipped' | 'failed';
  /** Nega o'tkazib yuborildi / xato kodi (maxfiy ma'lumotsiz) */
  reason?: string;
}
export interface PushOutcome extends ChannelOutcome {
  sent: number;
  failed: number;
  /** Yaroqsiz bo'lgani uchun bazadan o'chirilgan qurilma tokenlari soni */
  removed: number;
}
export interface NotifyResult {
  telegram: ChannelOutcome;
  push: PushOutcome;
}

interface OutgoingNotification {
  title: string;
  /** Oddiy matn (push uchun) */
  body: string;
  /** Telegram uchun HTML */
  html: string;
  /** FCM data — faqat satr qiymatlar */
  data: Record<string, string>;
}

// ───────────────────────────── Matn ─────────────────────────────

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatSum(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
}

/** Bitim qarori haqidagi o'zbekcha xabar (sof funksiya — testlanadi) */
export function buildDealDecisionText(notice: DealDecisionNotice, decidedAt: Date = new Date()): OutgoingNotification {
  const approved = notice.decision === 'APPROVED';
  const title = `Bitim №${notice.dealNumber} ${approved ? 'tasdiqlandi' : 'rad etildi'}`;

  const lines: Array<[string, string]> = [];
  const customer = (notice.customerName || '').trim();
  if (customer) lines.push(['Mijoz', customer]);
  if (typeof notice.amount === 'number' && Number.isFinite(notice.amount) && notice.amount > 0) {
    lines.push(['Summa', formatSum(notice.amount)]);
  }
  lines.push(['Qaror', approved ? 'Tasdiqlandi' : 'Rad etildi']);
  const reason = (notice.reason || '').trim();
  if (!approved) lines.push(['Rad etish sababi', reason || "ko'rsatilmagan"]);
  const decidedBy = (notice.decidedByName || '').trim();
  if (decidedBy) lines.push(['Qaror qildi', decidedBy]);
  lines.push(['Sana', `${formatTashkentDateTime(decidedAt)} (Toshkent vaqti)`]);

  const icon = approved ? '✅' : '❌';
  return {
    title,
    body: lines.map(([k, v]) => `${k}: ${v}`).join('\n'),
    html: `${icon} <b>${escapeHtml(title)}</b>\n\n` + lines.map(([k, v]) => `${k}: <b>${escapeHtml(v)}</b>`).join('\n'),
    data: {
      type: 'deal_decision',
      dealId: String(notice.dealId || ''),
      dealNumber: String(notice.dealNumber ?? ''),
      decision: notice.decision,
      reason,
    },
  };
}

// ───────────────────────────── Telegram ─────────────────────────────

const TELEGRAM_TOKEN_PLACEHOLDER = 'MISSING_TELEGRAM_BOT_TOKEN';

/** Bot tokeni faqat muhit o'zgaruvchisidan. Yo'q yoki "o'rinbosar" qiymat bo'lsa null. */
function getTelegramToken(): string | null {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  return token && token !== TELEGRAM_TOKEN_PLACEHOLDER ? token : null;
}

/** Bot foydalanuvchi nomi (deep link uchun): TELEGRAM_BOT_USERNAME, "@" siz. Yo'q/yaroqsiz bo'lsa null. */
export function getTelegramBotUsername(): string | null {
  const name = (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : null;
}

let telegramApi: { token: string; api: Api } | null = null;

function getTelegramApi(): Api | null {
  const token = getTelegramToken();
  if (!token) return null;
  if (!telegramApi || telegramApi.token !== token) {
    // Faqat xabar yuborish uchun yengil klient (getUpdates/webhook'ga tegmaydi)
    telegramApi = { token, api: new Api(token, { timeoutSeconds: 10 }) };
  }
  return telegramApi.api;
}

/** Xato matni — token aralashib qolmasligi uchun tozalanadi va qisqartiriladi */
function safeError(error: unknown): string {
  let message = String((error as any)?.description || (error as any)?.message || error || "noma'lum xato");
  const token = getTelegramToken();
  if (token) message = message.split(token).join('***');
  return message.replace(/\s+/g, ' ').slice(0, 200);
}

async function sendTelegram(chatId: bigint | null, html: string): Promise<ChannelOutcome> {
  if (chatId == null) return { status: 'skipped', reason: 'TELEGRAM_NOT_LINKED' };
  const api = getTelegramApi();
  if (!api) return { status: 'skipped', reason: 'TELEGRAM_NOT_CONFIGURED' };
  try {
    await api.sendMessage(chatId.toString(), html, { parse_mode: 'HTML' });
    return { status: 'sent' };
  } catch (error) {
    const reason = safeError(error);
    console.warn('Bildirishnoma: Telegram xabari yuborilmadi:', reason);
    return { status: 'failed', reason };
  }
}

// ───────────────────────────── Firebase (push) ─────────────────────────────

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const FIREBASE_APP_NAME = 'finmodel-notifications';
const PUSH_TIMEOUT_MS = 15_000;
/** FCM shu xatolarni qaytarsa token endi yaroqsiz — bazadan o'chiriladi */
const DEAD_TOKEN_CODES = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
/** Android bildirishnoma kanali (ilova shu ID bilan kanal yaratadi; yaratmagan bo'lsa FCM standart kanalni ishlatadi) */
export const PUSH_ANDROID_CHANNEL_ID = 'deal_decisions';

let serviceAccountCache: { value: ServiceAccount | null } | null = null;
let messagingCache: { value: Messaging | null } | null = null;
let pushWarned = false;

function warnPushOnce(message: string) {
  if (pushWarned) return;
  pushWarned = true;
  console.warn(`Push bildirishnomalar o'chirilgan: ${message} (docs/FIREBASE_SETUP.md ga qarang)`);
}

function parseServiceAccount(raw: string, source: string): ServiceAccount | null {
  try {
    let text = raw.trim();
    // Vercel'ga base64 ko'rinishida qo'yilgan bo'lishi ham mumkin
    if (!text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8').trim();
    const json = JSON.parse(text);
    if (!json || !json.project_id || !json.client_email || !json.private_key) {
      warnPushOnce(`${source} ichida project_id / client_email / private_key maydonlari yo'q`);
      return null;
    }
    return {
      project_id: String(json.project_id),
      client_email: String(json.client_email),
      // Env orqali berilganda qator ko'chirishlari "\n" matni bo'lib qolishi mumkin
      private_key: String(json.private_key).replace(/\\n/g, '\n'),
    };
  } catch {
    warnPushOnce(`${source} yaroqli JSON emas`);
    return null;
  }
}

/** Service account: env JSON → env'dagi fayl yo'li → server/firebase-service-account.json. Dangasa (lazy), bir marta. */
function loadServiceAccount(): ServiceAccount | null {
  if (serviceAccountCache) return serviceAccountCache.value;
  let value: ServiceAccount | null = null;

  const envJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const envPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();
  if (envJson) {
    value = parseServiceAccount(envJson, 'FIREBASE_SERVICE_ACCOUNT_JSON');
  } else {
    const candidates = envPath
      ? [path.resolve(envPath)]
      : [
          path.resolve(__dirname, '../../firebase-service-account.json'), // server/ (src yoki dist ichidan)
          path.resolve(process.cwd(), 'firebase-service-account.json'),
        ];
    const file = candidates.find((candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    });
    if (!file) {
      warnPushOnce(
        envPath
          ? "FIREBASE_SERVICE_ACCOUNT_PATH ko'rsatgan fayl topilmadi"
          : "Firebase service account topilmadi (FIREBASE_SERVICE_ACCOUNT_JSON yoki server/firebase-service-account.json)"
      );
    } else {
      try {
        value = parseServiceAccount(fs.readFileSync(file, 'utf8'), 'Firebase service account fayli');
      } catch {
        warnPushOnce("Firebase service account faylini o'qib bo'lmadi");
      }
    }
  }

  serviceAccountCache = { value };
  return value;
}

/** firebase-admin faqat birinchi push kerak bo'lganda yuklanadi (server ishga tushishini sekinlashtirmaydi) */
async function getPushMessaging(): Promise<Messaging | null> {
  if (messagingCache) return messagingCache.value;
  const account = loadServiceAccount();
  let value: Messaging | null = null;
  if (account) {
    try {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app');
      const { getMessaging } = await import('firebase-admin/messaging');
      const app =
        getApps().find((existing) => existing.name === FIREBASE_APP_NAME) ||
        initializeApp(
          {
            credential: cert({
              projectId: account.project_id,
              clientEmail: account.client_email,
              privateKey: account.private_key,
            }),
          },
          FIREBASE_APP_NAME
        );
      value = getMessaging(app);
    } catch (error) {
      warnPushOnce(`firebase-admin ishga tushmadi (${String((error as any)?.code || (error as any)?.message || error).slice(0, 120)})`);
    }
  }
  messagingCache = { value };
  return value;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: ${ms} ms ichida javob kelmadi`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendPush(userId: string, message: OutgoingNotification): Promise<PushOutcome> {
  const outcome: PushOutcome = { status: 'skipped', sent: 0, failed: 0, removed: 0 };
  const messaging = await getPushMessaging();
  if (!messaging) return { ...outcome, reason: 'PUSH_NOT_CONFIGURED' };

  try {
    const rows = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
    const tokens = rows.map((row) => row.token);
    if (!tokens.length) return { ...outcome, reason: 'NO_DEVICE_TOKENS' };

    const dead: string[] = [];
    let lastErrorCode = '';
    // FCM bitta so'rovda ko'pi bilan 500 ta token qabul qiladi
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const response = await withTimeout(
        messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: message.title, body: message.body },
          data: message.data,
          android: { priority: 'high', notification: { channelId: PUSH_ANDROID_CHANNEL_ID, sound: 'default' } },
        }),
        PUSH_TIMEOUT_MS,
        'FCM'
      );
      outcome.sent += response.successCount;
      outcome.failed += response.failureCount;
      response.responses.forEach((item, index) => {
        if (item.success) return;
        const code = String(item.error?.code || '');
        lastErrorCode = code || lastErrorCode;
        if (DEAD_TOKEN_CODES.has(code)) dead.push(batch[index]);
      });
    }

    if (dead.length) {
      const removed = await prisma.deviceToken.deleteMany({ where: { token: { in: dead } } });
      outcome.removed = removed.count;
    }

    outcome.status = outcome.sent > 0 ? 'sent' : 'failed';
    if (outcome.failed > 0) {
      outcome.reason = lastErrorCode || 'FCM_ERROR';
      console.warn(
        `Bildirishnoma: push ${outcome.sent} ta yuborildi, ${outcome.failed} ta xato (${outcome.reason}), ` +
          `${outcome.removed} ta yaroqsiz token o'chirildi`
      );
    }
    return outcome;
  } catch (error) {
    const reason = String((error as any)?.code || (error as any)?.message || error).slice(0, 200);
    console.warn('Bildirishnoma: push yuborilmadi:', reason);
    return { ...outcome, status: 'failed', reason };
  }
}

// ───────────────────────────── Yuborish ─────────────────────────────

/** Foydalanuvchiga ikkala kanal orqali yuboradi. Xato tashlamaydi — natijani qaytaradi. */
async function deliverToUser(userId: string, message: OutgoingNotification): Promise<NotifyResult> {
  const result: NotifyResult = {
    telegram: { status: 'skipped', reason: 'USER_NOT_FOUND' },
    push: { status: 'skipped', reason: 'USER_NOT_FOUND', sent: 0, failed: 0, removed: 0 },
  };
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramId: true, isActive: true } });
    if (!user) return result;
    if (!user.isActive) {
      result.telegram.reason = result.push.reason = 'USER_BLOCKED';
      return result;
    }
    const [telegram, push] = await Promise.all([sendTelegram(user.telegramId, message.html), sendPush(userId, message)]);
    return { telegram, push };
  } catch (error) {
    console.warn('Bildirishnoma yuborishda xatolik:', safeError(error));
    result.telegram = { status: 'failed', reason: 'INTERNAL_ERROR' };
    result.push = { ...result.push, status: 'failed', reason: 'INTERNAL_ERROR' };
    return result;
  }
}

/**
 * Operator/agent kiritgan bitim ADMIN tomonidan tasdiqlanganda yoki rad etilganda chaqiriladi.
 * HECH QACHON xato tashlamaydi.
 */
export async function notifyDealDecision(notice: DealDecisionNotice): Promise<void> {
  try {
    if (!notice || !notice.recipientUserId) return;
    await deliverToUser(notice.recipientUserId, buildDealDecisionText(notice));
  } catch (error) {
    console.warn('notifyDealDecision xatosi:', safeError(error));
  }
}

/** Sinov bildirishnomasi (POST /api/notifications/test) — foydalanuvchining o'ziga */
export async function sendTestNotification(userId: string): Promise<NotifyResult> {
  const when = `${formatTashkentDateTime(new Date())} (Toshkent vaqti)`;
  const title = 'FinModel: sinov bildirishnomasi';
  const body = `Bildirishnomalar ishlayapti.\nSana: ${when}`;
  return deliverToUser(userId, {
    title,
    body,
    html: `🔔 <b>${escapeHtml(title)}</b>\n\nBildirishnomalar ishlayapti.\nSana: <b>${escapeHtml(when)}</b>`,
    data: { type: 'test' },
  });
}

/** Kanallar sozlanganmi (kalit qiymatlari qaytarilmaydi) */
export function getNotificationStatus(): { telegramConfigured: boolean; pushConfigured: boolean } {
  return { telegramConfigured: !!getTelegramToken(), pushConfigured: !!loadServiceAccount() };
}

// ───────────────────────────── Telegram'ni bog'lash ─────────────────────────────

/** Bir martalik kod shuncha vaqt amal qiladi */
export const TELEGRAM_LINK_CODE_TTL_MS = 15 * 60 * 1000;
// 32 ta belgi (256 ga qoldiqsiz bo'linadi → tasodifiylik og'ishmaydi); o'xshash belgilarsiz
const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Bir martalik bog'lash kodi: 10 ta tasodifiy belgi + "-" + amal qilish muddati (unix soniya, 36-lik sanoq).
 * Telegram deep link (`?start=`) faqat A-Z a-z 0-9 _ - belgilarini qabul qiladi.
 */
export function createTelegramLinkCode(now: number = Date.now()): { code: string; expiresAt: Date } {
  let random = '';
  for (const byte of crypto.randomBytes(10)) random += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
  const expiresAt = new Date(Math.floor((now + TELEGRAM_LINK_CODE_TTL_MS) / 1000) * 1000);
  return { code: `${random}-${Math.floor(expiresAt.getTime() / 1000).toString(36).toUpperCase()}`, expiresAt };
}

/** Kod ichidagi amal qilish muddati. Formatga mos kelmasa null (muddatsiz deb hisoblanadi). */
export function telegramLinkCodeExpiry(code: string): Date | null {
  const match = /^[A-Z0-9]{10}-([A-Z0-9]{5,8})$/.exec(code);
  if (!match) return null;
  const seconds = parseInt(match[1], 36);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

export interface TelegramLinkResult {
  ok: boolean;
  /** ok = false bo'lganda sabab */
  reason?: 'INVALID' | 'NOT_FOUND' | 'EXPIRED' | 'BLOCKED';
  /** ok = true bo'lganda bog'langan foydalanuvchi */
  fullName?: string;
  username?: string;
}

/**
 * Bot `/start <kod>` olganda chaqiradi: kodga mos foydalanuvchiga Telegram chat ID yoziladi, kod o'chiriladi.
 * Shu Telegram hisobi avval boshqa foydalanuvchiga bog'langan bo'lsa, eski bog'lanish uziladi.
 */
export async function linkTelegramByCode(rawCode: string, chatId: number | bigint): Promise<TelegramLinkResult> {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{6,64}$/.test(code)) return { ok: false, reason: 'INVALID' };

  const user = await prisma.user.findUnique({
    where: { telegramLinkCode: code },
    select: { id: true, fullName: true, username: true, isActive: true },
  });
  if (!user) return { ok: false, reason: 'NOT_FOUND' };

  const expiresAt = telegramLinkCodeExpiry(code);
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await prisma.user.update({ where: { id: user.id }, data: { telegramLinkCode: null } });
    return { ok: false, reason: 'EXPIRED' };
  }
  if (!user.isActive) return { ok: false, reason: 'BLOCKED' };

  const telegramId = BigInt(chatId);
  await prisma.$transaction([
    prisma.user.updateMany({ where: { telegramId, NOT: { id: user.id } }, data: { telegramId: null } }),
    prisma.user.update({ where: { id: user.id }, data: { telegramId, telegramLinkCode: null } }),
  ]);
  return { ok: true, fullName: user.fullName, username: user.username };
}
