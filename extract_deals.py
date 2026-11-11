import openpyxl

wb = openpyxl.load_workbook('Фин_модел.xlsx', data_only=False)
wb_val = openpyxl.load_workbook('Фин_модел.xlsx', data_only=True)

ws_deal = wb['Сделки_и_Склад']
ws_deal_val = wb_val['Сделки_и_Склад']

with open('deals_columns.txt', 'w', encoding='utf-8') as f:
    f.write("=== Сделки_и_Склад Columns and Formulas ===\n")
    max_c = ws_deal.max_column
    for c in range(1, max_c + 1):
        col_letter = openpyxl.utils.get_column_letter(c)
        header_r1 = ws_deal.cell(1, c).value
        header_r2 = ws_deal.cell(2, c).value
        sample_formula = ws_deal.cell(3, c).value
        sample_val = ws_deal_val.cell(3, c).value
        f.write(f"Col {col_letter} ({c}): Header1='{header_r1}', Header2='{header_r2}'\n")
        f.write(f"   Row 3 Formula: {sample_formula} | Value: {sample_val}\n")
        # Check row 2 total formula
        r2_val = ws_deal.cell(2, c).value
        if str(r2_val).startswith('='):
            f.write(f"   Row 2 Total Formula: {r2_val}\n")

print("Written deals_columns.txt")
