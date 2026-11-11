import openpyxl
import json

wb = openpyxl.load_workbook('Фин_модел.xlsx', data_only=False)
wb_val = openpyxl.load_workbook('Фин_модел.xlsx', data_only=True)

result = {}

for sheetname in wb.sheetnames:
    ws = wb[sheetname]
    ws_val = wb_val[sheetname]
    
    # Let's find header rows and column info
    # Read first 15 rows completely
    matrix = []
    for r in range(1, min(ws.max_row or 1, 35) + 1):
        row_data = {}
        for c in range(1, min(ws.max_column or 1, 70) + 1):
            f_val = ws.cell(r, c).value
            v_val = ws_val.cell(r, c).value
            if f_val is not None:
                row_data[openpyxl.utils.get_column_letter(c)] = {
                    'formula': str(f_val) if str(f_val).startswith('=') else None,
                    'raw': str(f_val)[:80],
                    'val': str(v_val)[:80] if v_val is not None else None
                }
        if row_data:
            matrix.append({'row': r, 'cells': row_data})
            
    result[sheetname] = {
        'max_row': ws.max_row,
        'max_col': ws.max_column,
        'rows': matrix
    }

with open('deep_sheet_data.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("Saved deep_sheet_data.json")
