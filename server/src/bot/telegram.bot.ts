import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '../lib/prisma';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';
import { TransactionType, AccountType, DealStatus, ExpenseCategoryType } from '@prisma/client';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'MISSING_TELEGRAM_BOT_TOKEN';

export const bot = new Bot(BOT_TOKEN);

let ioInstance: SocketIOServer | null = null;

// Conversation States matching uz.salesbot Archive structure
interface CustomerCheckState {
  step: 'APPLICATION' | 'LIMIT_AMOUNT' | 'INTEREST_PERCENT' | 'PRODUCT' | 'CUSTOM_PRODUCT' | 'STORE_NAME' | 'CUSTOM_STORE' | 'AGENT' | 'AGENT_EMPLOYEE' | 'CONFIRMATION';
  applicationName?: string;
  applicationBasePercent?: number;
  limitAmount?: number;
  interestPercent?: number;
  productName?: string;
  storeName?: string;
  agentName?: string;
  agentEmployeeName?: string;
}

interface CashFlowState {
  flow: 'INCOME' | 'EXPENSE';
  category: string;
  step: 'SELECT_NAME' | 'ENTER_AMOUNT' | 'SELECT_ACCOUNT' | 'CONFIRM';
  sourceName?: string;
  amount?: number;
  account?: AccountType;
}

interface WarehouseOutgoingState {
  type: 'SALE' | 'DEBT';
  step: 'SELECT_DEAL' | 'ENTER_PRICE' | 'ENTER_BUYER' | 'CONFIRM';
  dealId?: string;
  productName?: string;
  salePrice?: number;
  buyerName?: string;
}

const customerConversations = new Map<number, CustomerCheckState>();
const cashFlowConversations = new Map<number, CashFlowState>();
const warehouseConversations = new Map<number, WarehouseOutgoingState>();

// Keyboard 1: Main Menu (KeyboardFactory.mainMenu)
export function getMainMenuKeyboard() {
  return new InlineKeyboard()
    .text('➕ Mijoz qo\'shish', 'menu:add_customer')
    .text('💰 Kirim Chiqim', 'menu:cash_flow')
    .row()
    .text('📦 Omborni boshqarish', 'menu:warehouse')
    .row()
    .url('🌐 ERP Boshqaruv Paneli', 'https://finmodel-erp-uz.vercel.app');
}

// Keyboard 2: Cash Flow Menu (KeyboardFactory.cashFlowMenu)
export function getCashFlowMenuKeyboard() {
  return new InlineKeyboard()
    .text('📥 Kirim', 'cash_flow:income')
    .text('📤 Chiqim', 'cash_flow:expense')
    .row()
    .text('💳 Balans', 'cash_flow:balance')
    .row()
    .text('⬅️ Asosiy menyu', 'menu:main');
}

// Keyboard 3: Income Menu (KeyboardFactory.incomeMenu)
export function getIncomeMenuKeyboard() {
  return new InlineKeyboard()
    .text('💼 Investor', 'cf_inc:investor')
    .text('📱 Ilovalar', 'cf_inc:applications')
    .row()
    .text('📦 Mahsulot summasi', 'cf_inc:product_amount')
    .text('🤝 Qarz summasi', 'cf_inc:debt_amount')
    .row()
    .text('⬅️ Orqaga', 'menu:cash_flow');
}

// Keyboard 4: Expense Menu (KeyboardFactory.expenseMenu)
export function getExpenseMenuKeyboard() {
  return new InlineKeyboard()
    .text('📊 Kunlik mijozlar summasi', 'cf_exp:customer_amount')
    .row()
    .text('🤝 Agentlar foydasi', 'cf_exp:agent_profit')
    .row()
    .text('🧾 Kunlik rasxod', 'cf_exp:daily_expense')
    .row()
    .text('⬅️ Orqaga', 'menu:cash_flow');
}

// Keyboard 5: Warehouse Menu (KeyboardFactory.warehouseMenu)
export function getWarehouseMenuKeyboard() {
  return new InlineKeyboard()
    .text('📤 Ombordan chiqim', 'warehouse:outgoing')
    .text('📊 Qoldiqni ko\'rish', 'warehouse:stock')
    .row()
    .text('⬅️ Asosiy menyu', 'menu:main');
}

