import { Router, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import {
  createTelegramLinkCode,
  getNotificationStatus,
  getTelegramBotUsername,
  sendTestNotification,
} from '../services/notification.service';

/**
 * Bildirishnoma sozlamalari (hammasi avtorizatsiya bilan, har kim faqat O'Z hisobi uchun):
 *   POST   /api/notifications/device-token        {token, platform}  — qurilma (FCM) tokenini ro'yxatdan o'tkazish
 *   DELETE /api/notifications/device-token        {token}            — tokenni o'chirish (chiqishda)
 *   POST   /api/notifications/telegram/link-code                     — Telegram'ni bog'lash uchun bir martalik kod
 *   POST   /api/notifications/telegram/unlink                        — Telegram bog'lanishini uzish
 *   GET    /api/notifications/status                                 — joriy holat
 *   POST   /api/notifications/test                (faqat ADMIN)      — o'ziga sinov bildirishnomasi
 */
const router = Router();

const PLATFORMS = ['android', 'ios', 'web'];

function readDeviceToken(value: unknown): string | null {
  const token = typeof value === 'string' ? value.trim() : '';
  // FCM tokenlari odatda 140–250 belgi; bo'shliqsiz
  return token.length >= 20 && token.length <= 4096 && !/\s/.test(token) ? token : null;
}

// POST /device-token {token, platform}
router.post('/device-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const token = readDeviceToken(req.body?.token);
    if (!token) return res.status(400).json({ error: "Qurilma tokeni noto'g'ri yoki berilmagan" });

    const platform = String(req.body?.platform || 'android').toLowerCase();
    if (!PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: "platform noto'g'ri (android, ios yoki web bo'lishi kerak)" });
    }

    // Token noyob: qurilmaga boshqa foydalanuvchi kirgan bo'lsa, token yangi foydalanuvchiga o'tadi
    await prisma.deviceToken.upsert({
      where: { token },
      create: { userId: req.user!.id, token, platform },
      update: { userId: req.user!.id, platform },
    });
    const deviceTokens = await prisma.deviceToken.count({ where: { userId: req.user!.id } });
    return res.json({ success: true, deviceTokens });
  } catch (error: any) {
    console.error('Device token saqlashda xatolik:', error?.message || error);
    return res.status(500).json({ error: 'Qurilma tokenini saqlashda xatolik' });
  }
});

// DELETE /device-token {token}
router.delete('/device-token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const token = readDeviceToken(req.body?.token);
    if (!token) return res.status(400).json({ error: "Qurilma tokeni noto'g'ri yoki berilmagan" });

    // Faqat o'ziga tegishli token o'chiriladi
    const removed = await prisma.deviceToken.deleteMany({ where: { token, userId: req.user!.id } });
    const deviceTokens = await prisma.deviceToken.count({ where: { userId: req.user!.id } });
    return res.json({ success: true, removed: removed.count, deviceTokens });
  } catch (error: any) {
    console.error("Device token o'chirishda xatolik:", error?.message || error);
    return res.status(500).json({ error: "Qurilma tokenini o'chirishda xatolik" });
  }
});

// POST /telegram/link-code → {code, deepLink, botUsername, expiresAt}
router.post('/telegram/link-code', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { code, expiresAt } = createTelegramLinkCode();
    // Yangi kod eskisini bekor qiladi (bir foydalanuvchida bitta faol kod)
    await prisma.user.update({ where: { id: req.user!.id }, data: { telegramLinkCode: code } });

    const botUsername = getTelegramBotUsername();
    return res.json({
      code,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      botUsername,
      expiresAt,
    });
  } catch (error: any) {
    console.error('Telegram kod yaratishda xatolik:', error?.message || error);
    return res.status(500).json({ error: "Telegram'ni bog'lash kodini yaratishda xatolik" });
  }
});

// POST /telegram/unlink
router.post('/telegram/unlink', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { telegramId: null, telegramLinkCode: null } });
    return res.json({ success: true, telegramLinked: false });
  } catch (error: any) {
    console.error('Telegram bog\'lanishini uzishda xatolik:', error?.message || error);
    return res.status(500).json({ error: "Telegram bog'lanishini uzishda xatolik" });
  }
});

// GET /status → {telegramLinked, pushConfigured, telegramConfigured, deviceTokens}
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const [user, deviceTokens] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.user!.id }, select: { telegramId: true } }),
      prisma.deviceToken.count({ where: { userId: req.user!.id } }),
    ]);
    const { telegramConfigured, pushConfigured } = getNotificationStatus();
    return res.json({
      telegramLinked: user?.telegramId != null,
      pushConfigured,
      telegramConfigured,
      deviceTokens,
      botUsername: getTelegramBotUsername(),
    });
  } catch (error: any) {
    console.error('Bildirishnoma holatini olishda xatolik:', error?.message || error);
    return res.status(500).json({ error: 'Bildirishnoma holatini olishda xatolik' });
  }
});

// POST /test (faqat ADMIN) — o'ziga sinov bildirishnomasi
router.post('/test', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const result = await sendTestNotification(req.user!.id);
    const delivered = result.telegram.status === 'sent' || result.push.status === 'sent';
    return res.json({ success: delivered, ...result });
  } catch (error: any) {
    console.error('Sinov bildirishnomasida xatolik:', error?.message || error);
    return res.status(500).json({ error: 'Sinov bildirishnomasini yuborishda xatolik' });
  }
});

export default router;
