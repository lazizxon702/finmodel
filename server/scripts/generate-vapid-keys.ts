/**
 * Web Push (VAPID) kalitlarini yaratadi: server/vapid-keys.local.json (gitignore'da).
 * Fayl allaqachon bo'lsa tegmaydi. Kalit QIYMATLARI hech qayerga chiqarilmaydi — faqat fayl yo'li va o'zgaruvchi nomlari.
 *
 * Ishga tushirish (server/ papkasidan):  npx ts-node --transpile-only scripts/generate-vapid-keys.ts
 */
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

const file = path.resolve(__dirname, '../vapid-keys.local.json');

if (fs.existsSync(file)) {
  console.log(`Fayl allaqachon bor, o'zgartirilmadi: ${file}`);
} else {
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(
    file,
    JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'https://finmodel-erp-uz.vercel.app' }, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
  console.log(`VAPID kalitlari yaratildi: ${file}`);
}

console.log('Vercel (server loyihasi) ga quyidagi muhit o\'zgaruvchilarini qo\'shing (qiymatlari shu fayldan olinadi):');
console.log('  VAPID_PUBLIC_KEY   <- fayldagi publicKey');
console.log('  VAPID_PRIVATE_KEY  <- fayldagi privateKey');
console.log('  VAPID_SUBJECT      <- fayldagi subject (yoki mailto:sizning@pochtangiz)');