// Application selection keyboard
export function getApplicationsKeyboard() {
  return new InlineKeyboard()
    .text('Alif online (27%)', 'pick:app:Alif online:27').text('Alif offline (22%)', 'pick:app:Alif offline:22').row()
    .text('Imanium (22%)', 'pick:app:Imanium:22').text('Uzum Bank (22.5%)', 'pick:app:Uzum Bank:22.5').row()
    .text('Uzum Nasiya (27.5%)', 'pick:app:Uzum Nasiya:27.5').text('Payme (20%)', 'pick:app:Payme:20').row()
    .text('Trust (16%)', 'pick:app:Trust:16').text('Variant (27%)', 'pick:app:Variant:27').row()
    .text('Green bazar (35%)', 'pick:app:Green bazar:35').text('Boshqa ilova', 'pick:app:Boshqa:20').row()
    .text('❌ Bekor qilish', 'confirm:no');
}

// Stores selection keyboard
export function getStoresKeyboard() {
  return new InlineKeyboard()
    .text('Gorkiy', 'pick:store:Gorkiy').text('Samarqand', 'pick:store:Samarqand').row()
    .text('Chilonzor', 'pick:store:Chilonzor').text('Green bazar', 'pick:store:Green bazar').row()
    .text('Qodir aka', 'pick:store:Qodir aka').text('Denov', 'pick:store:Denov').row()
    .text('Media park', 'pick:store:Media park').text('➕ Boshqa do\'kon', 'pick:store:custom').row()
    .text('⬅️ Ortga', 'customer:back').text('❌ Bekor qilish', 'confirm:no');
}

// Products selection keyboard
export function getProductsKeyboard() {
  return new InlineKeyboard()
    .text('iPhone 15 Pro Max', 'pick:prod:iPhone 15 Pro Max').text('iPhone 15 Pro', 'pick:prod:iPhone 15 Pro').row()
    .text('iPhone 15', 'pick:prod:iPhone 15').text('iPhone 13', 'pick:prod:iPhone 13').row()
    .text('Samsung S24 Ultra', 'pick:prod:Samsung S24 Ultra').text('Samsung A55', 'pick:prod:Samsung A55').row()
    .text('Samsung A35', 'pick:prod:Samsung A35').text('Redmi Note 13', 'pick:prod:Redmi Note 13').row()
    .text('➕ Boshqa tovar', 'pick:prod:custom').row()
    .text('⬅️ Ortga', 'customer:back').text('❌ Bekor qilish', 'confirm:no');
}

// Agencies keyboard
export function getAgenciesKeyboard() {
  return new InlineKeyboard()
    .text('Jahongir', 'pick:agent:Jahongir:Muyassar').text('Davlatbek', 'pick:agent:Davlatbek:Go\'zal').row()
    .text('Sardor', 'pick:agent:Sardor:Shahnoza').text('Do\'kon o\'zi', 'pick:agent:Do\'kon:Operator').row()
    .text('⬅️ Ortga', 'customer:back').text('❌ Bekor qilish', 'confirm:no');
}

// ---------------- COMMANDS ----------------

// /start
bot.command('start', async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  clearConversations(from.id);

  const text =
    `Assalomu alaykum, <b>${from.first_name}</b>!\n\n` +
    `🏢 <b>Hisobchi Sales Bot (FinModel ERP)</b>\n\n` +
    `Kerakli bo'limni tanlang:`;

  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: getMainMenuKeyboard(),
  });
});

// /new
bot.command('new', (ctx) => startCustomerConversation(ctx));

// /cancel or /bekor
bot.command(['cancel', 'bekor'], async (ctx) => {
  if (ctx.from) clearConversations(ctx.from.id);
  await ctx.reply('❌ Amal bekor qilindi.', {
    reply_markup: getMainMenuKeyboard(),
  });
});

// /help
bot.command('help', async (ctx) => {
  const text =
    `📖 <b>Hisobchi Bot buyruqlari:</b>\n\n` +
    `• <b>/start</b> — Asosiy menyuni ochish\n` +
    `• <b>/new</b> — Yangi mijoz qo'shish (rassrochka cheki)\n` +
    `• <b>/cancel</b> — Joriy amalni bekor qilish\n` +
    `• <b>/balance</b> — Kassa va likvid balansni ko'rish\n` +
    `• <b>/stats</b> — Bugungi bitimlar va foyda hisoboti\n` +
    `• <b>/warehouse</b> — Ombordagi mavjud tovarlar\n\n` +
    `🌐 ERP sayti: <a href="https://finmodel-erp-uz.vercel.app">finmodel-erp-uz.vercel.app</a>`;

  await ctx.reply(text, { parse_mode: 'HTML' });
});

