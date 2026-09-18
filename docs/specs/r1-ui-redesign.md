# Implementation Plan: R1 — UI Redesign

## Goal

Replace dark theme with Korean minimal light theme across all pages.
New layout: 64px fixed top nav + 280px fixed left side nav.
New design tokens: navy primary, warm white surface, Inter + Noto Sans KR + Material Symbols.
Zero logic changes. All API routes untouched.

## File Tree

### Modified files
```
tailwind.config.ts
src/app/globals.css
src/app/layout.tsx
src/app/orders/page.tsx
src/components/orders/OrderTable.tsx
src/app/orders/new/page.tsx
src/components/orders/NewOrderForm.tsx
src/app/orders/[id]/page.tsx
src/components/orders/OrderDetail.tsx
src/app/schedule/page.tsx
src/app/materials/page.tsx
src/components/orders/ImportOrdersModal.tsx
```

### New files
```
docs/specs/r1-ui-redesign.md
```

### Protected files NOT touched
- CLAUDE.md, prisma/schema.prisma, .env, .env.local
- src/app/api/ (all API routes)
- src/lib/ (parser, validations, db)
- src/types/index.ts

## Dependencies

None — Google Fonts loaded via CSS @import (no npm package).

## Steps

1. Update tailwind.config.ts — color tokens, borderRadius, spacing, fontFamily, fontSize
2. Update globals.css — Google Fonts CDN, body reset, Material Symbols
3. Update layout.tsx — top nav + side nav + content offset (pl-[280px] pt-[64px])
4. Update orders/page.tsx — KPI cards (computed from existing fetch)
5. Update OrderTable.tsx — new row styles, navy PI badge, hover View button
6. Update orders/new/page.tsx + NewOrderForm.tsx — breadcrumb, card, light inputs
7. Update orders/[id]/page.tsx + OrderDetail.tsx — header, detail card, light dialog
8. Update schedule/page.tsx — light theme, amber MOCK banner
9. Update materials/page.tsx — light theme, amber MOCK banner
10. Update ImportOrdersModal.tsx — button + modal light theme
11. tsc --noEmit + npm run dev verification

## Risks

1. `pl-[280px]` breaks narrow viewport — accepted (desktop-first per spec)
2. Material Symbols requires internet — acceptable for factory internal tool
3. `text-display` as fontSize key — no conflict with Tailwind's display utilities
4. `border-[0.5px]` — Tailwind v3 arbitrary values, confirmed supported

## Manual tests (18 checks)
See full plan artifact for complete list.

## Out of Scope
❌ Mobile responsive, dark mode toggle, new pages/routes, auth UI, logic changes
