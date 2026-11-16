import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import {
  syncDealsFromGoogleSheets,
  syncDdsFromGoogleSheets,
  parseDayArg,
  DEFAULT_SHEETS_URL,
  SyncDealsOptions,
} from '../services/sheetsSync.service';
import { prisma } from '../lib/prisma';
import { emitRealtime } from '../lib/realtime';

const router = Router();

/**
 * 16.11.2026: Google jadvalga ustun qo'shilgani uchun bitimlar sinxronlashi 199 bitimni surilgan ustunlardan ustiga yozdi.
 * Ustunlar sarlavha bo'yicha o'qiladigan qilinmaguncha Sheets -> sayt BITIM sinxronlashi O'CHIRILGAN (DDS sinxronlashi ishlaydi; dry-run mumkin).
 */
const DEALS_SYNC_DISABLED = true;
const DEALS_SYNC_DISABLED_RESULT = { success: false, skipped: true, message: "Bitimlarni Google Sheets'dan sinxronlash vaqtincha o'chirilgan (16.11.2026)" };

/**
 * Webhook kaliti FAQAT muhit o'zgaruvchisidan olinadi — kodda standart qiymat yo'q.
 * SYNC_WEBHOOK_SECRET o'rnatilmagan bo'lsa webhook o'chirilgan hisoblanadi (503).
 */
export function getSyncWebhookSecret(): string | null {
  const secret = (process.env.SYNC_WEBHOOK_SECRET || '').trim();
  return secret || null;
}

/** Kalitlarni vaqt bo'yicha farq qilmaydigan usulda solishtirish */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Sinxronlashdan keyin ochiq sahifalar yangilanishi uchun real vaqt hodisalari */
function emitSyncEvents(opts: { deals?: boolean; dds?: boolean }) {
  if (opts.deals) {
    emitRealtime('deals:updated', { source: 'sheets-sync' });
    emitRealtime('trust:updated', { source: 'sheets-sync' });
  }
  if (opts.dds) emitRealtime('dds:updated', { source: 'sheets-sync' });
}

