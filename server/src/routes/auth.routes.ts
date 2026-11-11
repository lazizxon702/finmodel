import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthRequest, authenticateToken, requireRoles } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getJwtSecret, verifyAdminOverride } from '../lib/security';

const router = Router();

// Login
router.post('/login', async (req, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Foydalanuvchi nomi va parol kiritilishi shart' });
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim() },
    });

    // Bir xil xabar: login mavjudligini tashqaridan aniqlab bo'lmasin
    if (!user || !user.isActive || !(await bcrypt.compare(String(password), user.passwordHash))) {
      return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri (yoki foydalanuvchi bloklangan)' });
    }

    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
      secret,
      { expiresIn: '30d' }
    );

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        entity: 'User',
        entityId: user.id,
        action: 'LOGIN',
        ipAddress: req.ip || '',
      },
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        telegramId: user.telegramId?.toString(),
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// Current User Profile
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        telegramId: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    return res.json({
      ...user,
      telegramId: user.telegramId?.toString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// Verify administrator override code (debt block, bulk delete, etc.)
router.post('/verify-override', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const ok = await verifyAdminOverride(req.body?.code);
    if (!ok) return res.status(403).json({ valid: false, error: 'Administrator kodi noto\'g\'ri' });
    return res.json({ valid: true });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// List Users (Admin only)
router.get('/users', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        initialPassword: true,
        telegramId: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.json(users.map(u => ({ ...u, telegramId: u.telegramId?.toString() })));
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi' });
  }
});

// Create User (Admin only)
router.post('/users', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { username, fullName, password, role, telegramId } = req.body;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Barcha maydonlar to\'ldirilishi shart' });
    }

    const existing = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'Bunday loginli foydalanuvchi allaqachon mavjud' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username: username.trim(),
        fullName: fullName.trim(),
        passwordHash,
        initialPassword: password.trim(),
        role: role || Role.OPERATOR,
        telegramId: telegramId ? BigInt(telegramId) : null,
      },
    });

    return res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      role: newUser.role,
      initialPassword: newUser.initialPassword,
      telegramId: newUser.telegramId?.toString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi: ' + error.message });
  }
});

// Update User (Admin only)
router.put('/users/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { fullName, role, isActive, telegramId, password } = req.body;

    const dataToUpdate: any = {};
    if (fullName) dataToUpdate.fullName = fullName.trim();
    if (role) dataToUpdate.role = role;
    if (isActive !== undefined) dataToUpdate.isActive = isActive;
    if (telegramId !== undefined) dataToUpdate.telegramId = telegramId ? BigInt(telegramId) : null;
    if (password && password.trim()) {
      dataToUpdate.passwordHash = await bcrypt.hash(password.trim(), 10);
      dataToUpdate.initialPassword = password.trim();
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate,
    });

    return res.json({
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      role: updated.role,
      initialPassword: updated.initialPassword,
      telegramId: updated.telegramId?.toString(),
      isActive: updated.isActive,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server xatoligi: ' + error.message });
  }
});

// Delete User (Admin only)
router.delete('/users/:id', authenticateToken, requireRoles([Role.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'O\'zingizning profilingizni o\'chira olmaysiz!' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ success: true, message: 'Foydalanuvchi muvaffaqiyatli o\'chirildi' });
  } catch (error: any) {
    return res.status(500).json({ error: 'O\'chirishda xatolik: ' + error.message });
  }
});

export default router;
