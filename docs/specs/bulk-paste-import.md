# Implementation Plan: Bulk Paste Import

## Goal

Add a bulk import method allowing planners to copy tabular rows directly from an Excel sheet and paste them into a textarea on `/orders/bulk`. The pasted content is parsed client-side, displayed in a preview table, validated, and saved to the database (skipping duplicates).

---

## File Tree

### New files
```
docs/specs/bulk-paste-import.md              This spec
src/lib/excel/parsePastedText.ts             Client-side parser utility
src/app/api/orders/bulk/route.ts             POST API handler to save imported orders
src/app/orders/bulk/page.tsx                 Bulk Paste Client Page
```

### Modified files
```
src/app/orders/page.tsx                      Add "Bulk paste" button/link
```

### Protected files NOT touched
- `CLAUDE.md`
- `prisma/schema.prisma`
- `.env`
- `.env.local`

---

## Dependencies

| Package | Reason | npm URL | Verified? |
|---------|--------|---------|-----------|
| *none* | The parser runs entirely client-side using native tab-separated text parsing. No extra packages required. | — | ✅ |

---

## Steps

1. **Create `docs/specs/bulk-paste-import.md`** — Document goals, file tree, dependencies, parsing rules, and risk points. (This step)
2. **Create `src/lib/excel/parsePastedText.ts`** — Tab-separated parser utility. Processes raw text input row-by-row, parses dates robustly, handles optional columns (FR, UV, Qty, Description), trims values, and skips rows missing required fields.
3. **Create `src/app/api/orders/bulk/route.ts`** — Server-side endpoint. Validates input schema using Zod, writes valid records to PostgreSQL using `prisma.productionOrder.createMany({ skipDuplicates: true })`, and returns counts of imported vs. skipped orders.
4. **Create `/orders/bulk` page (`src/app/orders/bulk/page.tsx`)** — Reusable state machine (`idle` → `preview` → `saving` → `success` | `error`) styling components in the light theme.
5. **Update `/orders` dashboard (`src/app/orders/page.tsx`)** — Place a "Bulk paste" button styled with an outline, an icon (`content_paste`), and linking to `/orders/bulk`.
6. **Verify type safety and builds** — Run `tsc --noEmit` and `npm run build` to confirm zero build compilation errors.

---

## Technical Specifications

### Column Mapping (Pasted from Excel)

| Paste Index | Field | DB Column | Rules |
|---|---|---|---|
| 0 | Row ID | SKIP | — |
| 1 | PI Number | `piNumber` | Required. Trimmed string. |
| 2 | Sub-line | `subLineIndex` | Required. Default to `1` if empty or invalid. |
| 3 | Customer | `customer` | Required. Trimmed string. |
| 4 | Date | `orderDate` | Required. Checked against formats: `YYYY-MM-DD`, `DD/MM/YYYY`, `M/D/YYYY`. |
| 5 | Item | `description` | Optional. Appended to description: `{Item} - {Description}`. |
| 6 | Description | `description` | Optional. Appended to description. |
| 7 | UV % | `uvPct` | Optional. If ends with `%`, strip it and divide by 100. Else, if float > 1, divide by 100. Otherwise keep as-is. |
| 8 | FR | `frFlag` | Optional. Boolean. `0` = `false`, non-zero numeric = `true`. Default to `false`. |
| 9 | GSM | `gsm` | Required. Integer > 0. |
| 10 | Width | `widthM` | Required. Decimal > 0. |
| 11 | Length | `lengthM` | Required. Decimal > 0. |
| 12 | Color | `color` | Required. Trimmed and converted to UPPERCASE. |
| 13 | Unit | SKIP | — |
| 14 | Qty | `qty` | Optional. Integer. |

---

## Risks

1. **Paste Format Variance**
   * Planners might select columns in the wrong order or include headers.
   * *Mitigation*: The preview grid allows users to inspect exactly how the text mapped to each field before saving. The tool skips rows with bad required columns (e.g. string GSM or invalid dates).

2. **Date Parsing Ambiguity**
   * Format `10/12/2026` could be Oct 12 or Dec 10.
   * *Mitigation*: Parse `YYYY-MM-DD` first, then `DD/MM/YYYY`, and fall back to `MM/DD/YYYY` (M/D/YYYY), matching the user request.

---

## Manual Verification Checklist

1. **Dashboard navigation**: Verify "Bulk paste" button is visible and links to `/orders/bulk`.
2. **Text area pasting**: Copy real row blocks from Excel, paste, and click "Parse".
3. **Preview table inspection**: Check that valid rows are rendered with proper column mappings. Test invalid row indicators.
4. **Successful import**: Confirm records are written to the database (and visible on `/orders`).
5. **Skip duplicates**: Verify pasting the same block again increments the `skipped` count but does not add duplicates.
6. **Graceful error handling**: Ensure invalid formats are reported in an error banner.
7. **Typecheck & Build**: Verify no TS/Next.js build compilation errors occur.
