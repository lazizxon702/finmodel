/**
 * Lokal sinov uchun qisqa muddatli (2 soat) JWT: parolsiz kirish, FAQAT localhost bazada.
 *   npx ts-node --transpile-only scripts/dev-token.ts <username>
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { getJwtSecret } from '../src/lib/security';

if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
  console.error('RAD ETILDI: faqat lokal bazada.');
  process.exit(1);
}
(async () => {
  const u = await prisma.user.findUnique({ where: { username: process.argv[2] || 'admin' } });
  if (!u) throw new Error('foydalanuvchi topilmadi');
  process.stdout.write(jwt.sign({ id: u.id, username: u.username, role: u.role, fullName: u.fullName }, getJwtSecret(), { expiresIn: '2h' }));
})()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
