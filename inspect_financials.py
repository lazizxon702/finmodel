import openpyxl

wb = openpyxl.load_workbook('Фин_модел.xlsx', data_only=False)
wb_val = openpyxl.load_workbook('Фин_модел.xlsx', data_only=True)

ws_fin = wb['Финансы_Свод']
ws_fin_val = wb_val['Финансы_Свод']

with open('fin_svod_detail.txt', 'w', encoding='utf-8') as f:
    f.write("=== Финансы_Свод All Cells ===\n")
    for r in range(1, ws_fin.max_row + 1):
        row_str = []
        for c in range(1, ws_fin.max_column + 1):
            cl = openpyxl.utils.get_column_letter(c)
            f_val = ws_fin.cell(r, c).value
            v_val = ws_fin_val.cell(r, c).value
            if f_val is not None:
                row_str.append(f"{cl}{r}: f='{f_val}' val='{v_val}'")
        if row_str:
            f.write(" | ".join(row_str) + "\n")

ws_fm = wb['Фин_Модель']
ws_fm_val = wb_val['Фин_Модель']
with open('fin_model_detail.txt', 'w', encoding='utf-8') as f:
    f.write("=== Фин_Модель All Cells ===\n")
    for r in range(1, ws_fm.max_row + 1):
        row_str = []
        for c in range(1, ws_fm.max_column + 1):
            cl = openpyxl.utils.get_column_letter(c)
            f_val = ws_fm.cell(r, c).value
            v_val = ws_fm_val.cell(r, c).value
            if f_val is not None:
                row_str.append(f"{cl}{r}: f='{f_val}' val='{v_val}'")
        if row_str:
            f.write(" | ".join(row_str) + "\n")

ws_daily = wb['Ежедневный_Учет']
ws_daily_val = wb_val['Ежедневный_Учет']
with open('daily_detail.txt', 'w', encoding='utf-8') as f:
    f.write("=== Ежедневный_Учет Rows 1-45 (Col A-D and AG-AH) ===\n")
    for r in range(1, ws_daily.max_row + 1):
        row_str = []
        for c in [1, 2, 3, 4, 33, 34]: # A, B, C, D, AG, AH
            cl = openpyxl.utils.get_column_letter(c)
            f_val = ws_daily.cell(r, c).value
            v_val = ws_daily_val.cell(r, c).value
            if f_val is not None:
                row_str.append(f"{cl}{r}: f='{f_val}' val='{v_val}'")
        if row_str:
            f.write(" | ".join(row_str) + "\n")

print("Dumped fin_svod, fin_model, daily details")
