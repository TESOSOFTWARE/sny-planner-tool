# Implementation Plan: Knitting Daily Output Sprint

## Goal

Add daily knitting machine output tracking sourced from SNY's Statistical Report
files (KNITTING sheet). The file contains **cumulative** totals from the 1st of
the month — the system must compute the **delta (single-day output)** by
subtracting the previous day's cumulative. Planners can upload the file via a
new "Import Knitting Report" button in the Materials page. Produced/remaining
meters are then displayed on Order Detail and PO Summary for orders that have at
least one MachineAssignment.

---

## File Tree

### New files
| File | Purpose |
|---|---|
| `prisma/schema.prisma` *(modified)* | Add `KnittingDailyOutput` model |
| `src/lib/excel/parseKnittingReport.ts` | Parser — returns raw cumulative per machine per date |
| `src/app/api/knitting/import/route.ts` | POST — compute delta, upsert to DB, return summary |
| `src/components/materials/ImportKnittingModal.tsx` | 3-step modal: pick → preview → confirm |
| `src/app/api/knitting/progress/route.ts` | GET — compute producedMeters/remainingMeters/avgDaily for 1 order |

### Modified files
| File | What changes |
|---|---|
| `src/app/materials/page.tsx` | Add "Import Knitting Report" button + `ImportKnittingModal` |
| `src/components/orders/OrderDetail.tsx` | Add "TIẾN ĐỘ SẢN XUẤT" section (client-side fetch from `/api/knitting/progress`) |
| `src/components/orders/POSummaryTable.tsx` | Add "Đã SX (m)" and "Còn lại (m)" columns in expanded sub-line table |

### Protected files — NOT touched
- `CLAUDE.md`, `.env`, `.env.local`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[id]/route.ts`

---

## Schema changes

Exact diff to `prisma/schema.prisma` — new model appended after `MaterialTransaction`:

```diff
+model KnittingDailyOutput {
+  id               String   @id @default(cuid())
+  machineId        String   // "M-001" to "M-040"
+  reportDate       DateTime // exact date of the report (time = 00:00:00 UTC)
+  dailyMeters      Decimal  @db.Decimal(10,2) // delta from previous day, NOT cumulative
+  cumulativeMeters Decimal  @db.Decimal(10,2) // raw cumulative from file — keep for audit
+  createdAt        DateTime @default(now())
+  updatedAt        DateTime @updatedAt
+
+  @@unique([machineId, reportDate])
+  @@index([machineId])
+  @@index([reportDate])
+  @@map("knitting_daily_output")
+}
```

> ⚠️ `npx prisma db push` will only be run after Tung explicitly confirms.
> New table — no effect on existing data.

---

## Parser logic (pseudocode for delta calculation)

### Parser (`parseKnittingReport.ts`) — produces raw cumulative only:

```
function parseKnittingReport(buffer):
  workbook = XLSX.read(buffer)
  sheet = workbook.Sheets["KNITTING"]   // exact sheet name TBD — see Risk #2
  rows = sheet_to_json(sheet, header:1)

  results = []
  currentDate = null

  for each row in rows:
    // Detect date header: a row where one cell matches M/DD/YYYY
    if row contains cell matching /^\d{1,2}\/\d{2}\/\d{4}$/:
      currentDate = parse(cell) → Date object (time=00:00:00 UTC)
      continue

    // Detect TOTAL row for a machine:
    // Pattern: col[0] = machine_number (int 1..40), some col = "TOTAL"
    if currentDate && col[0] is integer 1..40 && row contains "TOTAL":
      machineId = "M-" + String(col[0]).padStart(3,"0")
      // total(m) = second-to-last numeric value before the date-range string
      // Scan right-to-left: skip date-range string, take first numeric → totalKg,
      //   next numeric → total(m) = cumulativeMeters
      cumulativeMeters = extract_cumulative(row)   // see Risk #3
      results.push({ reportDate: currentDate, machineId, cumulativeMeters })

  return results
