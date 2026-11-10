"""[MoM 30/10 §4] Offline source inventory. Never connects to a database."""
import csv
import hashlib
import json
import re
import unicodedata
import warnings
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'workflows/context/mom-2026-10-30'
OUT.mkdir(parents=True, exist_ok=True)
DOWNLOADS = Path.home() / 'Downloads'
FILES = ['ORDER LIST OFFICIAL 2023-2026.xlsx', 'CC2018 ok.xlsx',
         'kéo sợi 2026.xlsx', 'STATISTICAL REPORT 10-2026.xlsx',
         'Hướng dẫn đóng gói 2026.xlsx', 'KẾ HOẠCH ĐÓNG PALLET.xlsx',
         'KẾ HOẠCH HÀNG MAY D.xlsx', 'cc AQ.xlsx']
DRIVE_SOURCES = {
    FILES[4]: ('packing', '1IoZ1pijy-UuN5wJnGz6I-T-0tE42Q4lM'),
    FILES[5]: ('pallet', '1fI40gd8B1DKwq3f1klJqqDg8WsDPA7Si'),
    FILES[6]: ('mayd', '11hg9BDMd2ADeIfBED--XknjzML-jmgvP'),
    FILES[7]: ('aq', '1RVDAbhWv65f81_Qswurr-_MTshQq08cV'),
}

def locate(name):
    local = next((p for p in DOWNLOADS.glob('*.xlsx')
                  if unicodedata.normalize('NFC', p.name) == name), None)
    if local:
        return local
    if name in DRIVE_SOURCES:
        path = Path('/private/tmp/sny-m30-sources') / (DRIVE_SOURCES[name][0] + '.xlsx')
        return path if path.is_file() else None
    return None

def write_csv(name, fields, rows):
    with (OUT / name).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            # Preserve text while preventing spreadsheet formula evaluation.
            writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v
                             for k, v in row.items()})

warnings.filterwarnings('ignore', category=UserWarning, module='openpyxl')
manifest, sheets = [], []
for name in FILES:
    path = locate(name)
    if not path:
        manifest.append({'file': name, 'status': 'MISSING'})
        continue
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=False)
    with zipfile.ZipFile(path) as archive:
        media = sum(n.startswith('xl/media/') for n in archive.namelist())
    manifest.append({'file': name, 'status': 'READ', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'sheet_count': len(workbook.sheetnames), 'embedded_media': media,
                     'source': 'https://drive.google.com/file/d/' + DRIVE_SOURCES[name][1] + '/view'
                     if name in DRIVE_SOURCES else 'user-provided local attachment'})
    for sheet in workbook:
        sample = []
        for row in sheet.iter_rows(min_row=1, max_row=20):
            for cell in row:
                if cell.value is not None and cell.data_type != 'f':
                    sample.append(f'{cell.coordinate}: {str(cell.value)[:120]}')
        sheets.append({'file': name, 'sheet': sheet.title, 'declared_rows': sheet.max_row,
                       'declared_columns': sheet.max_column, 'header_sample': ' ; '.join(sample[:35]),
                       'review': 'STRUCTURE_ONLY_FIRST_20_ROWS'})
    workbook.close()
