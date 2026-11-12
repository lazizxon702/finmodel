// Google Sheets ichiga joylanadigan Apps Script matni (foydalanuvchi nusxalab oladi).
// Bu UI matni emas — skript kodi; varaq nomi Sheets faylidagi haqiqiy nom bilan bir xil bo'lishi shart.

/** Google Sheets'dagi bitimlar varag'ining nomi (o'zgartirilmaydi) */
export const DEALS_SHEET_NAME = 'Сделки_и_Склад';

export const DEALS_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1Xas4V79zUAOQGx0ZePPd-VwhhARE3-nsq98rL9vEvUo/edit?usp=sharing';

const WEBHOOK_PLACEHOLDER = 'PASTE_WEBHOOK_URL_FROM_ADMIN_ACCOUNT';

export function buildAppsScript(webhookUrl: string): string {
  return `/**
 * FinModel ERP <-> Google Sheets two-way sync script
 */

const WEBSITE_WEBHOOK_URL = '${webhookUrl || WEBHOOK_PLACEHOLDER}';
const SHEET_NAME = '${DEALS_SHEET_NAME}';

// 1. SHEETS -> SITE: notify the site when the sheet is edited
function onEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    UrlFetchApp.fetch(WEBSITE_WEBHOOK_URL, { method: 'post', muteHttpExceptions: true });
  } catch (err) {
    Logger.log('onEdit error: ' + err);
  }
}

// 2. SITE -> SHEETS: write a new/updated deal into the sheet
function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: 'Sheet not found' })).setMimeType(ContentService.MimeType.JSON);
    
    if (contents.action === 'upsert_deal') {
      var d = contents.deal;
      var lastRow = sheet.getLastRow();
      var foundRow = -1;
      if (lastRow >= 3) {
        var dealIds = sheet.getRange(3, 4, lastRow - 2, 1).getValues();
        for (var i = 0; i < dealIds.length; i++) {
          if (dealIds[i][0] == d.dealNumber) { foundRow = i + 3; break; }
        }
      }
      var targetRow = foundRow > 0 ? foundRow : lastRow + 1;
      
      sheet.getRange(targetRow, 4).setValue(d.dealNumber);
      sheet.getRange(targetRow, 5).setValue(d.date);
      sheet.getRange(targetRow, 6).setValue(d.sellerName);
      sheet.getRange(targetRow, 7).setValue(d.providerName);
      sheet.getRange(targetRow, 8).setValue(d.isDaftar);
      sheet.getRange(targetRow, 9).setValue(d.customerName);
      sheet.getRange(targetRow, 10).setValue(d.customerPhone1);
      sheet.getRange(targetRow, 11).setValue(d.customerPhone2);
      sheet.getRange(targetRow, 12).setValue(d.contractUrl);
      sheet.getRange(targetRow, 13).setValue(d.passportPhotoUrl);
      sheet.getRange(targetRow, 14).setValue(d.storeName);
      sheet.getRange(targetRow, 15).setValue(d.customerLimit);
      sheet.getRange(targetRow, 16).setValue(d.withdrawnLimit);
      sheet.getRange(targetRow, 17).setValue(d.agentAmount);
      sheet.getRange(targetRow, 18).setValue(d.totalPurchaseCost);
      sheet.getRange(targetRow, 19).setValue(d.purchaseDiscountPct);
      sheet.getRange(targetRow, 20).setValue(d.agentPct);
      sheet.getRange(targetRow, 21).setValue(d.calculatedAmount);
      sheet.getRange(targetRow, 22).setValue(d.remainingLimit);
      sheet.getRange(targetRow, 23).setValue(d.differenceAmount);
      sheet.getRange(targetRow, 24).setValue(d.productName);
      sheet.getRange(targetRow, 25).setValue(d.quantity);
      sheet.getRange(targetRow, 26).setValue(d.isActualDeviceSale);
      sheet.getRange(targetRow, 27).setValue(d.imeiBarcode);
      sheet.getRange(targetRow, 28).setValue(d.statusText);
      sheet.getRange(targetRow, 29).setValue(d.agencyName);
      sheet.getRange(targetRow, 30).setValue(d.agentName);
      sheet.getRange(targetRow, 31).setValue(d.extraDaftar);
      sheet.getRange(targetRow, 32).setValue(d.qodirDebt);
      sheet.getRange(targetRow, 34).setValue(d.qodirBalance);
      sheet.getRange(targetRow, 35).setValue(d.greenBazarBalance);
      sheet.getRange(targetRow, 36).setValue(d.trustBalance);
      sheet.getRange(targetRow, 37).setValue(d.totalExtraBalance);
      sheet.getRange(targetRow, 38).setValue(d.buyerName);
      sheet.getRange(targetRow, 41).setValue(d.salePrice);
      sheet.getRange(targetRow, 42).setValue(d.paidTransfer);
      sheet.getRange(targetRow, 43).setValue(d.paidCashUzs);
      sheet.getRange(targetRow, 44).setValue(d.paidCashUsd);
      sheet.getRange(targetRow, 45).setValue(d.paidBank);
      sheet.getRange(targetRow, 46).setValue(d.exchangeRate);
      sheet.getRange(targetRow, 47).setValue(d.profit);
      sheet.getRange(targetRow, 48).setValue(d.marginPct);
      sheet.getRange(targetRow, 49).setValue(d.receivedFromBuyer);
      sheet.getRange(targetRow, 50).setValue(d.debtRemainder);
      sheet.getRange(targetRow, 56).setValue(d.paymentStatus);
      sheet.getRange(targetRow, 57).setValue(d.note);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, dealNumber: d.dealNumber, row: targetRow })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;
}
