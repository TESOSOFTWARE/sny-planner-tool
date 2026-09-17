# Implementation Plan: Sprint S2 — New Order Form

## Goal

Build a `/orders/new` page with a full-featured form that lets SNY factory staff enter
a new production order. The form captures 7 required fields (piNumber, subLineIndex,
customer, orderDate, widthM, lengthM, gsm, color) plus an optional metadata section.
Client-side validation runs immediately via react-hook-form + zod resolver; server-side
validation runs again in the API route before saving. On success, a green banner appears
and the form auto-clears after 2 seconds. The "New Order" button in the orders list
becomes a live link to `/orders/new`.

---

## 🚨 Critical Issues

### Issue 1 — Missing packages
`react-hook-form` and `zod` are NOT in `package.json`. Must install:
- `zod` ^3.x
- `react-hook-form` ^7.x
- `@hookform/resolvers` ^3.x (required bridge)

### Issue 2 — Optional fields not in schema.prisma
Fields `qty`, `uvPct`, `frFlag`, `description`, `remark` are not in the DB schema.
`schema.prisma` is protected. Using **Option A**: form UI shows these fields with
a "Phase 2 — not yet saved" note; only the 8 schema-backed fields are persisted.

---

## File Tree (after S2 complete)

### New files
```
src/app/api/orders/route.ts
src/app/orders/new/page.tsx
src/components/orders/NewOrderForm.tsx
src/lib/validations/order.ts
docs/specs/s2-new-order-form.md
```

### Modified files
```
src/app/orders/page.tsx     — "New Order" button → Link to /orders/new
```

### Protected files NOT touched
- CLAUDE.md, prisma/schema.prisma, .env, .env.local

---

## Dependencies

| Package | Version | Reason | npm URL | Verified? |
|---------|---------|--------|---------|-----------|
| `zod` | ^3.x | Validation schema | https://www.npmjs.com/package/zod | ✅ |
| `react-hook-form` | ^7.x | Form state management | https://www.npmjs.com/package/react-hook-form | ✅ |
| `@hookform/resolvers` | ^3.x | Zod resolver bridge | https://www.npmjs.com/package/@hookform/resolvers | ✅ |

---

## Steps

1. Install zod, react-hook-form, @hookform/resolvers
2. Create src/lib/validations/order.ts — Zod schema for 8 persistable fields
3. Create src/app/api/orders/route.ts — POST handler with Zod server validation + Prisma create
4. Create src/components/orders/NewOrderForm.tsx — client form with react-hook-form
5. Create src/app/orders/new/page.tsx — server component wrapper
6. Update src/app/orders/page.tsx — enable New Order button as Link
7. npm run dev + tsc --noEmit verification

---

## Risks

1. `subLineIndex` default: form shows 1 (prompt), schema stores 0-based — document clearly
2. Prisma P2002 unique constraint: handled explicitly in API route catch block
3. orderDate string → DB DateTime: `new Date(input.orderDate)` in API route
4. Optional fields data loss: clear UI label prevents user confusion (Option A)

---

## Manual tests Tung must run after S2

1. npm run dev → no TypeScript errors
2. /orders → "New Order" is clickable link
3. /orders/new → form renders
4. Submit empty form → 7 required field errors shown
5. Fill + submit → green banner → form clears after 2 seconds
6. Check /orders → new order in table
7. Duplicate PI + sub-line → clear error message
8. CLAUDE.md not modified
9. schema.prisma not modified

---

## Out of Scope for S2

- Optional fields saved to DB (Phase 2 schema migration needed)
- Edit / delete order (S3)
- Auto-calculations (Phase 2)
- Auth, file upload, schedule/materials changes
