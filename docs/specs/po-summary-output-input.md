# Implementation Plan: PO Summary + Output Input Sprint

## Goal

Add three improvements driven by end-user feedback (Loan, planner; Dung, scheduler):

1. **PO Summary view** — a new `/orders/summary` page that groups all sub-lines by PI Number.
2. **estimatedDailyOutput on MachineAssignment** — optional field for expected daily output (m/day).
3. **OrderDetail field audit** — surface `dataSource` and `qtySqm` in view mode.

## File Tree

### New files
- `src/app/orders/summary/page.tsx`
- `src/components/orders/POSummaryTable.tsx`

### Modified files
- `prisma/schema.prisma` (MachineAssignment: +estimatedDailyOutput)
- `src/lib/validations/assignment.ts`
- `src/app/api/assignments/route.ts`
- `src/app/api/assignments/[id]/route.ts`
- `src/components/schedule/AssignModal.tsx`
- `src/components/schedule/AssignFromOrderModal.tsx`
- `src/components/schedule/DetailModal.tsx`
- `src/components/orders/OrderDetail.tsx`
- `src/app/orders/page.tsx`

### Protected files NOT touched
- CLAUDE.md, .env, .env.local
- src/app/api/orders/route.ts
- src/app/api/orders/[id]/route.ts

## Schema changes

```diff
+ estimatedDailyOutput Decimal? @db.Decimal(10, 2)
```
Added to `MachineAssignment` after `allocatedMeters`. Nullable — additive only.

## Steps

1. Schema — add estimatedDailyOutput to MachineAssignment
2. npx prisma db push + generate
3. Validation — add estimatedDailyOutput to both schemas
4. API POST — destructure and pass to create
5. API PATCH — accept and persist estimatedDailyOutput
6. AssignModal — add UI input + state + body
7. AssignFromOrderModal — same
8. DetailModal — add type field + display
9. OrderDetail — add qtySqm + dataSource to view mode
10. POSummaryTable + page + orders page button

## Risks

1. db push against production — nullable field, zero data loss
2. Decimal serialisation — use Number() cast, same pattern as allocatedMeters
3. Same PI / different customers — grouped by piNumber, customer list joined with " / "
4. PATCH handler existed — verified before modifying
5. SerializedProductionOrder already includes qtySqm — verified in types/index.ts

## Manual tests Tung must run after build

1. /orders/summary loads — grouped PIs with counts
2. Click PI header → sub-lines expand
3. Search by PI fragment → filter works
4. Search by customer → filter works
5. AssignModal shows Sản lượng dự kiến input
6. Fill + assign → DetailModal shows value
7. Assign without value → saves without error
8. /orders/[id] shows qtySqm row (when not null) + Nguồn dữ liệu row
9. /orders, /schedule, /materials, /orders/[id] still work
10. CLAUDE.md, .env, .env.local untouched
11. api/orders/route.ts + [id]/route.ts untouched (timestamps)

## Out of Scope for this sprint

- Pricing fields
- Mark field
- Auto days-to-complete calculation
- Auto-scheduling / AI
- Actual output tracking
- Any /api/orders changes
- Net/Gross weight
- Auth, new packages, mobile responsive
