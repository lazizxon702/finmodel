# 📱 FinModel — Pul va Tovar Hisobi Boshqaruv Tizimi (ERP)

Mijozlarning muddatli to'lov (rassrochka) limitlaridan (Imanum, Alif, Uzum, Payme, Trust va b.) texnikalarni agentlar orqali chegirma bilan sotib olish (выкуп) hamda ulgurji (опт) yoki chakana sotish biznesini to'liq avtomatlashtirilgan veb-tizimi.

Ushbu loyiha dastlabki **`Фин_модел.xlsx`** (Google Sheets) faylidagi barcha 17 ta varaq, ularning barcha formulalari, moliya oqimlari va biznes mantiqini 100% qamrab olgan holda noldan to'liq ishlaydigan Full-Stack tizim sifatida qurilgan.

---

## 🌟 Asosiy Imkoniyatlar

1. **Saytda to'liq hisob-kitob**: Foydalanuvchilar Google Sheets'da qo'lda qator qidirib, formula buzilishidan qo'rqmaydi. Barcha bitimlar, tovarlar, DDS tranzaksiyalari, sheriklar balansi veb-interfeys orqali kiritiladi va live formulalar bilan hisoblanadi.
2. **Google Sheets / Excel'ga eksport**: Bitta tugma bilan barcha ma'lumotlar jonli formulalari bilan (ExcelJS yordamida) `.xlsx` formatida yuklab olinadi.
3. **Telegram Bot Integratsiyasi (`@MacMobiUz_bot`)**:
   - Operatorlar buyurtma cheklari va rasmlarini botga yuboradi.
   - Saytda Socket.IO orqali real vaqt rejimida yangi to'lov va shartnoma rasmlari chiqadi.
   - `/new`, `/bugun`, `/qoldiq`, `/ombor`, `/bekor` buyruqlari.
4. **O'zbek tili va qulay formatlash**:
   - O'zbek tili (lotin) ustuvor, qavs ichida ruscha asl nomlar: `Bitimlar (Сделки_и_Склад)`.
   - Raqamlar minglik ajratgich bilan: `10 000 000 UZS`.
   - Foizlar: `22.0%`.
   - Sana: `DD.MM.YYYY`, vaqt mintaqasi: `Asia/Tashkent`.
5. **Dinamik foizlar va qoidalar jadvali**: Formulalar kodga qotirilmagan, stavkalar (`Spravochniklar` sahifasida) istalgan payt o'zgartirilishi mumkin.
6. **Barcha 17 varaqning mavjud ma'lumotlari bazaga import qilingan (Seed)**.

---

## 📂 Excel Faylidagi 17 Varaq Tahlili va Formulalari

