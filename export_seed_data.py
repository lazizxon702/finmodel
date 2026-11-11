import openpyxl
import json
from datetime import datetime

wb = openpyxl.load_workbook('Фин_модел.xlsx', data_only=True)

def safe_str(val):
    if val is None:
        return ""
    return str(val).strip()

def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except:
        return default

def safe_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)

# 1. Deals from Сделки_и_Склад
ws_deals = wb['Сделки_и_Склад']
deals = []
for r in range(3, 150):
    deal_num = ws_deals.cell(r, 4).value # Col D
    if not deal_num:
        continue
    
    seller = safe_str(ws_deals.cell(r, 6).value)
    provider = safe_str(ws_deals.cell(r, 7).value)
    store = safe_str(ws_deals.cell(r, 14).value)
    
    deals.append({
        'dealNumber': int(safe_float(deal_num)),
        'date': safe_date(ws_deals.cell(r, 5).value),
        'sellerName': seller or 'Operator',
        'providerName': provider or 'Boshqa',
        'isDaftar': safe_str(ws_deals.cell(r, 8).value).lower() in ['да', 'ha', 'true'],
        'customerName': safe_str(ws_deals.cell(r, 9).value),
        'customerPhone1': safe_str(ws_deals.cell(r, 10).value),
        'customerPhone2': safe_str(ws_deals.cell(r, 11).value),
        'contractUrl': safe_str(ws_deals.cell(r, 12).value),
        'passportPhotoUrl': safe_str(ws_deals.cell(r, 13).value),
        'storeName': store or 'Asosiy do\'kon',
        'customerLimit': safe_float(ws_deals.cell(r, 15).value),
        'withdrawnLimit': safe_float(ws_deals.cell(r, 16).value),
        'agentAmount': safe_float(ws_deals.cell(r, 17).value),
        'totalPurchaseCost': safe_float(ws_deals.cell(r, 18).value),
        'purchaseDiscountPct': safe_float(ws_deals.cell(r, 19).value),
        'agentPct': safe_float(ws_deals.cell(r, 20).value),
        'calculatedAmount': safe_float(ws_deals.cell(r, 21).value),
        'remainingLimit': safe_float(ws_deals.cell(r, 22).value),
        'differenceAmount': safe_float(ws_deals.cell(r, 23).value),
        'productName': safe_str(ws_deals.cell(r, 24).value),
        'quantity': int(safe_float(ws_deals.cell(r, 25).value, 1)),
        'isActualDeviceSale': bool(ws_deals.cell(r, 26).value),
        'imeiBarcode': safe_str(ws_deals.cell(r, 27).value),
        'status': safe_str(ws_deals.cell(r, 28).value),
        'agencyName': safe_str(ws_deals.cell(r, 29).value),
        'agentName': safe_str(ws_deals.cell(r, 30).value),
        'extraDaftar': safe_float(ws_deals.cell(r, 31).value),
        'qodirDebt': safe_float(ws_deals.cell(r, 32).value),
        'qodirBalance': safe_float(ws_deals.cell(r, 33).value),
        'greenBazarBalance': safe_float(ws_deals.cell(r, 34).value),
        'trustBalance': safe_float(ws_deals.cell(r, 35).value),
        'totalExtraBalance': safe_float(ws_deals.cell(r, 36).value),
        'buyerName': safe_str(ws_deals.cell(r, 37).value),
        'salePrice': safe_float(ws_deals.cell(r, 40).value),
        'paidTransfer': safe_float(ws_deals.cell(r, 41).value),
        'paidCashUzs': safe_float(ws_deals.cell(r, 42).value),
        'paidCashUsd': safe_float(ws_deals.cell(r, 43).value),
        'paidBank': safe_float(ws_deals.cell(r, 44).value),
        'exchangeRate': safe_float(ws_deals.cell(r, 45).value, 1),
        'profit': safe_float(ws_deals.cell(r, 46).value),
        'marginPct': safe_float(ws_deals.cell(r, 47).value),
        'receivedFromBuyer': safe_float(ws_deals.cell(r, 48).value),
        'debtRemainder': safe_float(ws_deals.cell(r, 49).value),
        'paymentStatus': safe_str(ws_deals.cell(r, 55).value),
        'note': safe_str(ws_deals.cell(r, 56).value)
    })

# 2. Transactions from Транзакции_ДДС
ws_dds = wb['Транзакции_ДДС']
transactions = []
for r in range(7, 100):
    tx_num = ws_dds.cell(r, 1).value
    if not tx_num or not str(tx_num).startswith('TX-'):
        continue
    
    transactions.append({
        'txNumber': str(tx_num).strip(),
        'dateTime': safe_date(ws_dds.cell(r, 2).value),
        'type': safe_str(ws_dds.cell(r, 3).value),
        'account': safe_str(ws_dds.cell(r, 4).value),
        'expenseType': safe_str(ws_dds.cell(r, 5).value),
        'categoryName': safe_str(ws_dds.cell(r, 6).value),
        'sourcePerson': safe_str(ws_dds.cell(r, 7).value),
        'amount': safe_float(ws_dds.cell(r, 8).value),
        'description': safe_str(ws_dds.cell(r, 9).value)
    })

