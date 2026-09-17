# Implementation Plan: Sprint S3 — Order Detail

## Goal

Build a `/orders/[id]` detail page reachable by clicking any row in the order list.
VIEW mode (default) shows all fields read-only. A pencil icon enters EDIT mode where
fields become editable inputs. Saving PATCHes the API and returns to VIEW mode with
updated data. A Delete button opens a confirmation dialog before permanently removing
the order and redirecting to `/orders`. Rows in `OrderTable` become clickable.

---

## File Tree (after S3 complete)

### New files
```
src/app/api/orders/[id]/route.ts     GET + PATCH + DELETE for single order
src/app/orders/[id]/page.tsx         server component wrapper
src/components/orders/OrderDetail.tsx client component — VIEW/EDIT modes + delete dialog
docs/specs/s3-order-detail.md        this plan
```

### Modified files
```
src/lib/validations/order.ts         add updateOrderSchema (all fields optional)
src/components/orders/OrderTable.tsx clickable rows → /orders/[id]
```

### Protected files NOT touched
- CLAUDE.md, prisma/schema.prisma, .env, .env.local

---

## Dependencies

| Package | Version | Reason | npm URL | Verified? |
|---------|---------|--------|---------|-----------|
| *none* | — | All packages already in package.json | — | ✅ |

---

## Steps

1. Add `updateOrderSchema` to `src/lib/validations/order.ts`
2. Create `src/app/api/orders/[id]/route.ts` (GET / PATCH / DELETE)
3. Create `src/components/orders/OrderDetail.tsx` (VIEW + EDIT modes + delete dialog)
4. Create `src/app/orders/[id]/page.tsx` (server fetch + serialize + render)
5. Update `src/components/orders/OrderTable.tsx` (clickable rows via useRouter)
6. Run `npm run dev` + `tsc --noEmit` verification

---

## Risks

1. `<tr>` is not a valid Link target — using `onClick + router.push()` instead
2. `orderDate` ISO string → `YYYY-MM-DD` slice needed for date input pre-fill
3. PATCH null clearing — optional fields set to null must be explicitly passed (not skipped)
4. `Decimal` uvPct — Prisma accepts number for Decimal in update, same as create

---

## Manual tests Tung must run after S3

1. npm run dev → no TypeScript errors
2. Click any row → navigates to /orders/[id]
3. Detail page shows all fields, breadcrumb shows PI Number
4. Pencil → EDIT mode, fields pre-filled
5. Change field → Save → VIEW mode with updated value
6. Pencil → change → Cancel → original values, VIEW mode
7. Delete → dialog appears
8. Cancel dialog → no delete
9. Delete → Confirm → redirects to /orders, order gone
10. /orders/fake-id → redirects to /orders
11. CLAUDE.md not modified
12. schema.prisma not modified

---

## Out of Scope for S3

- ❌ Bulk delete, status workflow, auto-calculations, auth, file upload, M2/M3, audit log