| # | Varaq nomi | Tizimdagi sahifa | Vazifasi va Asosiy Formulalari |
|---|---|---|---|
| 1 | **Сделки_и_Склад** | Bitimlar (`/deals`) | Asosiy operatsion jadval (100+ ustun). Bitimlar, agent komissiyasi, hisoblangan summa, tovar qoldig'i, foyda va marja. |
| 2 | **Склад.Продажа** | Ombor va Sotuv (`/inventory`) | Omborda va yo'lda bo'lgan tovarlar avtomatik filtrlangan holda tushadi. Ulgurji va chakana sotish, foyda va qarz nazorati. |
| 3 | **Агент** | Agentlar (`/agents`) | Har bir agent bo'yicha hisoblangan komissiyalar, to'langan summalar va qarzlar yig'indisi. |
| 4 | **SWOT_Агентства** | Agentliklar tahlili (`/agents-swot`) | Agentliklar bo'yicha tushum, bitimlar soni, agentlarga to'lov, kompaniya sof foydasi va SWOT tahlil maydonlari. |
| 5 | **Финансы_Свод** | Moliya va Balans (`/finances`) | P&L, Cash Flow, Debitorlik/Kreditorlik va Boshqaruv balansi (Aktivlar = Passivlar, Farq = 0). |
| 6 | **SWOT дате** | Dashboard (`/`) | Kunlik bitimlar dinamikasi, o'rtacha chek, diskontlar (min/max/o'rtacha), grafiklar va KPI kartochkalar. |
| 7 | **Транзакции_ДДС** | Pul harakati DDS (`/dds`) | Barcha kassa, karta va hisob-raqam kirim/chiqimlari, COGS va OPEX kategoriyalari bo'yicha tuzilma. |
| 8 | **Баланс** | Sheriklar Balansi (`/balance`) | Sheriklar (Hasan, Qodir va b.) bo'yicha 31 kunlik depozit, DDS daromad va xarajatlari matritsasi. |
| 9 | **Ежедневный_Учет** | Kunlik hisob (`/daily`) | 31 kunlik reja/fakt matritsasi, provayderlar bo'yicha qurilmalar soni, kassa oqimi va kassa uzilishi monitoringi. |
| 10 | **Фин_Модель** | Moliyaviy model (`/finmodel`) | 12 oylik prognoz model, unit-iqtisod, ulgurji/chakana ulushlari, oylik 8% o'sish dinamikasi. |
| 11 | **БОТ ТР** | Operatorlar cheki (`/bot-payments`) | Operatorlar bo'yicha cheklar hisoboti: haqiqiy narx, xarid narxi, to'langan (70%) va sof foyda. |
| 12 | **Сделки_и_Склад_Бот** | Bot bitimlari (`/bot-deals`) | Telegram bot orqali tushgan arizalar. Bitta tugma bilan asosiy Bitimlarga tasdiqlab ko'chiriladi. |
| 13 | **Платежи_Бота** | Telegram to'lovlari (`/bot-payments`) | Bot orqali kiritilgan cheklar, valyuta kursi va tasdiqlash holati. |
| 14 | **Лист8** | Qarzdorliklar (`/handover`) | Tizimdan tashqari qarzdorlar (USD va UZS) ro'yxati, aloqa ma'lumotlari va tasdiqlash holati. |
| 15 | **Прием передача** | Nazorat ro'yxati (`/handover`) | Biznesni topshirish va qabul qilishdagi 18 bandlik audit tekshiruvi va aktlar nazorati. |
| 16 | **Лист5** | Xodimlar KPI (`/handover`) | Lavozimlar bo'yicha hisobot berish davriyligi, formati va kutilayotgan KPI talablari. |
| 17 | **ФОТ** | Ish haqi fondi (`/handover`) | Xodimlar oyligi, bonuslar va to'lov nazorati. |

---

## 🛠 Excel Faylida Topilgan Xatolar va Tizimdagi Tuzatishlar

Dastlabki `Фин_модел.xlsx` faylini chuqur tahlil qilish jarayonida quyidagi jiddiy formula va tuzilma xatolari aniqlandi hamda to'liq tuzatildi:

1. **`#REF!` xatolari (`Финансы_Свод`)**:
   - Asl faylda C2, I8, C24, C25, C28, I20, I21 katakchalari `#REF!` qaytargan, sababi `Сделки_и_Склад` jadvalida ustunlar siljigan yoki o'chirilgan.
   - *Yechim*: Ombor qoldig'i `('Omborda', 'Yo'lda')` holatidagi tovarlar tannarxini, COGS esa `'Sotilgan'` bitimlar xarid xarajatini to'g'ridan-to'g'ri dinamik yig'adi.
2. **`#REF!` xatosi (`Сделки_и_Склад` AT ustuni - Foyda)**:
   - Asl formulada mavjud bo'lmagan ustun ayirilgan bo'lib, `#REF!` bergan.
   - *Yechim*: To'g'ri formula qo'yildi: `Foyda = Sotuv narxi - (Hisoblangan summa + Farq)`.
3. **`#DIV/0!` xatosi (`Сделки_и_Склад_Бот` AL ustuni - Marja %)**:
   - Sotuv narxi 0 bo'lganda nolga bo'lish xatosi yuz bergan.
   - *Yechim*: Nolga bo'lishdan himoyalandi: `Sotuv narxi > 0 ? Foyda / Sotuv narxi : 0`.
4. **Qotirilgan 12 qatorlik cheklov (`Сделки_и_Склад`)**:
   - `SUM(AN3:AN12)` faqat dastlabki 12 qatorni yig'gan, 13-qatordan keyingi barcha bitimlar umumiy hisobdan tushib qolgan!
   - *Yechim*: Tizim barcha 100+ qatorni va kelgusida qo'shiladigan millionlab qatorlarni to'liq dinamik yig'adi.
5. **Qotirilgan subtraksiyalar (`Сделки_и_Склад` 2-qator)**:
   - `=P2-20000000`, `=AE2-105544000` kabi formulasiz qo'lda ayirib qo'yilgan sun'iy raqamlar aniqlandi.
   - *Yechim*: Barcha hisob-kitoblar shaffof va haqiqiy tranzaksiyalar asosida olib boriladi, tuzatishlar esa sozlamalarda aks etadi.
