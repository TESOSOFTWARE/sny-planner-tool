# Implementation Plan: Sprint S1 — Order List

## Goal

Replace the empty orders shell page with a real, data-driven production orders list.
S1 fetches all `ProductionOrder` rows from the Neon PostgreSQL database directly inside
a Next.js 14 Server Component (no intermediate API route needed for this read-only
page — simpler and type-safe). Data is passed to a Client Component (`OrderTable`)
that renders a styled dark-theme table with 7 columns and a live search bar filtering
by PI Number and Customer simultaneously. Total/filtered count is shown. The "New Order"
button remains visible but disabled.

> **⚠️ CLAUDE.md not found.** Still proceeding from the prompt. No conflicts to resolve.

> **⚠️ Seed data mismatch — verification test "Land":**
> The prompt says `Type "Land" in search → filters to show only Landmaster orders`,
> but the S0 seed data contains NO "Landmaster" customer. Actual seed customers are:
> ADIDAS VIETNAM, NIKE TRADING (VIETNAM), PUMA SE GERMANY, DECATHLON VIETNAM.
> **Resolution:** The search component will work correctly. For the manual test I will
> substitute `"NIKE"` as the example search term. If Tung has added a Landmaster order
> to the DB already, it will also appear. No code change needed — just a test label
> correction. **Tung: please confirm or add a Landmaster order if needed.**

---

## File Tree (after S1 complete)

### New files
```
src/
├── components/
│   └── orders/
│       └── OrderTable.tsx        [NEW] — client component, table + search
└── types/
    └── index.ts                  [NEW] — shared TypeScript types
```

### Modified files
```
src/app/orders/page.tsx           [MODIFY] — replace shell with real data fetch + OrderTable
docs/specs/s1-order-list.md      [NEW] — this plan file
```

> **Note on API route (Task 1):** The prompt lists a `src/app/api/orders/route.ts`
> as Task 1, but then says "fetch orders from API route OR directly via Prisma
> (choose simpler)." I will skip the API route and fetch directly from Prisma
> inside the Server Component. This is the idiomatic Next.js 14 App Router pattern
> for read-only server-rendered pages — fewer files, no extra HTTP round-trip, fully
> type-safe. An API route will be added in S2 when form submissions need it.

### Protected files NOT touched
- `CLAUDE.md` (does not exist — will not be created)
- `prisma/schema.prisma` (read-only in S1)
- `.env` / `.env.local` (never modified by code)
- `src/lib/db.ts` (used as-is)
- `src/app/layout.tsx` (used as-is)

---

## Dependencies

| Package | Version | Reason | npm URL | Verified? |
|---------|---------|--------|---------|-----------|
| *none* | — | All required packages already in `package.json` | — | ✅ |

> No new npm installs required.

---

## Steps

1. **Create `src/types/index.ts`** — Export `ProductionOrder` type using Prisma's
   `Prisma.ProductionOrderGetPayload<{}>` utility (stays in sync with schema automatically).
   Also export a `SerializedProductionOrder` type where `orderDate`, `createdAt`,
   `updatedAt` are `string` (for safe Server→Client serialisation).

2. **Create `src/components/orders/OrderTable.tsx`** — `"use client"` component.
   Props: `orders: SerializedProductionOrder[]`. Contains `useState` for search,
   derived filtered list, count label, search input, 7-column table, DD/MM/YYYY
   date formatting, empty state, dark Tailwind theme.

3. **Update `src/app/orders/page.tsx`** — Server Component. Fetches via
   `prisma.productionOrder.findMany`, serialises dates to ISO strings, passes to
   `<OrderTable>`. Keeps page header + disabled "New Order" button. Try/catch for
   DB errors renders an error banner.

4. **Write `docs/specs/s1-order-list.md`** — this file (written to project).

5. **Run `npm run dev`** — verify no TypeScript errors, table renders data, search works.

---

## Risks

1. **DB not seeded yet** — `findMany` will return empty array, not crash.
   - Mitigation: Error banner if DB is unreachable; empty state if seeded but empty.

2. **`Date` objects not serializable across Server→Client boundary** — Next.js 14
   warns if you pass non-plain objects as props to Client Components.
   - Mitigation: Convert all Date fields to ISO strings in the Server Component
     before passing. Client Component types use `string` for date fields.

3. **Seed "Landmaster" mismatch** — no code impact, documented above.

---

## Manual tests Tung must run after S1

1. `npm run dev` → no TypeScript errors in terminal.
2. `/orders` → table shows **5 seed orders**.
3. Type `NIKE` → 2 rows (PI-2024-002 sub-lines 0 and 1).
4. Type `PI-2024-001` → 1 row.
5. Type `ADIDAS` → 1 row.
6. Clear search → `Showing 5 of 5 orders`.
7. Type `zzz` → `No orders found` empty state.
8. "New Order" button: visible, greyed out, not clickable.
9. `CLAUDE.md` not created or modified.
10. `prisma/schema.prisma` not modified.

---

## Out of Scope for S1

- ❌ `src/app/api/orders/route.ts` — not needed for read-only server page
- ❌ New Order form (S2)
- ❌ Edit / delete orders
- ❌ Pagination
- ❌ Column sorting
- ❌ Server-side search / DB filtering
- ❌ Status column in table
- ❌ Schedule / materials changes
- ❌ Auth / login
