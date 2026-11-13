# FinModel / Macmobi ERP — loyiha holati va ish qoidalari

Bu fayl yangi suhbatda ishni davom ettirish uchun. Oxirgi yangilanish: 2026-11-12.
Foydalanuvchi bilan muloqot va kod izohlari **o'zbek tilida (lotin)**.

## Loyiha
- Telefon/texnika muddatli savdo (nasiya limitini naqdlashtirish) kompaniyasining ichki ERP tizimi.
- `client/` — React 18 + Vite + Tailwind + Capacitor 6 (Android). `server/` — Express + Prisma 5 + PostgreSQL (Neon), TypeScript.
- Jonli manzillar: klient `https://finmodel-erp-uz.vercel.app`, server `https://server-ecru-three-97.vercel.app`
  (Vercel loyihalari `client` va `server`, GitHub'dan emas — `npx vercel --prod --yes` bilan har papkadan alohida deploy qilinadi).
- GitHub: `https://github.com/lazizxon702/finmodel.git` (`main`). Repo PUBLIC edi — egasiga Private qilish aytilgan, holatini tekshir.

## Qat'iy qoidalar (egasi bergan)
- **Push va deploy faqat egasining aniq buyrug'i bilan.** Avval lokalda ko'rsatiladi.
- Biznes qoidasi noaniq bo'lsa — taxmin qilma, so'ra.
- Kalit/parol/tokenlarni kodga, logga, chatga yozma. `.env*` fayllarni o'qima, faqat `process.env`.
- Jonli bazaga yozishdan oldin: zaxira → dry-run → natijani ko'rsat → keyin yoz.
- Takroriy biznes-mantiq faqat `server/src/services/calculation.service.ts` da; pul harakati faqat `ledger.service.ts` orqali.
- Prisma sxemasini faqat asosiy sessiya o'zgartiradi (sub-agentlar emas). Ikki agent bir faylga tegmasin.
- Fayllarni PowerShell `Get-Content/Set-Content` bilan qayta saqlama — UTF-8 buziladi. Edit/Write yoki node skripti ishlat.

## Muhit
- Windows, PowerShell asosiy. Git Bash'da `npx` YO'Q: `node node_modules/ts-node/dist/bin.js --transpile-only scripts/x.ts`
  yoki PowerShell'da `npx ts-node --transpile-only scripts/x.ts`.
- **Lokal baza:** kompyuterdagi PostgreSQL 17, baza `finmodel_dev`. `server/.env` lokalga qaragan.
  Jonli Neon sozlamalari `server/.env.neon-prod` da. Jonli bazaga ulanish uchun bash'da: `cd server && source ../backups/prod-env.sh`
  (DATABASE_URL ni eksport qiladi va `tsrun` funksiyasini beradi).
- Lokal ishga tushirish: `.claude/launch.json` (`server` :5000, `client` :5173).
- Lokal bazada jonli Google Sheets manzillari uzilgan (`scripts/local-safety.ts`) — lokal sinov haqiqiy jadvalga yozmaydi.
- Brauzerda lokal kirish (parolsiz): `scripts/dev-token.ts <username>` → JWT → `localStorage.setItem('token', ...)`. Faqat localhost bazada ishlaydi.
- `backups/` (gitignore): zaxiralar, dry-run natijalari. Jonli migratsiyadan oldingi zaxira: `backups/db-raw-prod-pre-migration-*.json`.
- `agent_logins.local.txt` (gitignore): JONLI agent parollari. Lokal bazaniki: `backups/agent_logins.lokal-baza.txt`.
- Lokal git'da `pre-clean-backup` tegi bor (ichida biznes ma'lumotli fayllar) — uni PUSH QILMA.