6. **Agent foizining qotirilgan regex formulasi**:
   - Formulada do'kon va bank nomlari qattiq kodlangan bo'lib, yangi bank qo'shilsa 0% bergan.
   - *Yechim*: `CommissionRule` jadvali orqali har bir bank va do'kon uchun alohida foiz sozlamalar orqali boshqariladi.

---

## 📐 Biznes Hisoblash Formulalari (Formula Engine)

- **Daftar**: Bank nomi `Imanium` yoki `Imanum` bo'lsa `"Ha"`, aks holda `"Yo'q"`.
- **Xarid diskonti (S)**: `(Yechilgan limit - Hisoblangan summa) / Yechilgan limit`.
- **Agent summasi (Q)**: `P × (S − X)`, bunda:
  - `P` = Yechilgan limit;
  - `S` = Xarid diskonti;
  - `X` = Agent foizi (Green bazar: 35%, Qodir: 22%, Alif online/vari: 27%, Imanium/Alif offline/nasiya: 22%, Payme: 20%, Trust: 16%, Boshqa: 0%).
- **Agent + Xarid xarajati (R)**: `Agent summasi + Hisoblangan summa`.
- **% Agent (T)**: `Agent summasi / Yechilgan limit`.
- **Qolgan limit (V)**: `Mijoz limiti − Yechilgan limit`.
- **Farq (W)**: `Yechilgan limit − Hisoblangan summa`.
- **Haqiqiy tovar sotiladimi (Z)**: Bank `Imanium`/`Alif` VA do'kon `(Gorkiy, Samarqand, Chilonzor, Angren, Margulon, Media park...)` bo'lsa `TRUE`.
- **Tovar holati**: Agar Z=TRUE bo'lsa `"Kutilmoqda"`, aks holda `"Sotib olish kerak"`.
- **Qo'shimcha balanslar**:
  - `Daftar` = Agar Daftar="Ha" bo'lsa Yechilgan limit;
  - `Qodir aka qarzi` = Do'kon "Qodir aka" bo'lsa Hisoblangan summa;
  - `Qodir aka balansi` = `P × 5%`;
  - `Green bazar` = `P × (1 − 30%)`;
  - `Trust` = `P × (1 − 1.2%)`;
  - `Jami qo'shimcha balans` = `Daftar + Qodir balans + Green bazar + Trust`.
- **Foyda**: `Sotilgan` holatda: `Sotuv narxi − (Hisoblangan summa + Farq)`.
- **Marja %**: `Foyda / Sotuv narxi`.
- **Qarz (Debit)**: `Sotuv narxi − Olingan summa`.

---

## 🗄 Ma'lumotlar Bazasi Sxemasi (PostgreSQL + Prisma)

Tizim quyidagi 21 ta asosiy jadvallarga ega:
1. `User` — Foydalanuvchilar va rollar (`ADMIN`, `MANAGER`, `KASSIR`, `OPERATOR`).
2. `Store` — Hamkor savdo nuqtalari va do'konlar (Media Park, Green Bazar, Qodir aka va b.).
3. `Provider` — Banklar va to'lov tizimlari (Imanum, Alif, Uzum, Payme, Trust va b.).
4. `Agency` & `Agent` — Agentliklar va individual agentlar.
5. `Buyer` — Texnika xaridorlari (Ulgurji / Chakana).
6. `CommissionRule` — Agent foizlari qoidalari (ustuvorlik va dinamik stavkalar).
7. `Deal` — Barcha bitimlar (Сделки_и_Склад).
8. `WarehouseItem` — Ombor qoldig'i va tovarlar harakati.
9. `DDSTransaction` — Pul oqimi tranzaksiyalari (kirim/chiqim, COGS/OPEX).
10. `Partner` & `PartnerBalanceEntry` — Sheriklar depoziti va kunlik saldosi.
11. `DailyPlanEntry` — Kunlik 31 kunlik reja va kassa nazorati.
12. `FinModelSetting` & `FinModelProviderRate` — 12 oylik moliyaviy model parametrlari.
13. `BotDeal` — Telegram bot orqali tushgan arizalar.
14. `BotPayment` — Telegram cheklari va to'lovlari.
15. `BotOperatorReport` — Operatorlar cheklari bo'yicha hisobot (БОТ ТР).
16. `DebtRecord` — Qarzdorliklar ro'yxati (Лист8).
17. `HandoverChecklist` — Biznesni qabul qilish aktlari (Прием передача).
18. `StaffKPIPlan` — Xodimlar KPI talablari (Лист5).
19. `EmployeeSalary` — Ish haqi fondi (ФОТ).
20. `AuditLog` — Xavfsizlik va o'zgarishlar jurnali.
21. `AppSetting` — Tizim kalit-qiymat sozlamalari.

