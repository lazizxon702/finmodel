import { describe, it, expect, vi } from 'vitest';

// Faqat sof funksiyalar — baza va tarmoq kerak emas
vi.mock('../src/lib/prisma', () => ({ prisma: {} }));
vi.mock('grammy', () => ({ Api: class {} }));

import {
  buildDealDecisionText,
  buildWebPushPayload,
  isDeadWebPushStatus,
  readWebPushSubscription,
} from '../src/services/notification.service';

describe('Web Push: yuk (payload)', () => {
  it('sarlavha, matn, url va tag bilan JSON qaytaradi', () => {
    const message = buildDealDecisionText({
      dealId: 'abc',
      dealNumber: 3501,
      decision: 'REJECTED',
      reason: 'Hujjat yetarli emas',
      recipientUserId: 'u1',
      customerName: 'Ali Valiyev',
    });
    const payload = JSON.parse(buildWebPushPayload(message));
    expect(payload.title).toBe("Bitim №3501 rad etildi");
    expect(payload.body).toContain('Hujjat yetarli emas');
    expect(payload.url).toBe('/deals');
    expect(payload.tag).toBe('deal_decision-abc');
  });

  it("dealId bo'lmasa tag turga teng bo'ladi va url almashtiriladi", () => {
    const payload = JSON.parse(
      buildWebPushPayload({ title: 'T', body: 'B', html: 'H', data: { type: 'test' } }, '/')
    );
    expect(payload).toEqual({ title: 'T', body: 'B', url: '/', tag: 'test' });
  });

  it('yuk 4 KB dan oshmaydi (oddiy bitim uchun)', () => {
    const message = buildDealDecisionText({ dealId: 'x', dealNumber: 1, decision: 'APPROVED', recipientUserId: 'u', customerName: 'A'.repeat(100) });
    expect(Buffer.byteLength(buildWebPushPayload(message))).toBeLessThan(4000);
  });
});

describe('Web Push: yaroqsiz obuna', () => {
  it('404 va 410 — yaroqsiz, qolganlari yaroqli', () => {
    expect(isDeadWebPushStatus(404)).toBe(true);
    expect(isDeadWebPushStatus(410)).toBe(true);
    expect(isDeadWebPushStatus(429)).toBe(false);
    expect(isDeadWebPushStatus(500)).toBe(false);
    expect(isDeadWebPushStatus(undefined)).toBe(false);
    expect(isDeadWebPushStatus('410')).toBe(false);
  });
});

describe('Web Push: obuna tekshiruvi', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPkey', auth: 'authkey' } };

  it("to'g'ri obunani qabul qiladi", () => {
    expect(readWebPushSubscription(ok)).toEqual({ endpoint: ok.endpoint, p256dh: 'BPkey', auth: 'authkey' });
  });

  it("http, bo'sh yoki kalitsiz obunani rad etadi", () => {
    expect(readWebPushSubscription({ ...ok, endpoint: 'http://x.example/abc' })).toBeNull();
    expect(readWebPushSubscription({ ...ok, keys: { p256dh: 'a' } })).toBeNull();
    expect(readWebPushSubscription({})).toBeNull();
    expect(readWebPushSubscription(null)).toBeNull();
  });
});
