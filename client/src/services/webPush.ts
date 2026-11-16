// Web Push (VAPID) — brauzer va iPhone (iOS 16.4+, "Bosh ekranga qo'shilgan" ilova) uchun bildirishnomalar.
//
// - Native (Capacitor/Android) ilovada ishlamaydi: u yerda Firebase push (services/push.ts) bor.
// - Ruxsat so'rash va obuna FAQAT foydalanuvchi tugmani bosganda (enableWebPush) bajariladi — iOS shuni talab qiladi.
// - Login'dan keyin refreshWebPush() jim ishlaydi: ruxsat berilgan bo'lsa joriy obunani serverga qayta yuboradi
//   (brauzerdagi obuna oxirgi kirgan foydalanuvchiga o'tadi).
// - Hech bir funksiya xato tashlamaydi (enable/disable natijani qaytaradi).
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const SW_URL = '/sw.js';
const API = '/api/notifications/web-push';

export type WebPushSupport =
  | 'native' // Android/iOS qobiq ilovasi — boshqa kanal ishlaydi
  | 'unsupported' // brauzer Web Push'ni bilmaydi
  | 'ios_needs_install' // iPhone/iPad Safari, lekin Bosh ekranga qo'shilmagan
  | 'ok';

export type WebPushPermission = 'granted' | 'denied' | 'default';

export interface WebPushState {
  support: WebPushSupport;
  permission: WebPushPermission;
  /** Shu brauzerda faol obuna bormi */
  subscribed: boolean;
}

export type WebPushError = 'UNSUPPORTED' | 'NEEDS_INSTALL' | 'DENIED' | 'NOT_CONFIGURED' | 'FAILED';
export type WebPushResult = { ok: true } | { ok: false; error: WebPushError };

const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const isIos = (): boolean => {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ o'zini "Macintosh" deb tanishtiradi, lekin sensorli ekrani bor
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
};

const isStandalone = (): boolean => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  } catch {
    return false;
  }
};

const hasApis = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function getSupport(): WebPushSupport {
  if (isNative()) return 'native';
  if (!hasApis()) return isIos() && !isStandalone() ? 'ios_needs_install' : 'unsupported';
  return 'ok';
}

/** VAPID ochiq kalit (base64url) → PushManager kutadigan Uint8Array */
function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    // Bir xil manzil — main.tsx dagi ro'yxatdan o'tish bilan to'qnashmaydi
    await navigator.serviceWorker.register(SW_URL);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

async function sendSubscription(sub: PushSubscription): Promise<void> {
  await axios.post(`${API}/subscription`, sub.toJSON());
}

/** Sozlamalar oynasi uchun joriy holat. Hech qachon xato tashlamaydi. */
export async function getWebPushState(): Promise<WebPushState> {
  const support = getSupport();
  const state: WebPushState = { support, permission: 'default', subscribed: false };
  if (support !== 'ok') return state;
  try {
    state.permission = Notification.permission as WebPushPermission;
    state.subscribed = state.permission === 'granted' && !!(await currentSubscription());
  } catch {
    // e'tiborsiz
  }
  return state;
}

/** Tugma bosilganda: ruxsat so'rash → obuna → serverga yuborish */
export async function enableWebPush(): Promise<WebPushResult> {
  const support = getSupport();
  if (support === 'ios_needs_install') return { ok: false, error: 'NEEDS_INSTALL' };
  if (support !== 'ok') return { ok: false, error: 'UNSUPPORTED' };

  try {
    // Ruxsat so'rovi foydalanuvchi bosishidan keyin darhol — boshqa await'lardan oldin
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, error: 'DENIED' };

    let publicKey = '';
    try {
      publicKey = (await axios.get<{ publicKey: string }>(`${API}/public-key`)).data.publicKey;
    } catch (e: any) {
      if (e?.response?.status === 503) return { ok: false, error: 'NOT_CONFIGURED' };
      throw e;
    }

    const reg = await getRegistration();
    if (!reg) return { ok: false, error: 'FAILED' };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
    }
    await sendSubscription(sub);
    return { ok: true };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
}

/** Shu brauzerdagi obunani bekor qiladi va serverdan o'chiradi */
export async function disableWebPush(): Promise<WebPushResult> {
  if (getSupport() !== 'ok') return { ok: false, error: 'UNSUPPORTED' };
  try {
    const sub = await currentSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await axios.delete(`${API}/subscription`, { data: { endpoint } }).catch(() => undefined);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'FAILED' };
  }
}

/**
 * Login'dan keyin jim chaqiriladi: ruxsat allaqachon berilgan va obuna bor bo'lsa, uni serverga qayta yuboradi
 * (shu brauzerda boshqa foydalanuvchi kirgan bo'lsa, obuna hozirgi foydalanuvchiga o'tadi). Ruxsat so'ramaydi.
 */
export async function refreshWebPush(): Promise<void> {
  try {
    if (getSupport() !== 'ok' || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await sendSubscription(sub);
  } catch {
    // jim
  }
}

/**
 * Chiqishda: obunani serverdan o'chiradi (brauzerdagi obunaning o'zi qoladi — keyingi kirgan foydalanuvchiga
 * refreshWebPush biriktiradi). `authToken` — chiqayotgan foydalanuvchining JWT si.
 */
export function removeWebPushSubscription(authToken: string | null | undefined): void {
  try {
    if (!authToken || getSupport() !== 'ok' || Notification.permission !== 'granted') return;
    void currentSubscription().then((sub) => {
      if (!sub) return;
      axios
        .delete(`${API}/subscription`, { data: { endpoint: sub.endpoint }, headers: { Authorization: `Bearer ${authToken}` } })
        .catch(() => undefined);
    });
  } catch {
    // jim
  }
}
