// Android push bildirishnomalari (Firebase Cloud Messaging, @capacitor/push-notifications).
//
// - FAQAT native platformada ishlaydi. Veb/brauzerda barcha funksiyalar jim qaytadi (plagin import ham qilinmaydi).
// - Plagin dinamik import qilinadi va har bir chaqiruv try/catch ichida — push ishlamasa ham ilova buzilmaydi.
// - MUHIM: APK ichida google-services.json bo'lmasa plaginning native `register()` chaqiruvi ilovani
//   yiqitadi (JS try/catch uni ushlay olmaydi). Shuning uchun `register()` oldidan uch himoya bor:
//     1) plagin shu APK'da mavjud bo'lishi kerak (eski APK'larda yo'q);
//     2) server push sozlanganini aytishi kerak (GET /api/notifications/status → pushConfigured);
//     3) "yiqilish belgisi": chaqiruv oldidan IndexedDB ga `pending` yoziladi, muvaffaqiyatdan keyin `ok`.
//        Keyingi ishga tushishda `pending` qolgan bo'lsa — avvalgi urinish ilovani yiqitgan, demak
//        avtomatik ro'yxatdan o'tish o'chiriladi (foydalanuvchi sozlamalardan qo'lda qayta yoqishi mumkin).
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

/** Server yuboradigan Android kanal ID si (docs/FIREBASE_SETUP.md) */
export const PUSH_CHANNEL_ID = 'deal_decisions';

const PLUGIN_NAME = 'PushNotifications';
const DEVICE_TOKEN_KEY = 'finmodel_push_token';
const TOKEN_ENDPOINT = '/api/notifications/device-token';

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface PushState {
  /** Ilova native (Android/iOS) qobiqda ishlayaptimi */
  native: boolean;
  /** Push plagini shu APK ichida bormi */
  pluginAvailable: boolean;
  permission: PushPermission;
  /** Qurilma tokeni serverga yuborilganmi */
  registered: boolean;
  /** Avvalgi ro'yxatdan o'tish urinishi ilovani yiqitgan (odatda APK'da google-services.json yo'q) */
  crashGuard: boolean;
  /** Oxirgi xato matni (bo'lsa) */
  lastError: string | null;
}

export interface PushLabels {
  channelName: string;
  channelDescription: string;
}

type PushPlugin = (typeof import('@capacitor/push-notifications'))['PushNotifications'];

let pluginPromise: Promise<PushPlugin | null> | null = null;
let listenersReady = false;
let registering = false;
let lastError: string | null = null;
let navigateHandler: ((path: string) => void) | null = null;
let pendingPath: string | null = null;

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const pluginAvailable = (): boolean => {
  try {
    return isNative() && Capacitor.isPluginAvailable(PLUGIN_NAME);
  } catch {
    return false;
  }
};

/** Plaginni faqat native platformada va faqat kerak bo'lganda yuklaydi */
function loadPlugin(): Promise<PushPlugin | null> {
  if (!pluginAvailable()) return Promise.resolve(null);
  if (!pluginPromise) {
    pluginPromise = import('@capacitor/push-notifications')
      .then((mod) => mod.PushNotifications)
      .catch(() => null);
  }
  return pluginPromise;
}

// --- Kichik IndexedDB ombori: yozuv tranzaksiya tugashi bilan diskka tushadi, shuning uchun
// --- ilova yiqilsa ham saqlanib qoladi (localStorage bir necha soniya kechikib yoziladi).
const GUARD_DB = 'finmodel_push';
const GUARD_STORE = 'kv';
const GUARD_KEY = 'registerState';
type GuardState = 'pending' | 'ok' | 'crashed';

function guardDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(GUARD_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(GUARD_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function guardGet(): Promise<GuardState | null> {
  const db = await guardDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(GUARD_STORE, 'readonly').objectStore(GUARD_STORE).get(GUARD_KEY);
      req.onsuccess = () => resolve((req.result as GuardState) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function guardSet(state: GuardState | null): Promise<void> {
  const db = await guardDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(GUARD_STORE, 'readwrite');
      if (state === null) tx.objectStore(GUARD_STORE).delete(GUARD_KEY);
      else tx.objectStore(GUARD_STORE).put(state, GUARD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function savedDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function rememberDeviceToken(token: string | null) {
  try {
    if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token);
    else localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // e'tiborsiz
  }
}

const errorText = (e: unknown): string => {
  const anyErr = e as any;
  return String(anyErr?.response?.data?.error || anyErr?.message || anyErr?.error || e || '');
};

function openPath(path: string) {
  if (navigateHandler) navigateHandler(path);
  else pendingPath = path;
}

/**
 * Bildirishnoma bosilganda sahifaga o'tish uchun ishlovchi (App.tsx o'rnatadi).
 * Ishlovchi o'rnatilguncha kelgan bosish yo'qolmaydi — o'rnatilishi bilan bajariladi.
 */
export function onPushNavigate(handler: ((path: string) => void) | null): void {
  navigateHandler = handler;
  if (handler && pendingPath) {
    const path = pendingPath;
    pendingPath = null;
    handler(path);
  }
}

async function attachListeners(plugin: PushPlugin) {
  if (listenersReady) return;
  listenersReady = true;

  // Token keldi (yoki yangilandi) → serverga yuboramiz
  await plugin.addListener('registration', (token) => {
    const value = token?.value;
    if (!value) return;
    axios
      .post(TOKEN_ENDPOINT, { token: value, platform: Capacitor.getPlatform() })
      .then(() => {
        rememberDeviceToken(value);
        lastError = null;
      })
      .catch((e) => {
        lastError = errorText(e);
      });
  });

  await plugin.addListener('registrationError', (err) => {
    lastError = errorText(err);
  });

  // Bildirishnoma bosildi → bitimlar sahifasi (hozircha yagona tur: deal_decision)
  await plugin.addListener('pushNotificationActionPerformed', () => {
    openPath('/deals');
  });
}

async function ensureChannel(plugin: PushPlugin, labels?: PushLabels) {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await plugin.createChannel({
      id: PUSH_CHANNEL_ID,
      name: labels?.channelName || 'Deal decisions',
      description: labels?.channelDescription || '',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Kanal yaratilmasa FCM standart kanalni ishlatadi
  }
}

/**
 * Login'dan keyin chaqiriladi: ruxsat so'rash → kanal → register → token serverga.
 * Hech qachon xato tashlamaydi. `force` — yiqilish belgisini e'tiborsiz qoldirib qayta urinish
 * (faqat foydalanuvchi sozlamalarda o'zi bosganda).
 */
export async function initPush(labels?: PushLabels, options: { force?: boolean } = {}): Promise<void> {
  if (registering) return;
  registering = true;
  try {
    const plugin = await loadPlugin();
    if (!plugin) return;

    await attachListeners(plugin);
    await ensureChannel(plugin, labels);

    // 2-himoya: server push yuborishga sozlanmagan bo'lsa ro'yxatdan o'tishning ma'nosi yo'q
    const status = await axios.get('/api/notifications/status');
    if (!status.data?.pushConfigured) return;

    // 3-himoya: avvalgi urinish ilovani yiqitganmi
    const guard = await guardGet();
    if (guard === 'pending') await guardSet('crashed');
    if ((guard === 'pending' || guard === 'crashed') && !options.force) return;

    let permission = (await plugin.checkPermissions()).receive;
    if (permission === 'prompt' || permission === 'prompt-with-rationale') {
      permission = (await plugin.requestPermissions()).receive;
    }
    if (permission !== 'granted') return;

    await guardSet('pending');
    await plugin.register();
    await guardSet('ok');
    lastError = null;
  } catch (e) {
    lastError = errorText(e);
  } finally {
    registering = false;
  }
}

/**
 * Chiqishda: shu qurilma tokenini serverdan o'chiradi. `authToken` — chiqayotgan foydalanuvchining
 * JWT si (chaqirilgan paytda axios sarlavhasi allaqachon tozalangan bo'lishi mumkin).
 * Native `unregister()` ataylab chaqirilmaydi — token keyingi foydalanuvchiga qayta biriktiriladi.
 */
export function removePushToken(authToken: string | null | undefined): void {
  try {
    if (!isNative()) return;
    const deviceToken = savedDeviceToken();
    if (!deviceToken || !authToken) return;
    // Avval eslab qolingan tokenni tozalaymiz — takroriy chaqiruv (401 → logout) qayta so'rov yubormasin
    rememberDeviceToken(null);
    axios
      .delete(TOKEN_ENDPOINT, { data: { token: deviceToken }, headers: { Authorization: `Bearer ${authToken}` } })
      .catch(() => undefined);
  } catch {
    // e'tiborsiz
  }
}

/** Sozlamalar oynasi uchun joriy holat. Hech qachon xato tashlamaydi. */
export async function getPushState(): Promise<PushState> {
  const state: PushState = {
    native: isNative(),
    pluginAvailable: pluginAvailable(),
    permission: 'unknown',
    registered: false,
    crashGuard: false,
    lastError,
  };
  if (!state.pluginAvailable) return state;
  try {
    state.registered = !!savedDeviceToken();
    const guard = await guardGet().catch(() => null);
    state.crashGuard = guard === 'pending' || guard === 'crashed';
    const plugin = await loadPlugin();
    if (plugin) {
      const receive = (await plugin.checkPermissions()).receive;
      state.permission = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
    }
  } catch (e) {
    state.lastError = errorText(e);
  }
  return state;
}