(OUT / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
write_csv('sheet-inventory.csv', ['file', 'sheet', 'declared_rows', 'declared_columns', 'header_sample', 'review'], sheets)

orders = openpyxl.load_workbook(locate(FILES[0]), read_only=True, data_only=True)
catalog = defaultdict(list)
dates, field_counts = [], Counter()
for row_no, row in enumerate(orders['ORDERS'].iter_rows(min_row=3, values_only=True), 3):
    if len(row) < 3 or row[1] is None:
        continue
    pi = str(row[1]).strip()
    catalog[pi].append({'row': row_no, 'no': row[2]})
    if len(row) > 4 and isinstance(row[4], datetime):
        dates.append(row[4])
    for col, value in enumerate(row[:29], 1):
        if value is not None and str(value).strip():
            field_counts[col] += 1
orders.close()
key = lambda value: re.sub(r'\s+', '', str(value)).upper()
index = defaultdict(set)
for pi in catalog:
    index[key(pi)].add(pi)
yarn = openpyxl.load_workbook(locate(FILES[2]), read_only=True, data_only=True)
mapping = []
for row_no, row in enumerate(yarn['10.2026'].iter_rows(min_row=5, values_only=True), 5):
    raw = row[3] if len(row) > 3 else None
    # Only rows with Color, Gauge and Denier are plan-line candidates.
    if not isinstance(raw, str) or len(row) < 8 or any(row[i] is None for i in (4, 6, 7)):
        continue
    token = re.split(r'\s+\d+(?:[.,]\d+)?\s*(?:GSM|G\b)', raw.strip(), maxsplit=1, flags=re.I)[0].strip()
    matches = sorted(index.get(key(token), set()))
    status = 'PI_ONLY_REQUIRES_ITEM_REVIEW' if len(matches) == 1 else 'AMBIGUOUS_PI' if matches else 'NO_PI_IN_SUPPLIED_CATALOG'
    mapping.append({'sheet': '10.2026', 'source_cell': f'D{row_no}', 'raw_order': raw,
                    'candidate_pi_text': token, 'candidate_pis': ' ; '.join(matches),
                    'catalog_item_count': sum(len(catalog[m]) for m in matches), 'status': status,
                    'item_id': '', 'method': 'DIAGNOSTIC_EXACT_NORMALIZED_CODE; NOT_PRODUCTION_RESOLVER'})
yarn.close()
write_csv('pi-mapping-review.csv', ['sheet', 'source_cell', 'raw_order', 'candidate_pi_text', 'candidate_pis',
          'catalog_item_count', 'status', 'item_id', 'method'], mapping)
summary = {'orders_with_pi': sum(map(len, catalog.values())), 'distinct_raw_pi': len(catalog),
           'multi_item_pi': sum(len(items) > 1 for items in catalog.values()),
           'latest_order_date': max(dates).date().isoformat() if dates else None,
           'populated_cells_by_column': dict(field_counts), 'mapping_rows': len(mapping),
           'mapping_outcomes': dict(Counter(r['status'] for r in mapping)),
           'limitations': ['Catalog is historical; unmatched does not prove a PI is invalid.',
                          'Candidate extraction is diagnostic and needs manual review.',
                          'No item assigned, no database accessed, no formula or macro executed.',
                          'Inventory reads first 20 rows per sheet; this is not full cell reconciliation.']}
(OUT / 'audit-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'manifest_files': len(manifest), 'inventory_sheets': len(sheets), **summary}, ensure_ascii=False))

# Field-level evidence for representative source layouts. Candidate fields are
# not semantic equivalence: e.g. a loading date is not automatically deliveryDate.
templates = [
    (0, 'ORDERS', [2], {'B': 'piNumber', 'C': 'subLineIndex', 'D': 'customer', 'E': 'orderDate', 'F': 'meshType', 'G': 'description', 'H': 'uvPct', 'I': 'frPct', 'J': 'gsm', 'K': 'widthM', 'L': 'rollLength', 'M': 'color', 'N': 'orderType', 'O': 'qty', 'P': 'qtySqm', 'Q': 'totalWeightKgs', 'S': 'deliveryDate', 'T': 'containerSize', 'U': 'lifecycleStatus', 'V': 'lifecycleStatus', 'X': 'packingNote', 'AA': 'remark'}),
    (4, '7.2026', [3], {'A': 'piNumber', 'B': 'color', 'C': 'widthM', 'D': 'rollLength', 'E': 'gsm', 'U': 'qty', 'T': 'eyeletLines'}),
    (5, '3.5.2021', [4], {'A': 'piNumber', 'B': 'color', 'C': 'widthM', 'D': 'rollLength', 'E': 'gsm', 'F': 'qty', 'H': 'itemsPerPallet', 'I': 'palletDimensions'}),
    (6, 'NAFCO ', [3, 4], {'B': 'color', 'C': 'widthM', 'D': 'pieceLength', 'E': 'gsm', 'F': 'qty', 'M': 'eyeletSpec', 'N': 'eyeletSpec'}),
    (7, 'AQ', [12], {}),
    (1, 'UC 26-4', [10], {}),
    (2, '10.2026', [4], {}),
]
layers = {
    'schema': 'prisma/schema.prisma',
    'parser': 'src/lib/excel/parseOrderList.ts',
    'validation': 'src/lib/validations/order.ts',
    'create_form': 'src/components/orders/MultiLineOrderForm.tsx',
    'edit_form': 'src/components/orders/PiMasterDetailEditor.tsx',
    'detail': 'src/components/orders/OrderDetail.tsx',
    'persistence': 'src/lib/orders/importPersist.ts',
}
texts = {k: (ROOT / path).read_text().splitlines() for k, path in layers.items()}
coverage = []
for file_index, sheet_name, header_rows, candidates in templates:
    name = FILES[file_index]
    path = locate(name)
    if not path:
        continue
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook[sheet_name]
    for row_number in header_rows:
        for row in sheet.iter_rows(min_row=row_number, max_row=row_number):
            for cell in row:
                if not isinstance(cell.value, str) or not cell.value.strip():
                    continue
                label = cell.value.replace('\n', ' ').strip()
                candidate = candidates.get(cell.column_letter, '')
                record = {'file': name, 'sheet': sheet_name, 'cell': cell.coordinate, 'label': label,
                          'candidate_order_field': candidate,
                          'status': 'REVIEW_SEMANTICS_AND_ROUNDTRIP' if candidate else 'NO_DEDICATED_ORDER_FIELD_IDENTIFIED',
                          'scope': 'REPRESENTATIVE_HEADER; NOT_ALL_LAYOUT_VARIANTS'}
                if file_index in (1, 2, 7):
                    record['status'] = 'PLAN_ENTITY_REQUIRED; NOT_ORDER_MASTER_DATA'
                for layer, lines in texts.items():
                    line = next((i for i, text in enumerate(lines, 1) if candidate and re.search(r'\b' + re.escape(candidate) + r'\b', text)), None)
                    record[layer] = f'{layers[layer]}:{line}' if line else ''
                coverage.append(record)
    workbook.close()
write_csv('field-coverage.csv', ['file', 'sheet', 'cell', 'label', 'candidate_order_field', 'status', 'scope', *layers], coverage)
print('Representative field headers:', len(coverage), '; code references are static evidence, not runtime round-trip proof.')
