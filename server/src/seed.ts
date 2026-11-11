import { PrismaClient, Role, DealStatus, PaymentStatus, TransactionType, AccountType, ExpenseCategoryType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Database Seeding ---');

  // 1. Create Default Users for ALL 10 Roles in the TZ
  const usersToSeed = [
    { username: 'admin', fullName: 'Bosh Administrator', pass: 'admin123', role: Role.ADMIN },
    { username: 'moliya', fullName: 'Moliya Direktori / Bosh Buxgalter', pass: 'moliya123', role: Role.CFO },
    { username: 'ops_rahbar', fullName: 'Operatsion Rahbar', pass: 'ops123', role: Role.COO },
    { username: 'cc_rahbar', fullName: 'Koll-markaz Rahbari (Jahongir)', pass: 'cc123', role: Role.CALL_CENTER_HEAD },
    { username: 'cc_xodim', fullName: 'Koll-markaz Xodimi (Shahzoda)', pass: 'cc123', role: Role.CALL_CENTER_AGENT },
    { username: 'operator', fullName: 'Katta Operator (Asadbek)', pass: 'operator123', role: Role.OPERATOR },
    { username: 'omborchi', fullName: 'Bosh Omborchi (Baxtiyor)', pass: 'ombor123', role: Role.STOREKEEPER },
    { username: 'sotuvchi', fullName: 'Katta Sotuvchi (Sardor)', pass: 'sotuv123', role: Role.SELLER },
    { username: 'hr_manager', fullName: 'HR va Tabel Mas\'uli (Nilufar)', pass: 'hr123', role: Role.HR_MANAGER },
    { username: 'kuzatuvchi', fullName: 'Nazoratchi / Investor', pass: 'viewer123', role: Role.VIEWER },
    { username: 'manager', fullName: 'Operatsion Menejer', pass: 'manager123', role: Role.MANAGER },
    { username: 'kassir', fullName: 'Kassir', pass: 'kassir123', role: Role.CASHIER },
  ];

  for (const u of usersToSeed) {
    const hash = await bcrypt.hash(u.pass, 10);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { role: u.role, fullName: u.fullName },
      create: {
        username: u.username,
        fullName: u.fullName,
        passwordHash: hash,
        role: u.role,
        isActive: true,
      },
    });
  }

  const adminUser = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

  // 2. Default App Settings
  const defaultSettings = [
    { key: 'base_check', value: '10000000', description: 'Asosiy chek summasi (UZS)' },
    { key: 'wholesale_split', value: '0.50', description: 'Ulgurji savdo ulushi (50%)' },
    { key: 'retail_split', value: '0.50', description: 'Chakana savdo ulushi (50%)' },
    { key: 'wholesale_coef', value: '0.85', description: 'Ulgurji narx koeffitsiyenti (15% chegirma)' },
    { key: 'retail_coef', value: '0.95', description: 'Chakana narx koeffitsiyenti (5% chegirma)' },
    { key: 'logistics_per_unit', value: '50000', description: 'Bitta qurilma logistika xarajati (UZS)' },
    { key: 'cac_per_unit', value: '250000', description: 'Bitta qurilma reklama / marketing xarajati (UZS)' },
    { key: 'fot_m1', value: '12000000', description: '1-oy FOT xarajati (UZS)' },
    { key: 'fot_m_mid', value: '16000000', description: 'O\'rta bosqich FOT (>40 bitim)' },
    { key: 'fot_m_high', value: '20000000', description: 'Yuqori bosqich FOT (>55 bitim)' },
    { key: 'office_rent', value: '6000000', description: 'Oylik ofis ijarasi (UZS)' },
    { key: 'telecom_crm', value: '2500000', description: 'Aloqa, CRM va internet xarajati (UZS)' },
    { key: 'admin_expenses', value: '2000000', description: 'Ma\'muriy va bank xarajatlari (UZS)' },
    { key: 'initial_cash', value: '100000000', description: 'Boshlang\'ich kassa qoldig\'i (UZS)' },
    { key: 'fixed_assets', value: '5000000', description: 'Asosiy vositalar qiymati (UZS)' },
    { key: 'charter_capital', value: '35000000', description: 'Ustav / kiritilgan kapital (UZS)' },
    { key: 'investor_loan', value: '20000000', description: 'Investor qarzi (UZS)' },
    { key: 'correction_o2', value: '20000000', description: 'O2 qatori tuzatish summasi (UZS)' },
    { key: 'correction_ad2', value: '105544000', description: 'AD2 qatori tuzatish summasi (UZS)' },
  ];

  for (const s of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }

  // 3. Partners (Sheriklar)
  const partners = ['Хасан', 'Кодир', 'Hasan', 'Qodir'];
  for (const pName of partners) {
    await prisma.partner.upsert({
      where: { name: pName },
      update: {},
      create: { name: pName },
    });
  }

  // Read exported json data
  const rawData = fs.readFileSync(path.join(__dirname, '../seed_data.json'), 'utf-8');
  const data = JSON.parse(rawData);

  // 4. Stores, Providers, Agencies, Agents, Buyers
  console.log('Seeding stores, providers, agencies, and buyers...');
  const storeMap = new Map<string, string>();
  const providerMap = new Map<string, string>();
  const agencyMap = new Map<string, string>();
  const agentMap = new Map<string, string>();
  const buyerMap = new Map<string, string>();

  // Collect unique entities
  for (const d of data.deals) {
    const sName = d.storeName?.trim() || 'Asosiy do\'kon';
    if (!storeMap.has(sName)) {
      const store = await prisma.store.upsert({
        where: { name: sName },
        update: {},
        create: { name: sName },
      });
      storeMap.set(sName, store.id);
    }

    const pName = d.providerName?.trim() || 'Boshqa';
    if (!providerMap.has(pName)) {
      const isDaftar = ['imanium', 'imanum'].includes(pName.toLowerCase());
      const prov = await prisma.provider.upsert({
        where: { name: pName },
        update: {},
        create: { name: pName, isDaftarDefault: isDaftar },
      });
      providerMap.set(pName, prov.id);
    }

    const agcName = d.agencyName?.trim();
    if (agcName && !agencyMap.has(agcName)) {
      const agc = await prisma.agency.upsert({
        where: { name: agcName },
        update: {},
        create: { name: agcName },
      });
      agencyMap.set(agcName, agc.id);
    }

    const agtName = d.agentName?.trim();
    if (agtName && agcName && !agentMap.has(`${agcName}:${agtName}`)) {
      const agcId = agencyMap.get(agcName)!;
      let agt = await prisma.agent.findFirst({
        where: { agencyId: agcId, name: agtName },
      });
      if (!agt) {
        agt = await prisma.agent.create({
          data: { agencyId: agcId, name: agtName },
        });
      }
      agentMap.set(`${agcName}:${agtName}`, agt.id);
    }

    const bName = d.buyerName?.trim();
    if (bName && !buyerMap.has(bName)) {
      const buyer = await prisma.buyer.upsert({
        where: { name: bName },
        update: {},
        create: { name: bName },
      });
      buyerMap.set(bName, buyer.id);
    }
  }

  // Add Commission Rules
  const commissionRules = [
    { name: 'Green Bazar Store Rule', storeName: 'Green bazar', ratePercent: 0.35, priority: 10 },
    { name: 'Qodir aka Store Rule', storeName: 'Qodir aka', ratePercent: 0.22, priority: 10 },
    { name: 'Alif Online / Variant Rule', providerName: 'Alif online', ratePercent: 0.27, priority: 5 },
    { name: 'Variant Provider Rule', providerName: 'Variant', ratePercent: 0.27, priority: 5 },
    { name: 'Imanium Provider Rule', providerName: 'Imanium', ratePercent: 0.22, priority: 5 },
    { name: 'Alif Offline Rule', providerName: 'Alif offline', ratePercent: 0.22, priority: 5 },
    { name: 'Alif Nasiya Rule', providerName: 'Alif nasiya', ratePercent: 0.22, priority: 5 },
    { name: 'Payme Nasiya Rule', providerName: 'Payme', ratePercent: 0.20, priority: 5 },
    { name: 'Trust Rule', providerName: 'Trust', ratePercent: 0.16, priority: 5 },
  ];

  for (const cr of commissionRules) {
    let storeId: string | null = null;
    let providerId: string | null = null;

    if (cr.storeName && storeMap.has(cr.storeName)) {
      storeId = storeMap.get(cr.storeName)!;
    }
    if (cr.providerName && providerMap.has(cr.providerName)) {
      providerId = providerMap.get(cr.providerName)!;
    }

    await prisma.commissionRule.create({
      data: {
        name: cr.name,
        storeId,
        providerId,
        ratePercent: cr.ratePercent,
        priority: cr.priority,
        isActive: true,
      },
    });
  }

  // 5. Insert Deals
  console.log(`Inserting ${data.deals.length} deals...`);
  for (const d of data.deals) {
    const sName = d.storeName?.trim() || 'Asosiy do\'kon';
    const pName = d.providerName?.trim() || 'Boshqa';
    const storeId = storeMap.get(sName)!;
    const providerId = providerMap.get(pName)!;
    const agcId = d.agencyName ? agencyMap.get(d.agencyName.trim()) : null;
    const agtId = (d.agencyName && d.agentName) ? agentMap.get(`${d.agencyName.trim()}:${d.agentName.trim()}`) : null;
    const bId = d.buyerName ? buyerMap.get(d.buyerName.trim()) : null;

    // Map status enum
    let status: DealStatus = DealStatus.NEED_TO_BUY;
    const rawStatus = (d.status || '').toLowerCase();
    if (rawStatus.includes('склад') || rawStatus.includes('omborda')) status = DealStatus.IN_WAREHOUSE;
    else if (rawStatus.includes('продан') || rawStatus.includes('sotilgan')) status = DealStatus.SOLD;
    else if (rawStatus.includes('пут') || rawStatus.includes('yo\'lda')) status = DealStatus.IN_TRANSIT;
    else if (rawStatus.includes('ожида') || rawStatus.includes('kutilmoqda')) status = DealStatus.PENDING;
    else if (rawStatus.includes('поступ') || rawStatus.includes('pul tushdi')) status = DealStatus.MONEY_RECEIVED;
    else if (rawStatus.includes('неполн') || rawStatus.includes('to\'liq emas')) status = DealStatus.PARTIAL_AMOUNT;

    let pStatus: PaymentStatus = PaymentStatus.PARTIAL;
    const rawPStatus = (d.paymentStatus || '').toLowerCase();
    if (rawPStatus.includes('оплач') || rawPStatus.includes('to\'langan')) pStatus = PaymentStatus.PAID;
    else if (rawPStatus.includes('долг') || rawPStatus.includes('qarz')) pStatus = PaymentStatus.DEBT;

    await prisma.deal.upsert({
      where: { dealNumber: d.dealNumber },
      update: {},
      create: {
        dealNumber: d.dealNumber,
        date: d.date ? new Date(d.date) : new Date(),
        sellerName: d.sellerName || 'Operator',
        providerId,
        isDaftar: d.isDaftar,
        customerName: d.customerName || null,
        customerPhone1: d.customerPhone1 || null,
        customerPhone2: d.customerPhone2 || null,
        contractUrl: d.contractUrl || null,
        passportPhotoUrl: d.passportPhotoUrl || null,
        storeId,
        customerLimit: d.customerLimit,
        withdrawnLimit: d.withdrawnLimit,
        agentAmount: d.agentAmount,
        totalPurchaseCost: d.totalPurchaseCost,
        purchaseDiscountPct: d.purchaseDiscountPct,
        agentPct: d.agentPct,
        calculatedAmount: d.calculatedAmount,
        remainingLimit: d.remainingLimit,
        differenceAmount: d.differenceAmount,
        isActualDeviceSale: d.isActualDeviceSale,
        productName: d.productName || null,
        quantity: d.quantity || 1,
        imeiBarcode: d.imeiBarcode || null,
        status,
        agencyId: agcId || null,
        agentId: agtId || null,
        extraDaftar: d.extraDaftar,
        qodirDebt: d.qodirDebt,
        qodirBalance: d.qodirBalance,
        greenBazarBalance: d.greenBazarBalance,
        trustBalance: d.trustBalance,
        totalExtraBalance: d.totalExtraBalance,
        buyerId: bId || null,
        salePrice: d.salePrice,
        paidTransfer: d.paidTransfer,
        paidCashUzs: d.paidCashUzs,
        paidCashUsd: d.paidCashUsd,
        paidBank: d.paidBank,
        exchangeRate: d.exchangeRate || 1,
        profit: d.profit,
        marginPct: d.marginPct,
        receivedFromBuyer: d.receivedFromBuyer,
        debtRemainder: d.debtRemainder,
        paymentStatus: pStatus,
        note: d.note || null,
        createdById: adminUser.id,
      },
    });
  }

  // 6. Insert DDS Transactions
  console.log(`Inserting ${data.transactions.length} transactions...`);
  for (const tx of data.transactions) {
    let tType: TransactionType = TransactionType.EXPENSE;
    if (tx.type?.toLowerCase().includes('доход') || tx.type?.toLowerCase().includes('daromad')) {
      tType = TransactionType.INCOME;
    }

    let acc: AccountType = AccountType.CASH;
    const rawAcc = (tx.account || '').toLowerCase();
    if (rawAcc.includes('карт') || rawAcc.includes('karta')) acc = AccountType.BANK_CARD;
    else if (rawAcc.includes('счет') || rawAcc.includes('hisob')) acc = AccountType.SETTLEMENT_ACCOUNT;

    let expType: ExpenseCategoryType = ExpenseCategoryType.OPEX;
    const rawExp = (tx.expenseType || '').toLowerCase();
    if (rawExp.includes('cogs') || rawExp.includes('перемен')) expType = ExpenseCategoryType.COGS;
    else if (rawExp.includes('доход') || rawExp.includes('перевод')) expType = ExpenseCategoryType.INCOME_TRANSFER;

    await prisma.ddsTransaction.upsert({
      where: { txNumber: tx.txNumber },
      update: {},
      create: {
        txNumber: tx.txNumber,
        dateTime: tx.dateTime ? new Date(tx.dateTime) : new Date(),
        type: tType,
        account: acc,
        expenseType: expType,
        categoryName: tx.categoryName || 'Boshqa xarajat',
        sourcePerson: tx.sourcePerson || 'Hasan',
        amount: tx.amount,
        description: tx.description || null,
        createdById: adminUser.id,
      },
    });
  }

  // 7. Insert BotOperatorReport (БОТ ТР)
  console.log(`Inserting ${data.botReports.length} BOT TR records...`);
  for (const b of data.botReports) {
    await prisma.botOperatorReport.create({
      data: {
        agentName: b.agentName,
        date: b.date ? new Date(b.date) : new Date(),
        operatorName: b.operatorName,
        appName: b.appName,
        calculatedPct: b.calculatedPct,
        productName: b.productName,
        actualPrice: b.actualPrice,
        purchasePrice: b.purchasePrice,
        paidAmount: b.paidAmount,
        profit: b.profit,
        storeName: b.storeName,
        checkNumber: b.checkNumber || null,
        responsible: b.responsible || null,
      },
    });
  }

  // 8. Insert Debts (Лист8)
  console.log(`Inserting ${data.debts.length} debt records...`);
  for (const db of data.debts) {
    await prisma.debtRecord.create({
      data: {
        debtorName: db.debtorName,
        roleDescription: db.roleDescription || null,
        telegram: db.telegram || null,
        contactPhone: db.contactPhone || null,
        amountUsd: db.amountUsd,
        amountUzs: db.amountUzs,
        remainingAmount: db.remainingAmount,
        note: db.note || null,
        weOwe: db.weOwe,
        isConfirmed: db.isConfirmed,
        debtReason: db.debtReason || null,
        contractDate: db.contractDate ? new Date(db.contractDate) : null,
        repaymentDate: db.repaymentDate ? new Date(db.repaymentDate) : null,
      },
    });
  }

  // 9. Checklist (Прием передача)
  console.log(`Inserting ${data.checklist.length} checklist items...`);
  for (const c of data.checklist) {
    await prisma.handoverChecklist.create({
      data: {
        orderNum: c.orderNum,
        title: c.title,
        comment: c.comment || null,
        status: c.status,
        actDone: c.actDone,
        applicationTaken: c.applicationTaken,
      },
    });
  }

  // 10. Staff KPI Plans (Лист5)
  console.log(`Inserting ${data.kpiPlans.length} KPI plans...`);
  for (const k of data.kpiPlans) {
    await prisma.staffKPIPlan.create({
      data: {
        roleName: k.roleName,
        reportType: k.reportType,
        reportFormat: k.reportFormat,
        kpiDetails: k.kpiDetails,
      },
    });
  }

  // 11. Daily Accounting Entries
  console.log(`Inserting ${data.dailyEntries.length} daily entries...`);
  for (const de of data.dailyEntries) {
    await prisma.dailyAccountingEntry.upsert({
      where: {
        yearMonth_dayNumber_providerCode: {
          yearMonth: de.yearMonth,
          dayNumber: de.dayNumber,
          providerCode: de.providerCode,
        },
      },
      update: { dealCount: de.dealCount },
      create: {
        yearMonth: de.yearMonth,
        dayNumber: de.dayNumber,
        providerCode: de.providerCode,
        dealCount: de.dealCount,
      },
    });
  }

  // 12. Seed Call Center Teams from TZ 5.1
  console.log('Seeding Call Center Teams (TZ 5.1)...');
  await prisma.callCenterTeam.upsert({
    where: { leaderName: 'Jahongir' },
    update: { members: 'Shahzoda, Hosila, Nazokat, Gulnur, Nargiza, Hasan, Muyassar, Shahlo, Muborak, Marjona, Sitora' },
    create: {
      leaderName: 'Jahongir',
      members: 'Shahzoda, Hosila, Nazokat, Gulnur, Nargiza, Hasan, Muyassar, Shahlo, Muborak, Marjona, Sitora',
      isActive: true,
    },
  });

  await prisma.callCenterTeam.upsert({
    where: { leaderName: 'Farida' },
    update: { members: 'Farida, Muslima' },
    create: {
      leaderName: 'Farida',
      members: 'Farida, Muslima',
      isActive: true,
    },
  });

  // 13. Seed TZ Providers (TZ 4.1)
  console.log('Seeding TZ Providers (TZ 4.1)...');
  const tzProviders = [
    { name: 'Imanium', defaultDiscount: 25, isDaftarDefault: true },
    { name: 'Alif offline', defaultDiscount: 28, isDaftarDefault: false },
    { name: 'Alif online', defaultDiscount: 27, isDaftarDefault: false },
    { name: 'Infin Bank', defaultDiscount: 30, isDaftarDefault: false },
    { name: 'Payme', defaultDiscount: 20, isDaftarDefault: false },
    { name: 'Trust 1', defaultDiscount: 16, isDaftarDefault: false },
    { name: 'Variant', defaultDiscount: 35, isDaftarDefault: false },
    { name: 'Paylater online', defaultDiscount: 25, isDaftarDefault: false },
    { name: 'Paylater offline', defaultDiscount: 26, isDaftarDefault: false },
  ];
  for (const p of tzProviders) {
    await prisma.provider.upsert({
      where: { name: p.name },
      update: { defaultDiscount: p.defaultDiscount, isDaftarDefault: p.isDaftarDefault },
      create: p,
    });
  }

  // 14. Seed TZ Partners (TZ 4.2)
  console.log('Seeding TZ Partners (TZ 4.2)...');
  const tzPartners = [
    'Qodir aka', 'Qodir oka', 'Planet phone', 'Denov', 'Angren', 'Green bazar',
    'Samarqand', 'Media park Angren', 'Trust', 'Jizzax', 'Gorkiy',
    'Variant Shahlo', 'Shaxlo', 'Chilonzor', 'Novza', 'Birzum', 'Xusanboy'
  ];
  for (const s of tzPartners) {
    await prisma.store.upsert({
      where: { name: s },
      update: {},
      create: { name: s },
    });
  }

  // 15. Seed Sample Employees for HR Module (TZ 12) - O'chirilgan
  // console.log('Seeding Sample Employees (TZ 12)...');


  // 16. Seed Sample Leads (TZ 5) - O'chirilgan (avtomatik kiritilmasligi uchun)
  // console.log('Seeding Sample CRM Leads (TZ 5)...');


  console.log('--- Database Seeding Completed Successfully! ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
