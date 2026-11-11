import https from 'https';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { DealStatus, PaymentStatus, TransactionType, AccountType, ExpenseCategoryType } from '@prisma/client';

export const DEFAULT_SHEETS_URL =
  'https://docs.google.com/spreadsheets/d/1Xas4V79zUAOQGx0ZePPd-VwhhARE3-nsq98rL9vEvUo/edit?usp=sharing';

function extractSheetId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Google Sheets yuklab olishda xatolik: HTTP status ${res.statusCode}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

function extractVal(cell: ExcelJS.Cell | undefined): any {
  if (!cell) return null;
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    if (val instanceof Date) return val;
    const anyVal = val as any;
    if (anyVal.result !== undefined && anyVal.result !== null) return anyVal.result;
    if (anyVal.text !== undefined && anyVal.text !== null) return anyVal.text;
  }
  return val;
}

function extractNum(cell: ExcelJS.Cell | undefined): number {
  const v = extractVal(cell);
  if (v === null || v === undefined || isNaN(Number(v))) return 0;
  return Number(v);
}

function extractStr(cell: ExcelJS.Cell | undefined): string | null {
  const v = extractVal(cell);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export async function syncDealsFromGoogleSheets(customUrl?: string, localFilePath?: string) {
  let tempPath = localFilePath;

  if (!tempPath || !fs.existsSync(tempPath)) {
    const sheetUrl = customUrl || DEFAULT_SHEETS_URL;
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      throw new Error('Noto\'g\'ri Google Sheets havolasi');
    }

    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    tempPath = path.join(__dirname, `../../temp_sheets_${Date.now()}.xlsx`);

    try {
      console.log(`Google Sheets XLSX yuklab olinmoqda: ${exportUrl}`);
      await downloadFile(exportUrl, tempPath);
    } catch (dlErr) {
      console.warn('Google Sheets yuklab olishda xatolik yuz berdi, mahalliy kesh tekshirilmoqda:', dlErr);
      const fallbackInspect = path.join(__dirname, '../../temp_live_download.xlsx');
      const fallbackInspect2 = path.join(__dirname, '../../temp_sheets_inspect.xlsx');
      if (fs.existsSync(fallbackInspect)) {
        tempPath = fallbackInspect;
      } else if (fs.existsSync(fallbackInspect2)) {
        tempPath = fallbackInspect2;
      } else {
        throw dlErr;
      }
    }
  }

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tempPath);

    // Look for worksheet named 'Сделки_и_Склад' or similar
    let ws = wb.getWorksheet('Сделки_и_Склад');
    if (!ws) {
      ws = wb.worksheets.find((w) => w.name.toLowerCase().includes('сделк') || w.name.toLowerCase().includes('склад'));
    }

    if (!ws) {
      throw new Error('Google Sheets ichida "Сделки_и_Склад" varag\'i topilmadi');
    }

    console.log(`Topilgan varaq: ${ws.name}, qatorlar soni: ${ws.rowCount}`);

    // Pre-cache catalogs to minimize queries
    const existingStores = await prisma.store.findMany();
    const storeMap = new Map<string, string>(existingStores.map((s) => [s.name.toLowerCase().trim(), s.id]));

    const existingProviders = await prisma.provider.findMany();
    const providerMap = new Map<string, string>(existingProviders.map((p) => [p.name.toLowerCase().trim(), p.id]));

    const existingAgencies = await prisma.agency.findMany();
    const agencyMap = new Map<string, string>(existingAgencies.map((a) => [a.name.toLowerCase().trim(), a.id]));

    const existingAgents = await prisma.agent.findMany();
    const agentMap = new Map<string, string>(
      existingAgents.map((a) => [`${a.agencyId}:${a.name.toLowerCase().trim()}`, a.id])
    );

    const existingBuyers = await prisma.buyer.findMany();
    const buyerMap = new Map<string, string>(existingBuyers.map((b) => [b.name.toLowerCase().trim(), b.id]));

    // Parse deals
    const parsedRows: any[] = [];
    const seenDealNumbers = new Set<number>();

    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowSeq = Math.round(extractNum(row.getCell(3)));
      let dealId = Math.round(extractNum(row.getCell(4)));

      // If ID is empty but sequential № exists (like row 59), generate safe unique ID
      if (!dealId && rowSeq) {
        dealId = 8000 + rowSeq;
      }
      if (!dealId || isNaN(dealId) || dealId <= 0) continue;

      // Handle duplicate deal IDs in sheet (e.g. operator typos for rows 95, 96, 98, 99)
      if (seenDealNumbers.has(dealId)) {
        dealId = 8000 + rowSeq;
      }
      seenDealNumbers.add(dealId);

      const rawDate = extractVal(row.getCell(5));
      let dealDate = new Date();
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        dealDate = rawDate;
      } else if (typeof rawDate === 'string' && !isNaN(Date.parse(rawDate))) {
        dealDate = new Date(rawDate);
      }

      const sellerName = extractStr(row.getCell(6)) || 'Operator';
      const providerName = extractStr(row.getCell(7)) || 'Boshqa';
      const isDaftarStr = (extractStr(row.getCell(8)) || '').toLowerCase();
      const isDaftar = isDaftarStr === 'да' || isDaftarStr === 'yes' || isDaftarStr === 'ha' || isDaftarStr === 'true';

      const customerName = extractStr(row.getCell(9));
      const customerPhone1 = extractStr(row.getCell(10));
      const customerPhone2 = extractStr(row.getCell(11));
      const contractUrl = extractStr(row.getCell(12));
      const passportPhotoUrl = extractStr(row.getCell(13));
      const storeName = extractStr(row.getCell(14)) || 'Asosiy do\'kon';

      const customerLimit = extractNum(row.getCell(15));
      const withdrawnLimit = extractNum(row.getCell(16));
      const agentAmount = extractNum(row.getCell(17));
      const totalPurchaseCost = extractNum(row.getCell(18));
      const purchaseDiscountPct = extractNum(row.getCell(19));
      const agentPct = extractNum(row.getCell(20));
      const calculatedAmount = extractNum(row.getCell(21));
      const remainingLimit = extractNum(row.getCell(22));
      const differenceAmount = extractNum(row.getCell(23));

      const productName = extractStr(row.getCell(24));
      const quantity = Math.max(1, Math.round(extractNum(row.getCell(25))) || 1);
      const isActualStr = (extractStr(row.getCell(26)) || '').toLowerCase();
      const isActualDeviceSale = isActualStr === 'да' || isActualStr === 'yes' || isActualStr === 'true';
      const imeiBarcode = extractStr(row.getCell(27));

      const rawStatus = (extractStr(row.getCell(28)) || '').toLowerCase();
      let status: DealStatus = DealStatus.NEED_TO_BUY;
      if (rawStatus.includes('склад') || rawStatus.includes('omborda')) status = DealStatus.IN_WAREHOUSE;
      else if (rawStatus.includes('продан') || rawStatus.includes('sotildi')) status = DealStatus.SOLD;
      else if (rawStatus.includes('пут') || rawStatus.includes('yo\'lda')) status = DealStatus.IN_TRANSIT;
      else if (rawStatus.includes('ожида') || rawStatus.includes('kutilmoqda')) status = DealStatus.PENDING;
      else if (rawStatus.includes('поступ') || rawStatus.includes('pul tushdi')) status = DealStatus.MONEY_RECEIVED;
      else if (rawStatus.includes('не все') || rawStatus.includes('неполн') || rawStatus.includes('to\'liq emas'))
        status = DealStatus.PARTIAL_AMOUNT;

      const agencyName = extractStr(row.getCell(29));
      const agentName = extractStr(row.getCell(30));

      const extraDaftar = extractNum(row.getCell(31));
      const qodirDebt = extractNum(row.getCell(32));
      const qodirBalance = extractNum(row.getCell(34));
      const greenBazarBalance = extractNum(row.getCell(35));
      const trustBalance = extractNum(row.getCell(36));
      const totalExtraBalance = extractNum(row.getCell(37));

      const buyerName = extractStr(row.getCell(38));
      const salePrice = extractNum(row.getCell(41));
      const paidTransfer = extractNum(row.getCell(42));
      const paidCashUzs = extractNum(row.getCell(43));
      const paidCashUsd = extractNum(row.getCell(44));
      const paidBank = extractNum(row.getCell(45));
      const exchangeRate = extractNum(row.getCell(46)) || 1;
      const profit = extractNum(row.getCell(47));
      const marginPct = extractNum(row.getCell(48));
      const receivedFromBuyer = extractNum(row.getCell(49));
      const debtRemainder = extractNum(row.getCell(50));

      const rawPStatus = (extractStr(row.getCell(56)) || '').toLowerCase();
      let paymentStatus: PaymentStatus = PaymentStatus.PARTIAL;
      if (rawPStatus.includes('оплач') || rawPStatus.includes('to\'langan')) paymentStatus = PaymentStatus.PAID;
      else if (rawPStatus.includes('долг') || rawPStatus.includes('qarz')) paymentStatus = PaymentStatus.DEBT;

      const note = extractStr(row.getCell(57));

      parsedRows.push({
        dealNumber: dealId,
        date: dealDate,
        sellerName,
        providerName,
        isDaftar,
        customerName,
        customerPhone1,
        customerPhone2,
        contractUrl,
        passportPhotoUrl,
        storeName,
        customerLimit,
        withdrawnLimit,
        agentAmount,
        totalPurchaseCost,
        purchaseDiscountPct,
        agentPct,
        calculatedAmount,
        remainingLimit,
        differenceAmount,
        productName,
        quantity,
        isActualDeviceSale,
        imeiBarcode,
        status,
        agencyName,
        agentName,
        extraDaftar,
        qodirDebt,
        qodirBalance,
        greenBazarBalance,
        trustBalance,
        totalExtraBalance,
        buyerName,
        salePrice,
        paidTransfer,
        paidCashUzs,
        paidCashUsd,
        paidBank,
        exchangeRate,
        profit,
        marginPct,
        receivedFromBuyer,
        debtRemainder,
        paymentStatus,
        note,
      });
    }

    // Sort chronologically and by dealNumber
    parsedRows.sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.dealNumber - b.dealNumber;
    });

    console.log(`Tartiblangan bitimlar soni: ${parsedRows.length}`);

    // Resolve & upsert entities, then upsert deals
    let insertedCount = 0;
    for (const item of parsedRows) {
      // 1. Store
      const sKey = item.storeName.toLowerCase().trim();
      let storeId = storeMap.get(sKey);
      if (!storeId) {
        const created = await prisma.store.upsert({
          where: { name: item.storeName.trim() },
          update: {},
          create: { name: item.storeName.trim() },
        });
        storeId = created.id;
        storeMap.set(sKey, storeId);
      }

      // 2. Provider
      const pKey = item.providerName.toLowerCase().trim();
      let providerId = providerMap.get(pKey);
      if (!providerId) {
        const created = await prisma.provider.upsert({
          where: { name: item.providerName.trim() },
          update: {},
          create: { name: item.providerName.trim() },
        });
        providerId = created.id;
        providerMap.set(pKey, providerId);
      }

      // 3. Agency & Agent
      let agencyId: string | null = null;
      let agentId: string | null = null;
      if (item.agencyName) {
        const aKey = item.agencyName.toLowerCase().trim();
        agencyId = agencyMap.get(aKey) || null;
        if (!agencyId) {
          const created = await prisma.agency.upsert({
            where: { name: item.agencyName.trim() },
            update: {},
            create: { name: item.agencyName.trim() },
          });
          agencyId = created.id;
          agencyMap.set(aKey, agencyId);
        }

        if (item.agentName && agencyId) {
          const agtKey = `${agencyId}:${item.agentName.toLowerCase().trim()}`;
          agentId = agentMap.get(agtKey) || null;
          if (!agentId) {
            let agt = await prisma.agent.findFirst({
              where: { agencyId, name: item.agentName.trim() },
            });
            if (!agt) {
              agt = await prisma.agent.create({
                data: { agencyId, name: item.agentName.trim() },
              });
            }
            agentId = agt.id;
            agentMap.set(agtKey, agentId);
          }
        }
      }

      // 4. Buyer
      let buyerId: string | null = null;
      if (item.buyerName) {
        const bKey = item.buyerName.toLowerCase().trim();
        buyerId = buyerMap.get(bKey) || null;
        if (!buyerId) {
          const created = await prisma.buyer.upsert({
            where: { name: item.buyerName.trim() },
            update: {},
            create: { name: item.buyerName.trim() },
          });
          buyerId = created.id;
          buyerMap.set(bKey, buyerId);
        }
      }

      // 5. Upsert Deal
      await prisma.deal.upsert({
        where: { dealNumber: item.dealNumber },
        update: {
          date: item.date,
          sellerName: item.sellerName,
          providerId,
          isDaftar: item.isDaftar,
          customerName: item.customerName,
          customerPhone1: item.customerPhone1,
          customerPhone2: item.customerPhone2,
          contractUrl: item.contractUrl,
          passportPhotoUrl: item.passportPhotoUrl,
          storeId,
          customerLimit: item.customerLimit,
          withdrawnLimit: item.withdrawnLimit,
          agentAmount: item.agentAmount,
          totalPurchaseCost: item.totalPurchaseCost,
          purchaseDiscountPct: item.purchaseDiscountPct,
          agentPct: item.agentPct,
          calculatedAmount: item.calculatedAmount,
          remainingLimit: item.remainingLimit,
          differenceAmount: item.differenceAmount,
          productName: item.productName,
          quantity: item.quantity,
          isActualDeviceSale: item.isActualDeviceSale,
          imeiBarcode: item.imeiBarcode,
          status: item.status,
          agencyId,
          agentId,
          extraDaftar: item.extraDaftar,
          qodirDebt: item.qodirDebt,
          qodirBalance: item.qodirBalance,
          greenBazarBalance: item.greenBazarBalance,
          trustBalance: item.trustBalance,
          totalExtraBalance: item.totalExtraBalance,
          buyerId,
          salePrice: item.salePrice,
          paidTransfer: item.paidTransfer,
          paidCashUzs: item.paidCashUzs,
          paidCashUsd: item.paidCashUsd,
          paidBank: item.paidBank,
          exchangeRate: item.exchangeRate,
          profit: item.profit,
          marginPct: item.marginPct,
          receivedFromBuyer: item.receivedFromBuyer,
          debtRemainder: item.debtRemainder,
          paymentStatus: item.paymentStatus,
          note: item.note,
        },
        create: {
          dealNumber: item.dealNumber,
          date: item.date,
          sellerName: item.sellerName,
          providerId,
          isDaftar: item.isDaftar,
          customerName: item.customerName,
          customerPhone1: item.customerPhone1,
          customerPhone2: item.customerPhone2,
          contractUrl: item.contractUrl,
          passportPhotoUrl: item.passportPhotoUrl,
          storeId,
          customerLimit: item.customerLimit,
          withdrawnLimit: item.withdrawnLimit,
          agentAmount: item.agentAmount,
          totalPurchaseCost: item.totalPurchaseCost,
          purchaseDiscountPct: item.purchaseDiscountPct,
          agentPct: item.agentPct,
          calculatedAmount: item.calculatedAmount,
          remainingLimit: item.remainingLimit,
          differenceAmount: item.differenceAmount,
          productName: item.productName,
          quantity: item.quantity,
          isActualDeviceSale: item.isActualDeviceSale,
          imeiBarcode: item.imeiBarcode,
          status: item.status,
          agencyId,
          agentId,
          extraDaftar: item.extraDaftar,
          qodirDebt: item.qodirDebt,
          qodirBalance: item.qodirBalance,
          greenBazarBalance: item.greenBazarBalance,
          trustBalance: item.trustBalance,
          totalExtraBalance: item.totalExtraBalance,
          buyerId,
          salePrice: item.salePrice,
          paidTransfer: item.paidTransfer,
          paidCashUzs: item.paidCashUzs,
          paidCashUsd: item.paidCashUsd,
          paidBank: item.paidBank,
          exchangeRate: item.exchangeRate,
          profit: item.profit,
          marginPct: item.marginPct,
          receivedFromBuyer: item.receivedFromBuyer,
          debtRemainder: item.debtRemainder,
          paymentStatus: item.paymentStatus,
          note: item.note,
        },
      });
      insertedCount++;
    }

    // Save sync settings
    const minDeal = parsedRows[0]?.dealNumber;
    const maxDeal = parsedRows[parsedRows.length - 1]?.dealNumber;
    const minDate = parsedRows[0]?.date?.toISOString().split('T')[0];
    const maxDate = parsedRows[parsedRows.length - 1]?.date?.toISOString().split('T')[0];

    const effectiveSheetUrl = customUrl || DEFAULT_SHEETS_URL;
    await prisma.appSetting.upsert({
      where: { key: 'google_sheets_url' },
      update: { value: effectiveSheetUrl },
      create: { key: 'google_sheets_url', value: effectiveSheetUrl, description: 'Ulangan Google Sheets havolasi' },
    });

    await prisma.appSetting.upsert({
      where: { key: 'google_sheets_last_sync' },
      update: { value: new Date().toISOString() },
      create: {
        key: 'google_sheets_last_sync',
        value: new Date().toISOString(),
        description: 'Oxirgi muvaffaqiyatli sinxronizatsiya vaqti',
      },
    });

    return {
      success: true,
      count: insertedCount,
      minDeal,
      maxDeal,
      dateRange: `${minDate} - ${maxDate}`,
      sheetName: ws.name,
      lastSync: new Date().toISOString(),
    };
  } finally {
    if (tempPath && tempPath.includes('temp_sheets_') && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {}
    }
  }
}