# 3. БОТ ТР
ws_bot_tr = wb['БОТ ТР']
bot_reports = []
for r in range(2, 60):
    ag = ws_bot_tr.cell(r, 1).value
    if not ag:
        continue
    bot_reports.append({
        'agentName': safe_str(ag),
        'date': safe_date(ws_bot_tr.cell(r, 2).value),
        'operatorName': safe_str(ws_bot_tr.cell(r, 3).value),
        'appName': safe_str(ws_bot_tr.cell(r, 4).value),
        'calculatedPct': safe_float(ws_bot_tr.cell(r, 5).value),
        'productName': safe_str(ws_bot_tr.cell(r, 6).value),
        'actualPrice': safe_float(ws_bot_tr.cell(r, 7).value),
        'purchasePrice': safe_float(ws_bot_tr.cell(r, 8).value),
        'paidAmount': safe_float(ws_bot_tr.cell(r, 9).value),
        'profit': safe_float(ws_bot_tr.cell(r, 10).value),
        'storeName': safe_str(ws_bot_tr.cell(r, 11).value),
        'checkNumber': safe_str(ws_bot_tr.cell(r, 12).value),
        'responsible': safe_str(ws_bot_tr.cell(r, 13).value)
    })

# 4. Лист8 (Debts)
ws_debts = wb['Лист8']
debts = []
for r in range(3, 40):
    debtor = ws_debts.cell(r, 1).value
    if not debtor:
        continue
    debts.append({
        'debtorName': safe_str(debtor),
        'roleDescription': safe_str(ws_debts.cell(r, 2).value),
        'telegram': safe_str(ws_debts.cell(r, 3).value),
        'contactPhone': safe_str(ws_debts.cell(r, 4).value),
        'amountUsd': safe_float(ws_debts.cell(r, 5).value),
        'amountUzs': safe_float(ws_debts.cell(r, 6).value),
        'remainingAmount': safe_float(ws_debts.cell(r, 7).value),
        'note': safe_str(ws_debts.cell(r, 8).value),
        'weOwe': safe_float(ws_debts.cell(r, 9).value) > 0,
        'isConfirmed': bool(ws_debts.cell(r, 11).value),
        'debtReason': safe_str(ws_debts.cell(r, 12).value),
        'contractDate': safe_date(ws_debts.cell(r, 13).value),
        'repaymentDate': safe_date(ws_debts.cell(r, 14).value)
    })

# 5. Прием передача (Checklist)
ws_check = wb['Прием передача']
checklist = []
for r in range(2, 20):
    title = ws_check.cell(r, 1).value
    if not title:
        continue
    checklist.append({
        'orderNum': r - 1,
        'title': safe_str(title),
        'comment': safe_str(ws_check.cell(r, 2).value),
        'status': safe_str(ws_check.cell(r, 4).value) or 'Jarayonda',
        'actDone': safe_str(ws_check.cell(r, 5).value).lower() in ['да', 'ha', 'true'],
        'applicationTaken': safe_str(ws_check.cell(r, 6).value).lower() in ['да', 'ha', 'true']
    })

# 6. Лист5 (KPI)
ws_kpi = wb['Лист5']
kpi_plans = []
for r in range(4, 8):
    role_name = ws_kpi.cell(r, 3).value
    if not role_name:
        continue
    kpi_plans.append({
        'roleName': safe_str(role_name),
        'reportType': safe_str(ws_kpi.cell(r, 4).value),
        'reportFormat': safe_str(ws_kpi.cell(r, 5).value),
        'kpiDetails': safe_str(ws_kpi.cell(r, 6).value)
    })

# 7. Ежедневный_Учет
ws_daily = wb['Ежедневный_Учет']
daily_entries = []
prov_mapping = {
    8: 'alif_10_20',
    9: 'alif_gt_20',
    10: 'alif_online',
    11: 'uzum_bank',
    12: 'uzum_nasiya',
    13: 'payme_nasiya',
    14: 'open_anor'
}
for row_idx, code in prov_mapping.items():
    for day in range(1, 32):
        col_idx = day + 1 # Col B is day 1
        cnt = ws_daily.cell(row_idx, col_idx).value
        daily_entries.append({
            'yearMonth': '2026-11',
            'dayNumber': day,
            'providerCode': code,
            'dealCount': int(safe_float(cnt, 0))
        })

output_data = {
    'deals': deals,
    'transactions': transactions,
    'botReports': bot_reports,
    'debts': debts,
    'checklist': checklist,
    'kpiPlans': kpi_plans,
    'dailyEntries': daily_entries
}

with open('server/seed_data.json', 'w', encoding='utf-8') as f:
    json.dump(output_data, f, ensure_ascii=False, indent=2)

print(f"Exported seed data: {len(deals)} deals, {len(transactions)} transactions, {len(debts)} debts")
