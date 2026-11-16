# Bildirishnomalarni sozlash: Android push (Firebase) va Telegram

Operator yoki agent kiritgan bitim ADMIN tomonidan **tasdiqlanganda yoki rad etilganda** unga ikki kanal orqali xabar boradi:

- **Android push** — Firebase Cloud Messaging (FCM);
- **Telegram** — bot shaxsiy chatga yozadi.

Ikkalasi ham ixtiyoriy: sozlanmagan kanal jim o'tkazib yuboriladi, bitimni tasdiqlash baribir ishlaydi.

> Maxfiy fayl va kalitlarni (`google-services.json`, service account JSON, bot tokeni) **git'ga qo'shmang**.
> `.gitignore` da `google-services.json`, `*service-account*.json`, `firebase-adminsdk*.json` va `.env*` allaqachon bor.

## 1. Firebase loyihasi

1. <https://console.firebase.google.com> → loyiha yarating (yoki mavjudini oching).
2. **Project settings → General → Your apps → Add app → Android**. Package name ilovadagi `applicationId` bilan bir xil bo'lishi shart (`client/android/app/build.gradle`).
3. **`google-services.json`** ni yuklab oling va shu yerga qo'ying:

   ```
   client/android/app/google-services.json
   ```

4. **Project settings → Service accounts → Generate new private key** — service account JSON fayli yuklanadi. U faqat serverda ishlatiladi.

## 2. Service account'ni serverga berish

Server kalitni quyidagi tartibda qidiradi (birinchi topilgani ishlatiladi):