// /balance
bot.command(['balance', 'qoldiq'], (ctx) => showBalance(ctx));

// /stats
bot.command(['stats', 'bugun'], (ctx) => showStats(ctx));

// /warehouse
bot.command(['warehouse', 'ombor'], (ctx) => showWarehouseStock(ctx));

// ---------------- CALLBACK QUERIES ----------------

bot.on('callback_query:data', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  // 1. Navigation: Main Menu
  if (data === 'menu:main') {
    clearConversations(userId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Kerakli amalni tanlang:', {
      reply_markup: getMainMenuKeyboard(),
    });
    return;
  }

  // 2. Navigation: Add Customer Flow
  if (data === 'menu:add_customer') {
    await ctx.answerCallbackQuery();
    await startCustomerConversation(ctx);
    return;
  }

  // 3. Navigation: Cash Flow Menu
  if (data === 'menu:cash_flow') {
    clearConversations(userId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('💰 <b>Kirim Chiqim</b>\n\nKerakli bo\'limni tanlang:', {
      parse_mode: 'HTML',
      reply_markup: getCashFlowMenuKeyboard(),
    });
    return;
  }

  // 4. Cash Flow: Balance
  if (data === 'cash_flow:balance') {
    await ctx.answerCallbackQuery();
    await showBalance(ctx);
    return;
  }

  // 5. Cash Flow: Income Menu
  if (data === 'cash_flow:income') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📥 <b>Kirim</b>\n\nKirim turini tanlang:', {
      parse_mode: 'HTML',
      reply_markup: getIncomeMenuKeyboard(),
    });
    return;
  }

  // 6. Cash Flow: Expense Menu
  if (data === 'cash_flow:expense') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📤 <b>Chiqim</b>\n\nChiqim turini tanlang:', {
      parse_mode: 'HTML',
      reply_markup: getExpenseMenuKeyboard(),
    });
    return;
  }

  // 7. Navigation: Warehouse Menu
  if (data === 'menu:warehouse') {
    clearConversations(userId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('📦 <b>Omborni boshqarish</b>\n\nKerakli amalni tanlang:', {
      parse_mode: 'HTML',
      reply_markup: getWarehouseMenuKeyboard(),
    });
    return;
  }

  // 8. Warehouse: Stock
  if (data === 'warehouse:stock') {
    await ctx.answerCallbackQuery();
    await showWarehouseStock(ctx);
    return;
  }

  // 9. Warehouse: Outgoing
  if (data === 'warehouse:outgoing') {
    await ctx.answerCallbackQuery();
    await startWarehouseOutgoing(ctx);
    return;
  }

  // 10. Cancel Action
  if (data === 'confirm:no') {
    clearConversations(userId);
    await ctx.answerCallbackQuery('Amal bekor qilindi');
    await ctx.editMessageText('❌ Bekor qilindi.', {
      reply_markup: getMainMenuKeyboard(),
    });
    return;
  }

  // 11. Customer Check: Step 1 Pick Application
  if (data.startsWith('pick:app:')) {
    const parts = data.split(':');
    const appName = parts[2];
    const basePct = parseFloat(parts[3]) || 22;

    customerConversations.set(userId, {
      step: 'LIMIT_AMOUNT',
      applicationName: appName,
      applicationBasePercent: basePct,
      interestPercent: basePct,
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Ilova: <b>${appName}</b> (${basePct}%) ✅\n\n` +
      `💰 <b>Limit summasi</b>ni kiriting (faqat raqam):\n` +
      `<i>(Masalan: 6200000 yoki 10 000 000)</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 12. Customer Check: Step 4 Pick Product
  if (data.startsWith('pick:prod:')) {
    const prodName = data.replace('pick:prod:', '');
    const state = customerConversations.get(userId);
    if (!state) return;

    if (prodName === 'custom') {
      state.step = 'CUSTOM_PRODUCT';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `📱 <b>Tovar nomi</b>ni yozib yuboring:\n` +
        `<i>(Masalan: Samsung A55 128GB, IMEI: 350357...)</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    state.productName = prodName;
    state.step = 'STORE_NAME';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Tovar: <b>${prodName}</b> ✅\n\n` +
      `🏪 <b>Do'kon / Filial</b>ni tanlang:`,
      { parse_mode: 'HTML', reply_markup: getStoresKeyboard() }
    );
    return;
  }

  // 13. Customer Check: Step 5 Pick Store
  if (data.startsWith('pick:store:')) {
    const storeName = data.replace('pick:store:', '');
    const state = customerConversations.get(userId);
    if (!state) return;

    if (storeName === 'custom') {
      state.step = 'CUSTOM_STORE';
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `🏪 <b>Do'kon nomi</b>ni yozib yuboring:`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    state.storeName = storeName;
    state.step = 'AGENT';

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Do'kon: <b>${storeName}</b> ✅\n\n` +
      `🤝 <b>Agent / Mas'ul</b>ni tanlang:`,
      { parse_mode: 'HTML', reply_markup: getAgenciesKeyboard() }
    );
    return;
  }

  // 14. Customer Check: Step 6 Pick Agent & Employee
  if (data.startsWith('pick:agent:')) {
    const parts = data.split(':');
    const agentName = parts[2];
    const employeeName = parts[3] || 'Xodim';
    const state = customerConversations.get(userId);
    if (!state) return;

    state.agentName = agentName;
    state.agentEmployeeName = employeeName;
    state.step = 'CONFIRMATION';

    const kb = new InlineKeyboard()
      .text('✅ Tasdiqlash', 'confirm:yes')
      .text('❌ Bekor qilish', 'confirm:no');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📋 <b>Yangi mijoz cheki:</b>\n\n` +
      `• <b>Ilova:</b> ${state.applicationName}\n` +
      `• <b>Limit:</b> ${(state.limitAmount || 0).toLocaleString('ru-RU')} UZS\n` +
      `• <b>Foiz:</b> ${state.interestPercent}%\n` +
      `• <b>Tovar:</b> ${state.productName}\n` +
      `• <b>Do'kon:</b> ${state.storeName}\n` +
      `• <b>Agent:</b> ${state.agentName} (${state.agentEmployeeName})\n\n` +
      `Ma'lumotlar to'g'rimi?`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
    return;
  }

  // 15. Customer Check: Final Confirmation (confirm:yes)
  if (data === 'confirm:yes') {
    const state = customerConversations.get(userId);
    if (!state) return;

    try {
      const lastDeal = await prisma.botDeal.findFirst({ orderBy: { checkNumber: 'desc' } });
      const checkNumber = (lastDeal?.checkNumber || 3644) + 1;
      const isDaftar = state.applicationName?.toLowerCase().includes('imani') || false;

      const newBotDeal = await prisma.botDeal.create({
        data: {
          uuid: crypto.randomUUID(),
          checkNumber,
          telegramUsername: ctx.from.username || ctx.from.first_name,
          telegramUserId: BigInt(ctx.from.id),
          providerName: state.applicationName,
          storeName: state.storeName,
          customerName: ctx.from.first_name,
          customerLimit: state.limitAmount || 0,
          withdrawnLimit: state.limitAmount || 0,
          productName: state.productName,
          agencyName: state.agentName,
          agentName: state.agentEmployeeName,
          isDaftar,
          isApproved: false,
        },
      });

      if (ioInstance) {
        ioInstance.emit('new_bot_deal', {
          deal: newBotDeal,
          message: `Telegramdan yangi chek! Chek №${checkNumber}`,
        });
      }

      clearConversations(userId);
      await ctx.answerCallbackQuery('Chek saqlandi!');
      await ctx.editMessageText(
        `✅ <b>Chek №${checkNumber} qabul qilindi!</b>\n\n` +
        `• Ilova: <b>${state.applicationName}</b>\n` +
        `• Summa: <b>${(state.limitAmount || 0).toLocaleString('ru-RU')} UZS</b>\n` +
        `• Tovar: <b>${state.productName}</b>\n` +
        `• Do'kon: <b>${state.storeName}</b>\n` +
        `• Agent: <b>${state.agentName}</b>\n\n` +
        `<i>Ma'lumotlar sayt bazasiga kiritildi va tasdiqlash uchun yuborildi.</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .url('👁 Saytda ochish', 'https://finmodel-erp-uz.vercel.app/bot-deals')
            .row()
            .text('⬅️ Asosiy menyu', 'menu:main'),
        }
      );
    } catch (err: any) {
      await ctx.answerCallbackQuery('Xatolik');
      await ctx.reply('Xatolik: ' + err.message);
    }
    return;
  }

  // 16. Cash Flow: Pick Category
  if (data.startsWith('cf_inc:') || data.startsWith('cf_exp:')) {
    const isIncome = data.startsWith('cf_inc:');
    const cat = data.replace('cf_inc:', '').replace('cf_exp:', '');

    const catNameMap: Record<string, string> = {
      investor: 'Investor kirimi',
      applications: 'Ilovalar tushumi',
      product_amount: 'Mahsulot sotuv tushumi',
      debt_amount: 'Qarz qaytarilishi',
      customer_amount: 'Kunlik mijozlar xarajati',
      agent_profit: 'Agentlar komissiyasi',
      daily_expense: 'Kunlik operatsion rasxod',
    };

    const categoryTitle = catNameMap[cat] || cat;

    cashFlowConversations.set(userId, {
      flow: isIncome ? 'INCOME' : 'EXPENSE',
      category: categoryTitle,
      step: 'ENTER_AMOUNT',
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${isIncome ? '📥 Kirim' : '📤 Chiqim'}: <b>${categoryTitle}</b>\n\n` +
      `Summani kiriting (so'mda, faqat raqam):\n` +
      `<i>(Masalan: 1500000 yoki 500 000)</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // 17. Cash Flow: Select Account
  if (data.startsWith('cf_acc:')) {
    const accType = data.replace('cf_acc:', '') as AccountType;
    const cfState = cashFlowConversations.get(userId);
    if (!cfState || !cfState.amount) return;

    try {
      const txCount = await prisma.ddsTransaction.count();
      await prisma.ddsTransaction.create({
        data: {
          txNumber: `TX-${1000 + txCount + 1}`,
          dateTime: new Date(),
          type: cfState.flow === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
          account: accType,
          expenseType: cfState.flow === 'INCOME' ? ExpenseCategoryType.INCOME_TRANSFER : ExpenseCategoryType.OPEX,
          categoryName: cfState.category,
          amount: cfState.amount,
          sourcePerson: ctx.from.first_name,
          description: `Telegram @${ctx.from.username || ctx.from.first_name} orqali kiritildi`,
        },
      });

      const accTitle = accType === 'CASH' ? 'Kassa (Naqd)' : accType === 'BANK_CARD' ? 'Bank karta' : 'Hisob-raqam';
      clearConversations(userId);

      await ctx.answerCallbackQuery('Tranzaksiya saqlandi!');
      await ctx.editMessageText(
        `✅ <b>${cfState.flow === 'INCOME' ? 'Kirim' : 'Chiqim'} muvaffaqiyatli saqlandi!</b>\n\n` +
        `• Kategoriya: <b>${cfState.category}</b>\n` +
        `• Summa: <b>${cfState.amount.toLocaleString('ru-RU')} UZS</b>\n` +
        `• Hisob: <b>${accTitle}</b>\n\n` +
        `<i>ERP DDS hisobotiga yozildi.</i>`,
        {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard()
            .text('💳 Balansni ko\'rish', 'cash_flow:balance')
            .text('⬅️ Asosiy menyu', 'menu:main'),
        }
      );
    } catch (err: any) {
      await ctx.answerCallbackQuery('Xatolik');
      await ctx.reply('Xatolik: ' + err.message);
    }
    return;
  }

  // 18. Warehouse Outgoing: Select Deal
  if (data.startsWith('wh_deal:')) {
    const dealId = data.replace('wh_deal:', '');
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return;

    warehouseConversations.set(userId, {
      type: 'SALE',
      step: 'ENTER_PRICE',
      dealId: deal.id,
      productName: deal.productName || 'Tovar',
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `Chiqim: <b>${deal.productName}</b>\n` +
      `Tannarx: <b>${Number(deal.totalPurchaseCost).toLocaleString('ru-RU')} UZS</b>\n\n` +
      `Sotuv narxini kiriting (UZS):`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await ctx.answerCallbackQuery();
});

// ---------------- TEXT MESSAGES ----------------

bot.on('message:text', async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const text = ctx.message.text.trim();

  // If inside Customer Check flow
  if (customerConversations.has(userId)) {
    const state = customerConversations.get(userId)!;

    // LIMIT_AMOUNT
    if (state.step === 'LIMIT_AMOUNT') {
      const cleanNum = text.replace(/[\s.,]/g, '');
      const amount = parseFloat(cleanNum);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Iltimos, musbat raqam kiriting:');
        return;
      }
      state.limitAmount = amount;
      state.step = 'PRODUCT';

      await ctx.reply(
        `Limit: <b>${amount.toLocaleString('ru-RU')} UZS</b> ✅\n\n` +
        `📱 <b>Mahsulot / Tovar</b>ni tanlang:`,
        { parse_mode: 'HTML', reply_markup: getProductsKeyboard() }
      );
      return;
    }

    // CUSTOM_PRODUCT
    if (state.step === 'CUSTOM_PRODUCT') {
      state.productName = text;
      state.step = 'STORE_NAME';

      await ctx.reply(
        `Tovar: <b>${text}</b> ✅\n\n` +
        `🏪 <b>Do'kon / Filial</b>ni tanlang:`,
        { parse_mode: 'HTML', reply_markup: getStoresKeyboard() }
      );
      return;
    }

    // CUSTOM_STORE
    if (state.step === 'CUSTOM_STORE') {
      state.storeName = text;
      state.step = 'AGENT';

      await ctx.reply(
        `Do'kon: <b>${text}</b> ✅\n\n` +
        `🤝 <b>Agent / Mas'ul</b>ni tanlang:`,
        { parse_mode: 'HTML', reply_markup: getAgenciesKeyboard() }
      );
      return;
    }
  }

  // If inside Cash Flow flow
  if (cashFlowConversations.has(userId)) {
    const cfState = cashFlowConversations.get(userId)!;
    if (cfState.step === 'ENTER_AMOUNT') {
      const cleanNum = text.replace(/[\s.,]/g, '');
      const amount = parseFloat(cleanNum);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('Iltimos, to\'g\'ri summa kiriting:');
        return;
      }
      cfState.amount = amount;
      cfState.step = 'SELECT_ACCOUNT';

      const kb = new InlineKeyboard()
        .text('💵 Kassa (Naqd)', 'cf_acc:CASH')
        .text('💳 Bank karta', 'cf_acc:BANK_CARD').row()
        .text('🏦 Hisob-raqam', 'cf_acc:SETTLEMENT_ACCOUNT').row()
        .text('❌ Bekor qilish', 'confirm:no');

      await ctx.reply(
        `Summa: <b>${amount.toLocaleString('ru-RU')} UZS</b> ✅\n\n` +
        `Mablag' qaysi hisobdan o'tadi?`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
      return;
    }
  }

  // If inside Warehouse Outgoing flow
  if (warehouseConversations.has(userId)) {
    const whState = warehouseConversations.get(userId)!;
    if (whState.step === 'ENTER_PRICE') {
      const cleanNum = text.replace(/[\s.,]/g, '');
      const price = parseFloat(cleanNum);
      if (isNaN(price) || price <= 0) {
        await ctx.reply('Iltimos, sotuv narxini to\'g\'ri kiriting:');
        return;
      }
      whState.salePrice = price;
      whState.step = 'ENTER_BUYER';

      await ctx.reply(
        `Sotuv narxi: <b>${price.toLocaleString('ru-RU')} UZS</b> ✅\n\n` +
        `Xaridor nomi / F.I.O. sini kiriting (masalan: Jamshid optom):`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (whState.step === 'ENTER_BUYER') {
      whState.buyerName = text;
      try {
        const deal = await prisma.deal.findUnique({ where: { id: whState.dealId } });
        if (deal) {
          const cost = Number(deal.totalPurchaseCost) || 0;
          const profit = (whState.salePrice || 0) - cost;
          const margin = whState.salePrice ? profit / whState.salePrice : 0;

          await prisma.deal.update({
            where: { id: deal.id },
            data: {
              status: DealStatus.SOLD,
              salePrice: whState.salePrice || 0,
              profit,
              marginPct: margin,
              receivedFromBuyer: whState.salePrice || 0,
              note: `Xaridor: ${text}. Telegram orqali sotildi.`,
            },
          });
        }

        clearConversations(userId);
        await ctx.reply(
          `✅ <b>Ombordan chiqim amalga oshirildi!</b>\n\n` +
          `• Tovar: <b>${whState.productName}</b>\n` +
          `• Sotuv narxi: <b>${(whState.salePrice || 0).toLocaleString('ru-RU')} UZS</b>\n` +
          `• Xaridor: <b>${text}</b>\n\n` +
          `<i>Bitim holati "Sotilgan" ga o'zgartirildi.</i>`,
          {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard()
              .text('📊 Ombor qoldig\'i', 'warehouse:stock')
              .text('⬅️ Asosiy menyu', 'menu:main'),
          }
        );
      } catch (err: any) {
        await ctx.reply('Xatolik: ' + err.message);
      }
      return;
    }
  }

  await next();
});

// ---------------- PHOTO RECEIPT HANDLER ----------------

bot.on(':photo', async (ctx) => {
  try {
    const photo = ctx.message?.photo.pop();
    const caption = ctx.message?.caption || '';
    const from = ctx.from;
    if (!photo || !from) return;

    let uzsAmount = 0;
    let currencyAmount = 0;
    let rate = 1;

    const numbers = caption.match(/\d+[\d\s.,]*/g);
    if (numbers && numbers.length > 0) {
      const num = parseFloat(numbers[0].replace(/\s/g, '').replace(',', '.'));
      if (caption.includes('$')) {
        currencyAmount = num;
        rate = 12850;
        uzsAmount = num * rate;
      } else {
        currencyAmount = num;
        uzsAmount = num;
      }
    }

    const lastDeal = await prisma.botDeal.findFirst({ orderBy: { checkNumber: 'desc' } });
    const checkNumber = (lastDeal?.checkNumber || 3644) + 1;

    const botDeal = await prisma.botDeal.create({
      data: {
        uuid: crypto.randomUUID(),
        checkNumber,
        telegramUsername: from.username || from.first_name,
        telegramUserId: BigInt(from.id),
        providerName: 'Telegram Chek',
        customerName: from.first_name,
        withdrawnLimit: uzsAmount || 1000000,
        productName: caption || 'Kassa to\'lov cheki',
      },
    });

    const payment = await prisma.botPayment.create({
      data: {
        botDealId: botDeal.id,
        checkNumber,
        operatorTgId: BigInt(from.id),
        operatorName: from.first_name,
        paymentType: caption.includes('$') ? 'Dollar' : 'So\'m',
        currencyAmount: currencyAmount || uzsAmount,
        exchangeRate: rate,
        uzsAmount: uzsAmount || 1000000,
        receiptPhotoUrl: photo.file_id,
      },
    });

    if (ioInstance) {
      ioInstance.emit('new_bot_payment', {
        payment,
        botDeal,
        message: `Yangi to'lov cheki keldi! Chek №${checkNumber} (${(uzsAmount || 1000000).toLocaleString('ru-RU')} UZS)`,
      });
    }

    await ctx.reply(
      `✅ <b>Chek qabul qilindi!</b>\n\n` +
      `• Chek raqami: <b>№${checkNumber}</b>\n` +
      `• Summa: <b>${(uzsAmount || 1000000).toLocaleString('ru-RU')} UZS</b>\n` +
      `• Holati: <i>Saytda tekshiruvga yuborildi</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().url('👁 Saytda tekshirish', 'https://finmodel-erp-uz.vercel.app/bot-payments'),
      }
    );
  } catch (err: any) {
    console.error('Bot photo error:', err);
    await ctx.reply('Chekni qabul qilishda xatolik: ' + err.message);
  }
});

// ---------------- HELPER FUNCTIONS ----------------

function clearConversations(userId: number) {
  customerConversations.delete(userId);
  cashFlowConversations.delete(userId);
  warehouseConversations.delete(userId);
}

async function startCustomerConversation(ctx: any) {
  const userId = ctx.from?.id;
  if (!userId) return;

  clearConversations(userId);
  customerConversations.set(userId, { step: 'APPLICATION' });

  const text =
    `📝 <b>Yangi mijoz cheki qo'shish (1/5)</b>\n\n` +
    `Mijoz olgan <b>Bank / Ilova</b>ni tanlang:`;

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: getApplicationsKeyboard(),
    });
  } else {
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: getApplicationsKeyboard(),
    });
  }
}

async function showBalance(ctx: any) {
  try {
    const txs = await prisma.ddsTransaction.findMany();
    let cash = 0;
    let card = 0;
    let settlement = 0;

    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'INCOME') {
        if (t.account === 'CASH') cash += amt;
        else if (t.account === 'BANK_CARD') card += amt;
        else settlement += amt;
      } else {
        if (t.account === 'CASH') cash -= amt;
        else if (t.account === 'BANK_CARD') card -= amt;
        else settlement -= amt;
      }
    }

    const totalLiquidity = cash + card + settlement;

    const msg =
      `💳 <b>Kassa va likvidlik qoldiqlari:</b>\n\n` +
      `💵 Kassa (Naqd pul): <b>${cash.toLocaleString('ru-RU')} UZS</b>\n` +
      `💳 Bank kartalar: <b>${card.toLocaleString('ru-RU')} UZS</b>\n` +
      `🏦 Hisob-raqam: <b>${settlement.toLocaleString('ru-RU')} UZS</b>\n` +
      `─────────────────────────\n` +
      `💎 <b>Jami likvidlik:</b> <b>${totalLiquidity.toLocaleString('ru-RU')} UZS</b>`;

    const kb = new InlineKeyboard()
      .text('🔄 Yangilash', 'cash_flow:balance')
      .text('⬅️ Orqaga', 'menu:cash_flow');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err: any) {
    await ctx.reply('Xatolik: ' + err.message);
  }
}

