# Implementation Plan: Sprint S5 — Excel Import

## Goal

Add "Import Excel" to `/orders`. User uploads `.xlsx` → server parses with SheetJS
→ previews every parsed row in a scrollable modal → confirm → save valid rows to DB
(skip duplicates).

## File Tree

### New files
```
src/app/api/orders/import/route.ts           POST — parse xlsx → preview all rows
src/app/api/orders/import/confirm/route.ts   POST — upsert rows to DB
src/components/orders/ImportOrdersModal.tsx  client modal — state machine
src/components/orders/OrdersActionBar.tsx    "use client" action bar wrapper
src/lib/excel/parseOrderList.ts              SheetJS parser → ParsedOrder[]
docs/specs/s5-excel-import.md               this file
```

### Modified files
```
src/app/orders/page.tsx   render <OrdersActionBar> instead of inline button
src/types/index.ts        add ParsedOrder type
```

### Protected files NOT touched
- CLAUDE.md, prisma/schema.prisma, .env, .env.local

## Dependencies

| Package | Reason | npm URL | Verified? |
|---------|--------|---------|-----------|
| `xlsx` (SheetJS) | Parse .xlsx files | https://www.npmjs.com/package/xlsx | ✅ |

## Steps

1. `npm install xlsx`
2. Add `ParsedOrder` type to `src/types/index.ts`
3. Create `src/lib/excel/parseOrderList.ts`
4. Create `src/app/api/orders/import/route.ts` (parse preview, no DB write)
5. Create `src/app/api/orders/import/confirm/route.ts` (upsert to DB)
6. Create `src/components/orders/ImportOrdersModal.tsx`
7. Create `src/components/orders/OrdersActionBar.tsx`
8. Update `src/app/orders/page.tsx` — replace inline button with `<OrdersActionBar>`
9. `tsc --noEmit` + `npm run dev` verification

## Key design decisions

- `orders/page.tsx` remains a Server Component (keeps `metadata` + Prisma fetch).
  Action bar extracted to `OrdersActionBar` ("use client") — idiomatic App Router pattern.
- Upsert uses `piNumber_subLineIndex` compound key (Prisma auto-generates this name
  from the `@@unique([piNumber, subLineIndex])` constraint).
- Preview API does NOT write to DB — two-step safety.
- Confirm route receives `ParsedOrder[]` from client — validated with Zod before any DB write.

## Risks

1. **Column mapping vs actual file** — 7/10 confidence. Parser is defensive (skip malformed rows).
   Preview lets Tung visually verify before confirming.
2. **`upsert` compound key name** — `piNumber_subLineIndex` (standard Prisma naming). 8/10.
3. **uvPct in Excel** — stored as decimal (0.02 = 2%). No conversion needed. 8/10.

## Manual tests

1. `npm run dev` → 0 TS errors
2. Import button visible on /orders
3. Modal opens on click
4. Non-.xlsx → error message
5. File > 10MB → error message
6. Valid .xlsx → preview contains every parsed row and reports invalid rows
7. Confirm → success banner with import count
8. Same file again → skipped count matches
9. File with more than 5,000 rows → rejected before confirm with a clear limit
10. schema.prisma not modified

## Out of Scope

❌ CSV/.xls import, edit rows in preview, schedule/materials import, auth, audit log

## Current handover implementation (S1–S8)

The original S5 note above is historical. The current implementation also
covers the existing order, inventory and Packing flows under the
`complete-existing-flows` plan. The following rules are now enforced:

- Order import is preview-only until confirmation. Rows are classified as new,
  identical, conflict or invalid by `PI + NO`. Conflicts keep the stored order;
  a user must edit the order detail screen. Replaying the same file is a
  no-op. Approved orders are validated again before writes, and edits can use
  an optimistic `updatedAt` token.
- Inventory reports are scoped by material group and report date. `LAST STOCK`
  is the authoritative closing value. An identical retry does not add another
  movement; a changed report for the same day requires explicit replacement;
  an older report cannot overwrite a newer report. Snapshot provenance is
  additive and must be deployed before the inventory confirm endpoint is used.
- Packing rows are identified by calendar `date`, never by filename. A renamed
  file is a no-op when its six values match. A changed existing day requires an
  explicit date replacement; rows/days missing from the payload are retained.
  Explicit zero and blank/null remain different values, and every confirm is
  locked and atomic.

The First Bar / Middle Bar / Back Bar screenshot is technical yarn and colour
input. It does not define a deterministic customer-approved formula, so A/B
selection and beam/MB formula work remain a separate plan and are deliberately
not implemented here.