// 1. POST /api/sync/webhook - Public webhook called by Google Sheets onEdit or trigger
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const secret = getSyncWebhookSecret();
    if (!secret) {
      return res.status(503).json({ error: "Webhook o'chirilgan: serverda SYNC_WEBHOOK_SECRET sozlanmagan" });
    }
    const rawToken = req.query.token ?? req.body?.token;
    const token = typeof rawToken === 'string' ? rawToken : '';
    if (!token || !safeEqual(token, secret)) {
      return res.status(403).json({ error: 'Noto\'g\'ri webhook token' });
    }

    console.log('[Webhook] Google Sheets o\'zgarish xabarnomasi qabul qilindi. Sinxronlanmoqda...');
    const result = DEALS_SYNC_DISABLED ? DEALS_SYNC_DISABLED_RESULT : await syncDealsFromGoogleSheets();
    const ddsResult = await syncDdsFromGoogleSheets().catch((e) => ({ error: e.message }));
    emitSyncEvents({ deals: !DEALS_SYNC_DISABLED, dds: !('error' in ddsResult) });
    return res.json({
      success: true,
      message: 'Google Sheets-dan muvaffaqiyatli sinxronlandi',
      result,
      ddsResult,
    });
  } catch (error: any) {
    console.error('Webhook sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /api/sync/cron - Periodic cron job (Vercel Cron)
router.get('/cron', async (req: Request, res: Response) => {
  try {
    // Vercel Cron CRON_SECRET o'rnatilgan bo'lsa "Authorization: Bearer <CRON_SECRET>" yuboradi
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Ruxsat yo\'q' });
    }
    console.log('[Cron] Davriy sinxronizatsiya boshlandi...');
    const result = DEALS_SYNC_DISABLED ? DEALS_SYNC_DISABLED_RESULT : await syncDealsFromGoogleSheets();
    const ddsResult = await syncDdsFromGoogleSheets().catch((e) => ({ error: e.message }));
    emitSyncEvents({ deals: !DEALS_SYNC_DISABLED, dds: !('error' in ddsResult) });
    return res.json({ success: true, result, ddsResult });
  } catch (error: any) {
    console.error('Cron sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /api/sync/google-sheets - Qo'lda sinxronlash (faqat ADMIN / MANAGER)
//    Tana (hammasi ixtiyoriy): { url, onlyDate: "YYYY-MM-DD" | "DD.MM.YYYY", onlyMissing: boolean, dryRun: boolean }
//    Parametrsiz chaqirilsa avvalgidek: barcha bitimlar + DDS to'liq sinxronlanadi.
router.post(
  '/google-sheets',
  authenticateToken,
  requireRoles([Role.ADMIN, Role.MANAGER]),
  async (req: AuthRequest, res: Response) => {
    try {
      const { url, onlyDate, onlyMissing, dryRun } = req.body || {};

      const options: SyncDealsOptions = {};
      if (onlyDate !== undefined && onlyDate !== null && String(onlyDate).trim() !== '') {
        const day = parseDayArg(String(onlyDate));
        if (!day) {
          return res.status(400).json({ success: false, error: 'onlyDate noto\'g\'ri (kutilgan format: YYYY-MM-DD yoki DD.MM.YYYY)' });
        }
        options.onlyDate = day;
      }
      if (onlyMissing === true || onlyMissing === 'true') options.onlyMissing = true;
      if (dryRun === true || dryRun === 'true') options.dryRun = true;
      const partial = Boolean(options.onlyDate || options.onlyMissing || options.dryRun);

      const dealsResult: any =
        DEALS_SYNC_DISABLED && !options.dryRun ? DEALS_SYNC_DISABLED_RESULT : await syncDealsFromGoogleSheets(url, undefined, options);

      // DDS faqat to'liq (parametrsiz) sinxronlashda yuklanadi — tanlab import / dry-run DDS'ga tegmaydi
      let ddsResult = null;
      if (!partial) {
        try {
          ddsResult = await syncDdsFromGoogleSheets(url);
        } catch (ddsErr: any) {
          console.error('DDS auto-sync warning:', ddsErr.message);
        }
      }
      if (!options.dryRun) emitSyncEvents({ deals: true, dds: Boolean(ddsResult) });

      return res.json({
        ...dealsResult,
        dds: ddsResult,
      });
    } catch (error: any) {
      console.error('Google Sheets sync error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Google Sheets sinxronizatsiyasida xatolik',
      });
    }
  }
);

// 3b. POST /api/sync/dds - DDS ni Google Sheets'dan qo'lda yuklash (faqat ADMIN / MANAGER)
router.post('/dds', authenticateToken, requireRoles([Role.ADMIN, Role.MANAGER]), async (req: AuthRequest, res: Response) => {
  try {
    const { url, dryRun } = req.body || {};
    const isDryRun = dryRun === true || dryRun === 'true';
    const result = await syncDdsFromGoogleSheets(url, { dryRun: isDryRun });
    if (!isDryRun) emitSyncEvents({ dds: true });
    return res.json(result);
  } catch (error: any) {
    console.error('Google Sheets DDS sync error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Google Sheets DDS sinxronizatsiyasida xatolik',
    });
  }
});

// 4. GET /api/sync/status - Current status & URLs
router.get('/status', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const [urlSetting, lastSyncSetting, scriptSetting] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: 'google_sheets_url' } }),
      prisma.appSetting.findUnique({ where: { key: 'google_sheets_last_sync' } }),
      prisma.appSetting.findUnique({ where: { key: 'google_apps_script_url' } }),
    ]);

    const dealsCount = await prisma.deal.count();
    const webhookSecret = getSyncWebhookSecret();

    return res.json({
      sheetsUrl: urlSetting?.value || DEFAULT_SHEETS_URL,
      appsScriptUrl: scriptSetting?.value || '',
      lastSync: lastSyncSetting?.value || null,
      dealsCount,
      // SYNC_WEBHOOK_SECRET sozlanmagan bo'lsa webhook ishlamaydi — havola ham berilmaydi
      webhookConfigured: Boolean(webhookSecret),
      webhookUrl: webhookSecret
        ? (process.env.PUBLIC_SERVER_URL || 'https://server-ecru-three-97.vercel.app') +
          '/api/sync/webhook?token=' +
          encodeURIComponent(webhookSecret)
        : null,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/sync/configure - Save Apps Script Web App URL
router.post('/configure', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { appsScriptUrl, sheetsUrl } = req.body;

    if (sheetsUrl) {
      await prisma.appSetting.upsert({
        where: { key: 'google_sheets_url' },
        update: { value: sheetsUrl },
        create: { key: 'google_sheets_url', value: sheetsUrl, description: 'Ulangan Google Sheets havolasi' },
      });
    }

    if (appsScriptUrl !== undefined) {
      await prisma.appSetting.upsert({
        where: { key: 'google_apps_script_url' },
        update: { value: appsScriptUrl.trim() },
        create: {
          key: 'google_apps_script_url',
          value: appsScriptUrl.trim(),
          description: 'Google Apps Script Web App URL (Saytdan Sheetsga yozish uchun)',
        },
      });
    }

    return res.json({ success: true, message: 'Sozlamalar saqlandi' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