async function showStats(ctx: any) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const deals = await prisma.deal.findMany({
      where: { date: { gte: todayStart } },
    });

    const count = deals.length;
    const totalLimit = deals.reduce((s, d) => s + (Number(d.withdrawnLimit) || 0), 0);
    const totalCost = deals.reduce((s, d) => s + (Number(d.totalPurchaseCost) || 0), 0);
    const totalProfit = deals.reduce((s, d) => s + (Number(d.profit) || 0), 0);

    const msg =
      `📊 <b>Bugungi kunlik hisobot (${new Date().toLocaleDateString('uz-UZ')}):</b>\n\n` +
      `• Bitimlar soni: <b>${count} ta</b>\n` +
      `• Yechilgan limit: <b>${totalLimit.toLocaleString('ru-RU')} UZS</b>\n` +
      `• Xarid xarajati: <b>${totalCost.toLocaleString('ru-RU')} UZS</b>\n` +
      `• Kutilayotgan sof foyda: <b>${totalProfit.toLocaleString('ru-RU')} UZS</b>`;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('⬅️ Asosiy menyu', 'menu:main'),
      });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    }
  } catch (err: any) {
    await ctx.reply('Xatolik: ' + err.message);
  }
}

async function showWarehouseStock(ctx: any) {
  try {
    const stockDeals = await prisma.deal.findMany({
      where: { status: { in: ['IN_WAREHOUSE', 'IN_TRANSIT'] } },
      take: 8,
      orderBy: { date: 'desc' },
    });

    const count = await prisma.deal.count({
      where: { status: { in: ['IN_WAREHOUSE', 'IN_TRANSIT'] } },
    });

    if (stockDeals.length === 0) {
      const msg = '📦 Omborda hozircha tovarlar mavjud emas.';
      const kb = new InlineKeyboard().text('⬅️ Orqaga', 'menu:warehouse');
      if (ctx.callbackQuery) await ctx.editMessageText(msg, { reply_markup: kb });
      else await ctx.reply(msg, { reply_markup: kb });
      return;
    }

    let msg = `📦 <b>Ombor qoldig'i (Jami: ${count} ta):</b>\n\n`;
    stockDeals.forEach((d, i) => {
      const icon = d.status === 'IN_WAREHOUSE' ? '🏢' : '🚚';
      msg += `${i + 1}. ${icon} <b>${d.productName || 'Tovar'}</b> (${d.quantity} ta)\n`;
      if (d.imeiBarcode) msg += `   • IMEI: <code>${d.imeiBarcode}</code>\n`;
      msg += `   • Tannarx: ${Number(d.totalPurchaseCost).toLocaleString('ru-RU')} UZS\n\n`;
    });

    const kb = new InlineKeyboard()
      .text('📤 Ombordan chiqim', 'warehouse:outgoing')
      .text('⬅️ Orqaga', 'menu:warehouse');

    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err: any) {
    await ctx.reply('Xatolik: ' + err.message);
  }
}

async function startWarehouseOutgoing(ctx: any) {
  try {
    const stockDeals = await prisma.deal.findMany({
      where: { status: { in: ['IN_WAREHOUSE', 'IN_TRANSIT'] } },
      take: 6,
      orderBy: { date: 'desc' },
    });

    if (stockDeals.length === 0) {
      await ctx.editMessageText('Omborda chiqim qilish uchun tovar mavjud emas.', {
        reply_markup: new InlineKeyboard().text('⬅️ Orqaga', 'menu:warehouse'),
      });
      return;
    }

    const kb = new InlineKeyboard();
    stockDeals.forEach((d) => {
      kb.text(`📦 ${d.productName} (${Number(d.totalPurchaseCost).toLocaleString('ru-RU')})`, `wh_deal:${d.id}`).row();
    });
    kb.text('❌ Bekor qilish', 'confirm:no');

    await ctx.editMessageText(
      `📤 <b>Ombordan chiqim</b>\n\nChiqim qilinadigan tovarni tanlang:`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (err: any) {
    await ctx.reply('Xatolik: ' + err.message);
  }
}

export function initTelegramBot(io?: SocketIOServer) {
  if (io) ioInstance = io;
  return bot;
}