| Tartib | Manba | Qayerda qulay |
|---|---|---|
| 1 | `FIREBASE_SERVICE_ACCOUNT_JSON` — JSON faylning butun mazmuni bitta satr qilib (base64 ko'rinishi ham qabul qilinadi) | Vercel / production |
| 2 | `FIREBASE_SERVICE_ACCOUNT_PATH` — faylga yo'l | fayl boshqa joyda tursa |
| 3 | `server/firebase-service-account.json` — standart fayl | lokal ishlab chiqish |

**Lokal:** yuklab olingan faylni `server/firebase-service-account.json` deb nomlab qo'ying va serverni qayta ishga tushiring.

**Vercel:** *Project → Settings → Environment Variables* → `FIREBASE_SERVICE_ACCOUNT_JSON` nomi bilan fayl mazmunini to'liq joylang, so'ng qayta deploy qiling. (Vercel'da fayl deploy'ga kirmaydi, shuning uchun aynan env ishlatiladi.)

Kalit topilmasa yoki yaroqsiz bo'lsa server logida bir marta `Push bildirishnomalar o'chirilgan: ...` degan ogohlantirish chiqadi — boshqa hech narsa buzilmaydi.

## 3. Muhit o'zgaruvchilari (server)

| Nomi | Vazifasi |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service account JSON (satr) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Service account fayliga yo'l (JSON env bo'lmasa) |
| `TELEGRAM_BOT_TOKEN` | Bot tokeni (BotFather). Bo'lmasa bot va Telegram xabarlari o'chiq |
| `TELEGRAM_BOT_USERNAME` | Bot nomi `@` siz. Bo'lmasa bog'lash havolasi (`deepLink`) `null` qaytadi, kod esa baribir ishlaydi |

## 4. Android ilova tomoni

1. Ilova FCM tokenini olgach (va token yangilanganda) serverga yuboradi:

   ```
   POST /api/notifications/device-token      {"token": "<FCM token>", "platform": "android"}
   ```

2. Foydalanuvchi tizimdan chiqqanda token o'chiriladi:

   ```
   DELETE /api/notifications/device-token    {"token": "<FCM token>"}
   ```

3. Push tarkibi: `notification.title` / `notification.body` (o'zbekcha matn) va `data`:
   `type = "deal_decision"`, `dealId`, `dealNumber`, `decision` (`APPROVED` | `REJECTED`), `reason`.
4. Android bildirishnoma kanali ID si: **`deal_decisions`**. Ilova shu ID bilan kanal yaratsa, tovush va muhimlik darajasini o'zi belgilaydi; yaratmasa FCM standart kanalni ishlatadi.
5. Ro'yxatdan chiqqan (o'chirilgan ilova, eskirgan) tokenlar yuborish paytida serverdan avtomatik o'chiriladi.

## 5. Telegram'ni bog'lash

1. Foydalanuvchi ilovada «Telegram'ni bog'lash» tugmasini bosadi → ilova `POST /api/notifications/telegram/link-code` chaqiradi.
   Javob: `{code, deepLink, botUsername, expiresAt}`. Kod **bir martalik** va **15 daqiqa** amal qiladi; yangi kod eskisini bekor qiladi.
2. `deepLink` (`https://t.me/<bot>?start=<kod>`) ochiladi va Telegram'da **Start** bosiladi.
   `deepLink` `null` bo'lsa (bot nomi sozlanmagan) — foydalanuvchi botga qo'lda `/start <kod>` deb yozadi.
3. Bot «Telegram bog'landi» deb javob beradi. Shu paytdan boshlab bitim qarorlari shu chatga keladi.
4. Uzish: `POST /api/notifications/telegram/unlink`.

Bitta Telegram hisobi faqat bitta FinModel foydalanuvchisiga bog'lanadi: boshqa foydalanuvchiga bog'lansa, avvalgi bog'lanish uziladi.

## 6. Tekshirish

1. `GET /api/notifications/status` (istalgan foydalanuvchi):

   ```json
   {"telegramLinked": true, "pushConfigured": true, "telegramConfigured": true, "deviceTokens": 1, "botUsername": "..."}
   ```

   - `pushConfigured: false` → service account topilmagan yoki yaroqsiz (2-bo'lim);
   - `telegramConfigured: false` → `TELEGRAM_BOT_TOKEN` o'rnatilmagan;
   - `deviceTokens: 0` → ilova tokenni yubormagan (4-bo'lim).

2. ADMIN sifatida `POST /api/notifications/test` — o'zingizga sinov bildirishnomasi ketadi. Javobda har bir kanal natijasi ko'rinadi:

   ```json
   {"success": true,
    "telegram": {"status": "sent"},
    "push": {"status": "sent", "sent": 1, "failed": 0, "removed": 0}}
   ```

   `status: "skipped"` bo'lsa `reason` sababni aytadi: `TELEGRAM_NOT_LINKED`, `TELEGRAM_NOT_CONFIGURED`, `PUSH_NOT_CONFIGURED`, `NO_DEVICE_TOKENS`.

3. Haqiqiy sinov: operator bilan bitim kiriting → ADMIN bilan tasdiqlang yoki rad eting → operatorning telefoniga push va Telegram'iga xabar kelishi kerak (bitim raqami, mijoz, summa, qaror, rad etish sababi, Toshkent vaqti bilan sana).

## 7. Web Push (iPhone va brauzer)

Firebase fayllarisiz ishlaydi: standart **VAPID** kalitlari bilan brauzer va iPhone (iOS 16.4+, sayt **Bosh ekranga qo'shilgan** bo'lsa) ga bildirishnoma boradi. Telegram va Android push bilan parallel, uchinchi kanal sifatida yuboriladi.

1. **Kalit yaratish (bir marta, `server/` papkasidan):** `npx ts-node --transpile-only scripts/generate-vapid-keys.ts` — `server/vapid-keys.local.json` (gitignore'da) yaratiladi. Skript kalit qiymatlarini chiqarmaydi.
2. **Lokal:** boshqa narsa kerak emas — server kalitni shu fayldan o'qiydi.
3. **Vercel (server loyihasi) → Settings → Environment Variables:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (ikkalasi `vapid-keys.local.json` ichidan) va ixtiyoriy `VAPID_SUBJECT` (`mailto:sizning@pochtangiz` yoki sayt manzili). Keyin server qayta deploy qilinadi.
4. **Foydalanuvchi tomoni:** Bildirishnomalar oynasida "Telefonga bildirishnoma" → "Bildirishnomani yoqish". iPhone'da avval Safari → Ulashish → "Bosh ekranga qo'shish", so'ng ilovani shu belgidan ochib tugmani bosing.
5. **Tekshirish:** `GET /api/notifications/status` javobida `webPushConfigured: true`, `webPushSubscriptions: 1`; ADMIN `POST /api/notifications/test` javobida `webPush.status: "sent"`.

Web Push faqat **HTTPS** da ishlaydi (Vercel manzili mos). Obuna 404/410 qaytarsa bazadan avtomatik o'chiriladi. Kalit sozlanmagan bo'lsa Web Push jim o'tkazib yuboriladi (serverda bir marta ogohlantirish).
