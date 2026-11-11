import { Router, Request, Response } from 'express';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { syncDealsFromGoogleSheets, syncDdsFromGoogleSheets, DEFAULT_SHEETS_URL } from '../services/sheetsSync.service';
import { prisma } from '../lib/prisma';

const router = Router();
// Webhook kaliti endi muhit o'zgaruvchisidan olinadi (eski qiymat moslik uchun qoldirildi)
export const SYNC_WEBHOOK_SECRET = process.env.SYNC_WEBHOOK_SECRET || 'finmodel_secret_sync_2026';

// 1. POST /api/sync/webhook - Public webhook called by Google Sheets onEdit or trigger
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const token = req.query.token || req.body?.token;
    if (token !== SYNC_WEBHOOK_SECRET) {
      return res.status(403).json({ error: 'Noto\'g\'ri webhook token' });
    }

    console.log('[Webhook] Google Sheets o\'zgarish xabarnomasi qabul qilindi. Sinxronlanmoqda...');
    const result = await syncDealsFromGoogleSheets();
    const ddsResult = await syncDdsFromGoogleSheets().catch((e) => ({ error: e.message }));
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
    const result = await syncDealsFromGoogleSheets();
    const ddsResult = await syncDdsFromGoogleSheets().catch((e) => ({ error: e.message }));
    return res.json({ success: true, result, ddsResult });
  } catch (error: any) {
    console.error('Cron sync error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 3. POST /api/sync/google-sheets - Manual sync button from UI (Syncs both Deals and DDS)
router.post('/google-sheets', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    const dealsResult = await syncDealsFromGoogleSheets(url);
    let ddsResult = null;
    try {
      ddsResult = await syncDdsFromGoogleSheets(url);
    } catch (ddsErr: any) {
      console.error('DDS auto-sync warning:', ddsErr.message);
    }
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
});

// 3b. POST /api/sync/dds - Dedicated DDS sync from Google Sheets
router.post('/dds', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body;
    const result = await syncDdsFromGoogleSheets(url);
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

    return res.json({
      sheetsUrl: urlSetting?.value || DEFAULT_SHEETS_URL,
      appsScriptUrl: scriptSetting?.value || '',
      lastSync: lastSyncSetting?.value || null,
      dealsCount,
      webhookUrl: (process.env.PUBLIC_SERVER_URL || 'https://server-ecru-three-97.vercel.app') + '/api/sync/webhook?token=' + SYNC_WEBHOOK_SECRET,
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