```

### API handler (`/api/knitting/import`) — delta calculation:

```
for each { reportDate, machineId, cumulativeMeters } in parsedData:

  // Look up previous day in same month
  prevDate = reportDate - 1 day
  prevRecord = DB.knittingDailyOutput.findUnique({
    where: { machineId, reportDate: prevDate }
  })

  if prevRecord exists AND same month as reportDate:
    dailyMeters = cumulativeMeters - prevRecord.cumulativeMeters
    if dailyMeters < 0: dailyMeters = 0    // idle or data anomaly
  else:
    dailyMeters = cumulativeMeters          // first import of the month (approximation)

  // Upsert — safe to re-upload same file
  DB.knittingDailyOutput.upsert({
    where: { machineId_reportDate: { machineId, reportDate } },
    create: { machineId, reportDate, dailyMeters, cumulativeMeters },
    update: { dailyMeters, cumulativeMeters }
  })
```

---

## Steps

1. **Schema** — add `KnittingDailyOutput` model to `prisma/schema.prisma`. Wait for Tung's explicit confirmation before `npx prisma db push`.

2. **Run** `npx prisma db push` *(after Tung confirms)* + `npx prisma generate`.

3. **Parser** — create `src/lib/excel/parseKnittingReport.ts`. Returns `KnittingDayData[]` (machineId, reportDate, cumulativeMeters). No delta logic here. Include a `--test` path so we can call it standalone for spot checks.

4. **Import API** — create `src/app/api/knitting/import/route.ts`. POST accepts multipart file, calls parser, computes delta per machine per day (query prev day from DB), upserts, returns `{ imported, updated, dates }`.

5. **Progress API** — create `src/app/api/knitting/progress/[orderId]/route.ts`. GET computes producedMeters, remainingMeters, avgDailyOutput (last 7 days), remainingDays for one order using its MachineAssignment rows + KnittingDailyOutput records.

6. **ImportKnittingModal** — create `src/components/materials/ImportKnittingModal.tsx`. 3-step pattern identical to `ImportMaterialReportModal`: pick → preview (show parsed dates + machine count) → confirm → success/error. Props: `onImported: () => void`, `onClose: () => void`.

7. **Materials page** — modify `src/app/materials/page.tsx` to add `showKnittingModal` state + "Import Knitting Report" outline button (between existing "Import báo cáo" and "Add material") + render `<ImportKnittingModal>`.

8. **OrderDetail — TIẾN ĐỘ SẢN XUẤT section** — modify `src/components/orders/OrderDetail.tsx`. Client-side `useEffect` fetches `/api/knitting/progress/[id]` after mounting (alongside existing `fetchMachineRows`). Renders new section only when `machineRows.length > 0`. Fields: Đã sản xuất / Còn lại / Sản lượng TB 7 ngày / Ngày dự kiến xong.

9. **PO Summary — produced/remaining columns** — modify `src/components/orders/POSummaryTable.tsx`. Sub-line detail table: add "Đã SX (m)" and "Còn lại (m)" columns. These require a fetch per sub-line — to avoid N+1 requests, a single `/api/knitting/progress/bulk` endpoint will accept an array of orderIds and return a map. *(Alternative: accept the N requests if order counts are small — decision at build time.)*

10. **Build verification** — `npm run build` → 0 errors. Then `npm run dev` for manual Phase C tests.

---

## Risks

### Risk 1 — CRITICAL: Cumulative vs daily confusion
If `dailyMeters` is set to the raw `cumulativeMeters` by mistake (wrong delta logic), all figures in the UI will be wildly inflated. Mitigation: the delta calculation lives in exactly one place (the API handler), with a unit test comment showing the expected result for Machine 1 (28/4 = 13,695 first import, 29/4 = 785 delta).

### Risk 2 — Sheet name unknown
The prompt says sheet name is "KNITTING" but the real file has not been inspected. Mitigation: parser will scan `workbook.SheetNames` for a sheet containing "knitting" (case-insensitive) — same strategy as `parseMaterialReport.ts` which finds "HDPE & MB" flexibly. If no match → throw descriptive error.

### Risk 3 — `total(m)` column index ambiguous
The TOTAL row ends with two numerics (totalKg, totalMeters) then a date-range string. The column index may vary by machine or file version. Mitigation: scan right-to-left from the end of the row — skip non-numeric/date-range cells, take 1st numeric = totalKg, 2nd numeric = total(m). If both are 0 or not found → default to 0 and log a warning. **If this produces wrong values for >2 machines, trigger STOP condition.**

### Risk 4 — `totalMeters` source for remaining calculation
Prompt specifies `order.lengthM` as total meters (confirmed: `orderType=meters`, `lengthM = total meters`). However for `rolls`/`pieces` order types, `lengthM` may not be the actual total. The progress API will use `order.lengthM` as instructed, but will add a comment flagging this assumption.

### Risk 5 — N+1 fetch in PO Summary
If PO Summary calls `/api/knitting/progress/[orderId]` per sub-line, a PI with 7 sub-lines triggers 7 sequential API calls. Mitigation assessed at Step 9 — will use a single bulk endpoint or pass all orderIds in one request.

### Risk 6 — `ImportMaterialReportModal` prop mismatch
Research found two versions: one without props (standalone button) and one called with `onImported` + `onClose` from `materials/page.tsx`. The `ImportKnittingModal` will be built to accept `{ onImported, onClose }` props, matching the actual `page.tsx` usage pattern.

---

## Manual tests Tung must run (Phase C)

1. Navigate to `/materials` → "Import Knitting Report" button visible, outline style
2. Upload the 2-day file → preview shows correct date count and 40 machines per date
3. Confirm import → success message shows "Imported X records for dates: 28/4, 29/4"
4. DB check: `KnittingDailyOutput` has 80 rows (40 × 2 days)
5. Spot check Machine 1:
   - 28/4: `cumulativeMeters = 13,695` / `dailyMeters = 13,695` (first import of month)
   - 29/4: `cumulativeMeters = 14,480` / `dailyMeters = 785` ✓
6. Machine 2: both days `dailyMeters = 0` (machine was idle) ✓
7. Upload same file again → UPDATE existing rows, no duplicate rows (upsert)
8. Open any `/orders/[id]` where order has a MachineAssignment → "TIẾN ĐỘ SẢN XUẤT" section appears with values
9. Open any order with NO assignment → section does NOT appear
10. `/orders/summary` → expand a PI with assigned machines → "Đã SX (m)" and "Còn lại (m)" columns visible
11. Existing `/orders`, `/schedule`, `/materials` pages load correctly with no regressions

---

## Out of Scope

- ❌ Auto-update `MachineAssignment.endDate` based on remaining days
- ❌ Push notifications or alerts when order is behind schedule
- ❌ Extruder output tracking (separate decision pending)
- ❌ Any change to `/api/orders/route.ts` or `/api/orders/[id]/route.ts`
- ❌ New npm packages (SheetJS already installed)
- ❌ Auth, mobile responsive, real-time updates
- ❌ Bulk delete / bulk edit of KnittingDailyOutput records
- ❌ Historical data before current month (system starts fresh from first import)

---

## Open questions for Tung to confirm before Phase B

> [!IMPORTANT]
> **Q1 — Sheet name:** Is the KNITTING sheet called exactly "KNITTING" in the real file, or does it have a different name (e.g. "Knitting", "DET KNITTING")? The parser will do case-insensitive substring match — just confirm so we can add a fallback.

> [!IMPORTANT]
> **Q2 — TOTAL row format:** In the real file, does the TOTAL row for a machine look like:
> `[machine_number, "TOTAL", ..., totalKg_value, totalMeters_value, "DD/MM/YYYY-DD/MM/YYYY"]`
> OR does the machine number appear in a merged cell above, and the TOTAL row starts with the word "TOTAL" in col A?
> This determines how we detect which machine a TOTAL row belongs to.

> [!NOTE]
> **Q3 — PO Summary performance:** The PO Summary has 119 orders across many PIs. Do you want progress data (Đã SX / Còn lại) to load automatically on page open, or only when a PI group is expanded? Lazy-loading per expand is safer for performance.

> [!NOTE]
> **Q4 — `totalMeters` for rolls/pieces orders:** For orders where `orderType = "rolls"` or `"pieces"`, `lengthM` may differ from actual total meters. Should the remaining-meters calculation use `lengthM` as specified (simplest, confirmed), or should it use `qtySqm / widthM` as a more accurate fallback?