---

## 🚀 O'rnatish va Ishga Tushirish

### 1. Talablar
- Node.js v18+ yoki v20+
- PostgreSQL 14+ (Port: 5432)
- npm yoki yarn

### 2. Mahalliy ishga tushirish (Local)

1. **Repozitoriyani klonlash yoki papkaga kirish**:
   ```bash
   cd c:\Users\user\Desktop\FinModel
   ```

2. **Backend sozlamalari**:
   ```bash
   cd server
   npm install
   npx prisma db push
   npm run seed        # Dastlabki barcha 17 varaq ma'lumotlarini yuklash
   npm run build
   node dist/index.js  # Port 5000 da ishga tushadi
   ```

3. **Frontend sozlamalari**:
   ```bash
   cd ../client
   npm install
   npm run build       # Ishlab chiqarish uchun tekshirib yig'ish
   npm run dev         # Port 5173 da ishga tushadi
   ```

4. Brauzerda oching: **`http://localhost:5173`**

### 3. Docker orqali ishga tushirish (Docker Compose)
Bitta buyruq bilan PostgreSQL, Backend va Nginx Frontend to'liq ko'tariladi:
```bash
docker-compose up -d --build
```
- Sayt: `http://localhost`
- Backend API: `http://localhost:5000`

---

## 🔐 Tizimga Kirish va Xavfsizlik

Standart akkauntlar `server/src/seed.ts` faylida yaratiladi. **Sayt internetda ishlayotgan bo'lsa, birinchi kirishdan keyin barcha standart parollarni "Foydalanuvchilar" sahifasida almashtiring.**

Rollar: Admin, Menejer, Kassir, Operator, CFO, COO, Call-markaz rahbari/agenti, Omborchi, Sotuvchi, HR menejer, Kuzatuvchi.

### Majburiy muhit o'zgaruvchilari (server, Vercel → Settings → Environment Variables)

| O'zgaruvchi | Vazifasi |
|---|---|
| `DATABASE_URL` | PostgreSQL (Neon) ulanishi |
| `JWT_SECRET` | **Majburiy.** Uzun tasodifiy qiymat. Bo'lmasa, hamma soxta admin token yasay oladi |
| `ADMIN_OVERRIDE_CODE` | Qarz blokini ochish va ommaviy o'chirish kodi. Bo'lmasa — istalgan faol Admin paroli ishlaydi |
| `SYNC_WEBHOOK_SECRET` | Google Sheets webhook kaliti (o'zgartirsangiz, Apps Script kodini qayta nusxalang) |
| `CRON_SECRET` | Vercel Cron `/api/sync/cron` ni himoyalash uchun |
| `PUBLIC_SERVER_URL` | Server manzili, masalan `https://server-ecru-three-97.vercel.app` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI yordamchi (standart model: `gemini-2.5-flash`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot |

---

## 🤖 Telegram Bot Qo'llanmasi

Bot to'g'ridan-to'g'ri backend bilan bog'langan. Har bir buyruqning o'zbekcha nomi ham ishlaydi:

- `/start`, `/help` — botni boshlash va yordam.
- `/new` — yangi ariza (bitim) kiritish.
- `/cancel` (`/bekor`) — joriy amalni bekor qilish.
- `/balance` (`/qoldiq`) — kassa, karta va hisob-raqam qoldiqlari.
- `/stats` (`/bugun`) — bugungi bitimlar va tushum.
- `/warehouse` (`/ombor`) — ombor holati.
- **Chek rasmini yuborish**: Rasm yuklanganda bot uni qabul qiladi, backend uploads papkasiga saqlaydi va veb-saytga WebSocket orqali real vaqtda bildirishnoma uzatadi.

---

## 📊 Google Sheets va Excel Eksporti

Har bir sahifaning yuqori o'ng burchagida va asosiy paneldagi **"Google Sheets / Excel'ga yuklash"** tugmasi orqali:
- Tanlangan barcha yoki kerakli varaqlarni belgilash;
- Sana oralig'i (Boshlanish va Tugash) bo'yicha filtrlash;
- Haqiqiy Excel formulalari saqlangan holda `.xlsx` faylini yuklab olish mumkin.
Yuklangan faylni to'g'ridan-to'g'ri **Google Drive / Sheets**ga yuklab, asl model kabi ishlatish mumkin!
