import json

with open('deep_sheet_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open('sheets_structure.txt', 'w', encoding='utf-8') as out:
    for name, sdata in data.items():
        out.write(f"==================================================\n")
        out.write(f"SHEET: {name} (Max row: {sdata['max_row']}, Max col: {sdata['max_col']})\n")
        out.write(f"==================================================\n")
        
        for r in sdata['rows'][:12]:
            r_num = r['row']
            cells = r['cells']
            non_empty = [f"{col}: {c['raw']}" for col, c in cells.items() if c['raw']]
            if non_empty:
                out.write(f"Row {r_num}: {', '.join(non_empty[:15])}\n")
        out.write("\n\n")

print("Written sheets_structure.txt successfully")
