import openpyxl

wb = openpyxl.load_workbook('Фин_модел.xlsx', data_only=False)

sheets_to_check = ['SWOT дате', 'БОТ ТР', 'Сделки_и_Склад_Бот', 'Платежи_Бота', 'Лист8', 'Баланс', 'Прием передача', 'Лист5']

with open('remaining_sheets_info.txt', 'w', encoding='utf-8') as f:
    for sname in sheets_to_check:
        ws = wb[sname]
        f.write(f"\n================ SHEET: {sname} (Rows: {ws.max_row}, Cols: {ws.max_column}) ================\n")
        # print header rows
        for r in range(1, min(ws.max_row, 7) + 1):
            row_items = []
            for c in range(1, min(ws.max_column, 40) + 1):
                v = ws.cell(r, c).value
                if v is not None:
                    cl = openpyxl.utils.get_column_letter(c)
                    row_items.append(f"{cl}{r}: {str(v)[:60]}")
            if row_items:
                f.write(f"Row {r}: " + " | ".join(row_items) + "\n")

print("Written remaining_sheets_info.txt")