## Tekshiruv buyruqlari
- Server: `cd server; npx tsc --noEmit; npx vitest run` (252 test, fayllar ketma-ket — integratsion testlar lokal bazani ishlatadi).
- Klient: `cd client; npm run build; node src/i18n/check-keys.mjs` (uz/ru/en kalitlari bir xil bo'lishi shart).
- API tutun-sinovi: `server/scripts/smoke-api.ts`.

## Arxitektura (yangi qismlar)
- **Sxema:** `Role.AGENT`; `User.agencyId/parentAgentId/telegramLinkCode/initialPassword`; `Deal.approvalStatus` (PENDING_APPROVAL | APPROVED | REJECTED),
  `trustDebtAmount`, `items DealItem[]`; `DdsTransaction.source/dealId` (`@@unique([dealId, source])`); `AccountBalance`; `TrustLedgerEntry`; `DeviceToken`.
  Migratsiya papkasi yo'q — `prisma db push`.
- **calculation.service.ts:** Trust faqat aniq nom bo'yicha ("Trust", "Trust 1"), `calcTrustDebt` = yechilgan limit × 16%; `isQodirStore`; `calcCheckExpense`
  (Qodir aka cheki xarajatga olinmaydi); `calcAgentCommission` = limit × (xarid diskonti − agent foizi); `normalizeDealItems`; kanonik nomlar
  (`STORE/PROVIDER/AGENCY_ALIASES`); `formatTashkentDateTime`, `tashkentDayRange`.
- **ledger.service.ts:** `createDds/deleteDds` (hisob qoldig'ini yangilaydi; "Trust 1 daromadi" kirimi Trust qarzini kamaytiradi), `approveDeal/rejectDeal`,
  `createCheckExpenseInTx` (idempotent), `syncTrustDebtForDeal`, `rebuildAccountBalances`, `getTrustLedger`.
- **access.service.ts:** `dealScopeWhere` — OPERATOR faqat o'zi kiritgan; AGENT o'zi + jamoasi + o'z agentligi; `APPROVED_ONLY`.
- **Routelar:** `/api/trust`, `/api/team` (agent o'z operatorlarini boshqaradi), `/api/notifications`, `/api/deals/:id/approve|reject|expense-to-dds`,
  `/api/deals/kpi-details`, `/api/deals/pending-count`, `/api/agents/commission-summary`.
- **Parollar (egasi qarori):** ochiq matnda `User.initialPassword` da saqlanadi; ADMIN Foydalanuvchilar sahifasida, AGENT o'z operatorlarinikini Jamoa sahifasida ko'radi.
- **AI:** `ai.routes.ts`, Gemini `gemini-3.6-flash` (`GEMINI_MODEL` bilan almashtiriladi), kalit faqat `GEMINI_API_KEY`, kontekst bazadagi real raqamlar.
- **Klient:** dizayn tokenlari `client/src/index.css` + `tailwind.config.js`; umumiy komponentlar `components/ui/`; i18n `i18n/modules/*.ts`
  (uz/ru/en, `import.meta.glob`); hujjat `docs/DESIGN_SYSTEM.md`. Yorug' mavzu standart, to'q ko'k yon menyu, shriftlar Onest + Geologica.
  Bitimlar: `components/deals/` (`DealsSummary`, 12 ustunli `DealsTable`, `DealFormModal`, `DealItemsEditor`).
- **Skriptlar** (`server/scripts/`): `backup-db-raw.ts` (sxemaga bog'liq emas), `restore-db.ts` (faqat lokal), `backfill-ledger.ts`,
  `merge-references.ts`, `import-sheets-day.ts --date=DD.MM.YYYY`, `create-agent-logins.ts` — hammasi standart dry-run, `--apply` bilan yozadi.

## Do'kon daftari va cheklarni DDS'ga o'tkazish (2026-11-13, FAQAT LOKALDA — commit/deploy qilinmagan)
- **Egasi qarorlari:** do'kon qarzi = bitimdagi mijozga berilgan summa (`calculatedAmount`); Qodir aka — BIZ unga qarzdormiz
  (cheki DDS xarajatiga tushmaydi), boshqa do'konlar — do'kon BIZGA qarzdor. Qarz DDS orqali yopiladi: "Qodir aka to'lovi"
  (chiqim, majburan COGS, `QODIR_PAYMENT`) va "Do'kondan tushum" (kirim, `storeId` majburiy, `STORE_PAYMENT`).
- **Sxema:** `StoreLedgerEntry` (DEBT/PAYMENT, `dealId @unique`, `ddsTransactionId @unique`), `DdsSource` ga 2 qiymat. Jonli bazaga hali `db push` qilinmagan.
- **calculation.service.ts:** `STORE_LEDGER_START_YMD = '2026-11-10'` (daftar boshlanishi — bitta konstanta), `calcStoreDebt`,
  `storeSettlementKind` (WE_OWE | STORE_OWES | TRUST), `summarizeLedger`. Trust do'konlari do'kon daftariga kirmaydi.
- **ledger.service.ts:** `syncStoreDebtForDeal` (syncTrustDebtForDeal chaqirilgan hamma joyda), `getStoreLedger`, `getStoresReport`,
  `listPendingCheckExpenses` / `applyPendingCheckExpenses` (chek DDS'ga BITIM SANASI bilan yoziladi).
- **Routelar:** `/api/store-reports` (`/`, `/qodir`, `/:storeId`), `/api/dds/check-expenses/preview|apply` (ADMIN; apply `expectedCount/expectedTotal` mos kelmasa 409).
- **Klient:** `/stores`, `/stores/:id`, `/qodir-ledger` (`pages/StoresPage`, `StoreDetailPage`, `components/stores/`), DDS sahifasida davr filtri va
  `CheckTransferModal`, DDS formasida do'kon tanlash.
- **Skriptlar:** `move-checks-to-dds.ts --from=DD.MM.YYYY`, `backfill-store-ledger.ts` (ikkalasi standart dry-run, `--apply`).
  Lokal bazada `backfill-store-ledger --apply` bajarilgan (22 yozuv); cheklar lokalda ham hali o'tkazilmagan.
- **Jonliga chiqarish tartibi:** zaxira → `prisma db push` → deploy → `backfill-store-ledger` dry-run/apply → `move-checks-to-dds` dry-run/apply.
  Cheklarni o'tkazishdan oldin tekshir: shu davrda "Mijozga berilgan summa (Tovar xaridi)" kategoriyasida bitimga bog'lanmagan
  (qo'lda/Sheets'dan) DDS qatorlari bo'lsa, ikki marta yozilib qoladi.

## Ko'p tovarli sotuv (2026-11-13, FAQAT LOKALDA — deploy qilinmagan)
- **Egasi qarorlari:** bitta sotuv = bir nechta ombor qatori (bitim) bitta xaridorga; BITTA umumiy narx (bitimlarga `totalPurchaseCost` ga
  mutanosib taqsimlanadi); BITTA to'lov, qarz SOTUV bo'yicha; to'lov turi CASH / BANK_CARD / SETTLEMENT_ACCOUNT / DEBT (nasiya);
  omborga qaytarilganda tushum ham bekor bo'ladi. Alohida telefon (DealItem) darajasida sotish QILINMAGAN (tannarx faqat bitimda).
- **Sxema:** `Sale` (saleNumber, totalPrice, receivedAmount, debtRemainder, paymentType), `SalePayment` (manfiy = xaridorga qaytarilgan,
  `ddsTransactionId`), `Deal.saleId`, `DdsSource.SALE_PAYMENT`. Jonli bazaga hali `db push` qilinmagan.
- **Kod:** `services/sale.service.ts` (`createSale`, `updateSale`, `addSalePayment`, `returnSale`, `applySaleToDeals` — bitimdagi sotuv
  maydonlarini sotuvdan ulush bo'yicha qayta yozadi), `routes/sales.routes.ts` (`/api/sales`, `/:id`, `/:id/payments`, `/:id/return`;
  rollar ADMIN, MANAGER, COO, SELLER; to'lovga + CASHIER, CFO). Taqsimlash: `allocateProportional/allocateCapped/allocateRefundByAccount`.
- **Himoya:** `saleId` bor bitim eski yo'llar bilan o'zgartirilmaydi (inventory sell/sale/status/transfer/receive, bitimni o'chirish, bot — 409);
  bitim tahriri va Sheets importi sotuv maydonlarini ustidan yozmaydi; sotuv to'loviga bog'langan DDS qatori alohida o'chirilmaydi.
- **Eski sotuvlar** (`saleId` yo'q) ro'yxatda `legacy: true` bitta tovarli sotuv bo'lib ko'rinadi va eski route'lar bilan ishlaydi.
- **Qaytarish:** butun sotuv — DDS qatorlari O'CHIRILADI; qisman — ortiqcha to'lov bugungi sana bilan chiqim (COGS) bo'lib qaytariladi.
- **Klient:** `components/sales/` (`NewSaleModal`, `SaleModals`, `SaleDetails`), `SalesPage` (ochiladigan qatorlar), `DebtorsPage` (`kind: SALE`).

## Jonli muhit holati (2026-11-12)
- Deploy qilingan: server va klient. Jonli baza: sxema yangilangan, eski bitimlar to'ldirilgan (DealItem, Trust daftari, kassa qoldiqlari),
  dublikatlar birlashtirilgan (do'kon 22, provayder 16, agentlik 10), 5 agent logini (nazirbek, asadbek, farida, jahongir, macmobi).
- Vercel `server` env: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SYNC_WEBHOOK_SECRET`.
  Yo'q: `TELEGRAM_BOT_USERNAME`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `CRON_SECRET`.
- Vercel'da Socket.IO ishlamaydi → jonli saytda real vaqt yangilanishi yo'q (lokalda bor).
- Jonli saytga login qilib ichki sahifalar hali hech kim tomonidan tekshirilmagan.

## Ochiq savollar (egasi javob bermagan — taxmin qilma)
1. **Imanum agent foizi:** kodda 03.11.2026 dan 25%, spravochnik qoidasida 22% (qoida ustun). Qaysi biri to'g'ri? 19 ta Imanum/Novza bitimi keyingi tahrirda 22% bilan qayta hisoblanadi.
2. **Agent ismlari:** 14 ta kirill/lotin juftlik (Гулнур/Gulnur, Шахло/Shahlo ...) birlashtirilsinmi?
3. **Omborchi** tasdiqlanmagan bitimni ko'rmaydi — shunday qolsinmi?
4. **Telegram bot:** avtorizatsiyasiz, DDS'ni ledger'siz yozadi (`telegram.bot.ts:~526`, `bot.routes.ts:~135`). Tuzatilsinmi?
5. **Bitim formasi:** tayyor qiymatlar (limit 10 000 000, yechilgan 2 800 000) olib tashlansinmi?
6. **Eski 99 bitim foydasi:** egasi "hozircha yo'q" dedi — qayta hisoblanmagan; P&L'da 41 052 100 so'mlik "Tuzatish" qatori turibdi.

7. **Do'kon daftari boshlanishi** 10.11.2026 deb qo'yilgan (egasi tasdiqlamagan) — undan oldingi bitimlar qarzga kirmaydi.
8. **Trust:** Trust do'konlari do'kon daftaridan chiqarilgan, lekin Trust bitimlari cheklari DDS xarajatiga yoziladi — ikkalasi ham tasdiqlanmagan.
   Provayderi Trust, do'koni oddiy bo'lgan bitim ham Trust qarzi (16%), ham do'kon qarzini oladi — shundaymi?
9. **Ombor ko'chirishi** (`inventory.routes.ts` transfer-accept) bitim do'konini o'zgartiradi, do'kon qarzi eski do'konda qoladi — ko'chsinmi?
10. **Sheets'dan kelgan "Do'kondan tushum"** qatorida do'kon yo'q — daftarga to'lov bo'lib tushmaydi; "Qodir aka to'lovi" ham Sheets'dan kelsa daftarni kamaytirmaydi (faqat COGS bo'ladi).
11. **Ortiqcha to'lov** cheklanmagan (qoldiq manfiy bo'lishi mumkin); CASHIER va MANAGER do'konlar hisobotida foydani ko'radi — shundaymi?

12. **Sotuv:** butun sotuv qaytarilganda eski DDS qatorlari o'chiriladi (yopilgan davr o'zgaradi) — o'rniga bugungi sana bilan teskari yozuv bo'lsinmi?
    Sotuv paytidagi to'lov DDS'ga bugungi sana bilan yoziladi (orqa sana bilan sotuvda ham) — sotuv sanasi bilan bo'lsinmi?
    Sotilgan bitim foydasi = narx ulushi − xarid summasi (Trust 16% / hamkor 5% bonussiz, eski sotuv yo'li kabi) — shundaymi?
    Tannarxi 0 tovar aralash sotuvda 0 narx ulushi oladi. Sotuv tahririda narx oshirilsa (boshqa qarzi yo'q xaridor) admin kodi so'ralmaydi.

## Ma'lum kamchiliklar / keyingi ishlar
- Eski sotuv va qarz to'lovi route'larida (`/api/inventory/:id/sell`, `/api/debtors/:id/payment`) rol tekshiruvi yo'q; yangi `/api/sales` da bor.
- Tor oynada (~1024px) Sotuv/DDS kartochkalaridagi uzun raqamlar sinadi; Bitimlar yig'ma panelining o'ng kataklari kesiladi; jadval biroz o'ngga suriladi.
- Lidlar, HR, Balans, Kunlik hisob, Moliyaviy model, bot sahifalari va modallar yangi dizaynda ko'z bilan tekshirilmagan.
- Android push: `google-services.json` + service account kerak (`docs/FIREBASE_SETUP.md`), APK qayta yig'iladi. Qurilmada sinalmagan.
- Haqiqiy Telegram bildirishnomasi, Sheets webhook va Trust to'lovi formasi (UI) jonli sinovdan o'tmagan.
- Bazada 14 ta summasi 0 bo'lgan bo'sh DDS qatori va #8095 "axlat" bitim bor.
- 9 ta komissiya qoidasi aynan takror. `seed.ts`, `bot.routes.ts`, `leads.routes.ts` eski dublikat nomlarni qayta yaratishi mumkin.
- `Balance`/`Daily` sahifalarida boshlang'ich oy `'2026-11'` qotirilgan.
- Telegram bot tokenlari ilgari kodda ochiq yozilgan edi (endi yo'q) — BotFather'da yangilash tavsiya etilgan.