export async function pushDealToGoogleSheets(deal: any) {
  try {
    const scriptSetting = await prisma.appSetting.findUnique({
      where: { key: 'google_apps_script_url' },
    });
    if (!scriptSetting || !scriptSetting.value || !scriptSetting.value.startsWith('http')) {
      return { success: false, reason: 'Apps Script URL sozlanmagan' };
    }

    let statusText = 'Надо покупать';
    switch (deal.status) {
      case 'IN_WAREHOUSE': statusText = 'На складе'; break;
      case 'SOLD': statusText = 'Продано'; break;
      case 'IN_TRANSIT': statusText = 'В пути'; break;
      case 'PENDING': statusText = 'Ожидается'; break;
      case 'MONEY_RECEIVED': statusText = 'Денги поступило'; break;
      case 'PARTIAL_AMOUNT': statusText = 'Не все сумма'; break;
      default: statusText = 'Надо покупать';
    }

    let pStatusText = 'Частично';
    if (deal.paymentStatus === 'PAID') pStatusText = 'Оплачено';
    else if (deal.paymentStatus === 'DEBT') pStatusText = 'Долг';

    const payload = {
      action: 'upsert_deal',
      deal: {
        dealNumber: deal.dealNumber,
        date: deal.date ? new Date(deal.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        sellerName: deal.sellerName || 'Operator',
        providerName: deal.provider?.name || '',
        isDaftar: deal.isDaftar ? 'Да' : 'Нет',
        customerName: deal.customerName || '',
        customerPhone1: deal.customerPhone1 || '',
        customerPhone2: deal.customerPhone2 || '',
        contractUrl: deal.contractUrl || '',
        passportPhotoUrl: deal.passportPhotoUrl || '',
        storeName: deal.store?.name || '',
        customerLimit: Number(deal.customerLimit) || 0,
        withdrawnLimit: Number(deal.withdrawnLimit) || 0,
        agentAmount: Number(deal.agentAmount) || 0,
        totalPurchaseCost: Number(deal.totalPurchaseCost) || 0,
        purchaseDiscountPct: Number(deal.purchaseDiscountPct) || 0,
        agentPct: Number(deal.agentPct) || 0,
        calculatedAmount: Number(deal.calculatedAmount) || 0,
        remainingLimit: Number(deal.remainingLimit) || 0,
        differenceAmount: Number(deal.differenceAmount) || 0,
        productName: deal.productName || '',
        quantity: deal.quantity || 1,
        isActualDeviceSale: deal.isActualDeviceSale ? 'Да' : 'Нет',
        imeiBarcode: deal.imeiBarcode || '',
        statusText,
        agencyName: deal.agency?.name || '',
        agentName: deal.agent?.name || '',
        extraDaftar: Number(deal.extraDaftar) || 0,
        qodirDebt: Number(deal.qodirDebt) || 0,
        qodirBalance: Number(deal.qodirBalance) || 0,
        greenBazarBalance: Number(deal.greenBazarBalance) || 0,
        trustBalance: Number(deal.trustBalance) || 0,
        totalExtraBalance: Number(deal.totalExtraBalance) || 0,
        buyerName: deal.buyer?.name || '',
        salePrice: Number(deal.salePrice) || 0,
        paidTransfer: Number(deal.paidTransfer) || 0,
        paidCashUzs: Number(deal.paidCashUzs) || 0,
        paidCashUsd: Number(deal.paidCashUsd) || 0,
        paidBank: Number(deal.paidBank) || 0,
        exchangeRate: Number(deal.exchangeRate) || 1,
        profit: Number(deal.profit) || 0,
        marginPct: Number(deal.marginPct) || 0,
        receivedFromBuyer: Number(deal.receivedFromBuyer) || 0,
        debtRemainder: Number(deal.debtRemainder) || 0,
        paymentStatus: pStatusText,
        note: deal.note || '',
      },
    };

    const res = await fetch(scriptSetting.value, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    console.log(`Pushed deal #${deal.dealNumber} to Google Sheets, status: ${res.status}`);
    return { success: true, status: res.status };
  } catch (err: any) {
    console.error('Error pushing deal to Google Sheets:', err.message);
    return { success: false, error: err.message };
  }
}

export async function syncDdsFromGoogleSheets(customUrl?: string) {
  const sheetUrl = customUrl || DEFAULT_SHEETS_URL;
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) {
    throw new Error('Noto\'g\'ri Google Sheets havolasi');
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const tempPath = path.join(__dirname, `../../temp_sheets_dds_${Date.now()}.xlsx`);

  try {
    console.log(`[DDS Sync] Google Sheets XLSX yuklab olinmoqda: ${exportUrl}`);
    await downloadFile(exportUrl, tempPath);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(tempPath);

    let ws = wb.getWorksheet('Транзакции_ДДС');
    if (!ws) {
      ws = wb.worksheets.find(
        (w) => w.name.toLowerCase().includes('транзакци') || w.name.toLowerCase().includes('ддс')
      );
    }

    if (!ws) {
      throw new Error('Google Sheets ichida "Транзакции_ДДС" varag\'i topilmadi');
    }

    console.log(`[DDS Sync] Topilgan varaq: ${ws.name}, qatorlar soni: ${ws.rowCount}`);

    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const createdById = adminUser?.id || null;

    const items: any[] = [];
    let importedCount = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    for (let r = 7; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const txId = extractVal(row.getCell(1));
      const dtVal = extractVal(row.getCell(2));
      const typeStr = String(extractVal(row.getCell(3)) || '').trim().toLowerCase();
      const accountStr = String(extractVal(row.getCell(4)) || '').trim().toLowerCase();
      const expenseTypeStr = String(extractVal(row.getCell(5)) || '').trim().toLowerCase();
      const categoryStr = String(extractVal(row.getCell(6)) || '').trim();
      const sourceStr = String(extractVal(row.getCell(7)) || '').trim();
      const rawAmt = extractVal(row.getCell(8));
      const amount = Number(rawAmt) || 0;
      const desc = extractVal(row.getCell(9));

      if (!txId && amount <= 0) continue;

      let type: TransactionType = TransactionType.EXPENSE;
      if (typeStr.includes('доход') || typeStr.includes('приход') || typeStr.includes('kirim')) {
        type = TransactionType.INCOME;
      }

      let account: AccountType = AccountType.CASH;
      if (accountStr.includes('карта') || accountStr.includes('card')) {
        account = AccountType.BANK_CARD;
      } else if (accountStr.includes('расчет') || accountStr.includes('р/с') || accountStr.includes('bank')) {
        account = AccountType.SETTLEMENT_ACCOUNT;
      }

      let expenseType: ExpenseCategoryType = ExpenseCategoryType.OPEX;
      if (type === TransactionType.INCOME) {
        expenseType = ExpenseCategoryType.INCOME_TRANSFER;
      } else if (
        expenseTypeStr.includes('cogs') ||
        expenseTypeStr.includes('перемен') ||
        categoryStr.toLowerCase().includes('выкуп') ||
        categoryStr.toLowerCase().includes('tovar')
      ) {
        expenseType = ExpenseCategoryType.COGS;
      } else if (expenseTypeStr.includes('opex') || expenseTypeStr.includes('операцион')) {
        expenseType = ExpenseCategoryType.OPEX;
      }

      let dateTime = new Date();
      if (dtVal) {
        if (dtVal instanceof Date) {
          dateTime = dtVal;
        } else {
          const parsed = new Date(dtVal);
          if (!isNaN(parsed.getTime())) dateTime = parsed;
        }
      }

      const txNumber = txId ? String(txId).trim() : `TX-${1000 + r}`;

      items.push({
        txNumber,
        dateTime,
        type,
        account,
        expenseType,
        categoryName: categoryStr || (type === TransactionType.INCOME ? 'Tushum' : 'Boshqa xarajat'),
        sourcePerson: sourceStr || 'Hasan',
        amount,
        description: desc ? String(desc).trim() : null,
        createdById,
      });

      if (type === TransactionType.INCOME) {
        incomeCount++;
        totalIncome += amount;
      } else {
        expenseCount++;
        totalExpense += amount;
      }
    }

    if (items.length > 0) {
      const txNumbers = items.map((i) => i.txNumber);
      await prisma.$transaction([
        prisma.ddsTransaction.deleteMany({
          where: { txNumber: { in: txNumbers } },
        }),
        prisma.ddsTransaction.createMany({
          data: items,
        }),
      ]);
    }
    importedCount = items.length;

    console.log(`[DDS Sync tugadi] Jami ${importedCount} ta DDS tranzaksiya yuklandi.`);
    return {
      success: true,
      importedCount,
      incomeCount,
      expenseCount,
      totalIncome,
      totalExpense,
      netCashflow: totalIncome - totalExpense,
      sheetName: ws.name,
    };
  } finally {
    if (tempPath && tempPath.includes('temp_sheets_') && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (e) {}
    }
  }
}
