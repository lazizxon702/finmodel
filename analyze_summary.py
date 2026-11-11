import json
import sys

with open('sheet_analysis.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open('sheets_overview.txt', 'w', encoding='utf-8') as out:
    for sname, info in data.items():
        out.write(f"=== SHEET: {sname} (Rows: {info['max_row']}, Cols: {info['max_col']}, Errors: {info['errors_count']}) ===\n")
        if info['errors_count'] > 0:
            for err in info['errors_sample'][:10]:
                out.write(f"   ERR: {err['cell']} - {err['error']} -> {err['formula']}\n")
        out.write("\n")

print("Written sheets_overview.txt")
