# Implementation Plan: Sprint S4 — M2 + M3 Mock Pages

## Goal

Replace the empty placeholder body in both S0 shell pages with mock content.
M2 `/schedule`: 40-machine × days-of-month grid with month navigation (useState).
M3 `/materials`: 3 summary cards + 5-row static table with coloured status badges.
No DB, no calculations, no new packages.

## File Tree

### Modified files
```
src/app/schedule/page.tsx    replace placeholder with grid + month nav ("use client")
src/app/materials/page.tsx   replace placeholder with summary cards + table (server)
docs/specs/s4-mock-pages.md  this plan
```

### Protected files NOT touched
- CLAUDE.md, prisma/schema.prisma, .env, .env.local, src/app/layout.tsx

## Dependencies

| Package | Version | Reason | Verified? |
|---------|---------|--------|-----------|
| *none* | — | No new packages needed | ✅ |

## Steps

1. Update src/app/schedule/page.tsx — "use client", useState month, 40×days grid
2. Update src/app/materials/page.tsx — server component, 3 cards, 5-row table
3. Write docs/specs/s4-mock-pages.md (this file)
4. npm run dev + tsc --noEmit verification

## Key design notes

- `"use client"` on schedule page requires removing `export const metadata`
  (not allowed in client components). Root layout title is used instead — acceptable for mock.
- Days in month: `new Date(year, month + 1, 0).getDate()` — no extra package.
- Grid overflow-x scrollable for narrow screens.
- Materials data: plain JS array const, no DB.

## Risks

1. `metadata` export incompatible with `"use client"` — resolved by removal (root title used).
2. Wide grid on mobile — resolved by `overflow-x-auto` wrapper.

## Manual tests after S4

1. npm run dev → no TS errors
2. /schedule → MOCK banner, 40 machine rows, day columns for current month
3. < / > buttons → month changes
4. /materials → MOCK banner, 3 cards, 5 rows
5. Badges: OK=green, LOW=amber, CRITICAL=red
6. No API network requests on either page
7. CLAUDE.md not modified, schema.prisma not modified

## Out of Scope

❌ Real scheduling/inventory logic, DB connection, drag-drop, auth, Excel import
