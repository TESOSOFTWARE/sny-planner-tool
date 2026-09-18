# Implementation Plan: Sprint S5 — Excel Import

## Goal

Add "Import Excel" to `/orders`. User uploads `.xlsx` → server parses with SheetJS
→ preview 20 rows in modal → confirm → upsert to DB (skip duplicates).

## File Tree

### New files
```
src/app/api/orders/import/route.ts           POST — parse xlsx → preview 20 rows
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
6. Valid .xlsx → 20-row preview
7. Confirm → success banner with import count
8. Same file again → skipped count matches
9. schema.prisma not modified

## Out of Scope

❌ CSV/.xls import, edit rows in preview, schedule/materials import, auth, audit log
