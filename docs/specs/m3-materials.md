# Implementation Plan: M3 — Materials

## Goal

Replace the mock `src/app/materials/page.tsx` with a fully functional Materials module.
Planners can manually track raw material inventory (current stock vs minimum threshold) with low-stock warnings.
No link to orders or assignments. No formula calculations. Unit: kg only.

---

## File Tree

### New files

| File | Purpose |
|---|---|
| `src/app/api/materials/route.ts` | GET all, POST new material |
| `src/app/api/materials/[id]/route.ts` | PATCH (edit), DELETE |
| `src/components/materials/AddMaterialModal.tsx` | Add new material modal |
| `src/components/materials/EditMaterialModal.tsx` | Edit existing material modal |

### Modified files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Material` model |
| `src/app/materials/page.tsx` | Replace MOCK with functional client component |

### Protected (DO NOT TOUCH)

- `CLAUDE.md` / `.env` / `.env.local`
- `src/app/api/orders/*`
- `src/app/api/assignments/*`
- All `src/components/orders/*` and `src/components/schedule/*`
- `package.json` build script

---

## Dependencies

| Package | Reason | Already installed? |
|---|---|---|
| `prisma` | Schema + migrations | ✅ v5.22.0 |
| `@prisma/client` | DB queries | ✅ v5.22.0 |
| `zod` | API validation | ✅ v4.x |

> **No new packages required.**

---

## Steps (max 10)

1. **Schema** — Add `Material` model to `prisma/schema.prisma`
2. **DB push** — `npx prisma db push` + `npx prisma generate`
3. **API: GET + POST** — `src/app/api/materials/route.ts`
4. **API: PATCH + DELETE** — `src/app/api/materials/[id]/route.ts`
5. **AddMaterialModal** — `src/components/materials/AddMaterialModal.tsx`
6. **EditMaterialModal** — `src/components/materials/EditMaterialModal.tsx`
7. **Materials page** — Replace `src/app/materials/page.tsx` with functional client component
8. **tsc --noEmit** — Confirm 0 errors
9. **Smoke test** — Add MF 500kg / FR 50kg → verify badges + summary cards
10. **Verify protected routes untouched**

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `Decimal` serialization server → client | Medium | Serialize `currentStock` + `minThreshold` as strings over JSON; compare as `parseFloat()` in UI |
| `materials/page.tsx` grows > 150 lines | Medium | Extract `MaterialsTable.tsx` if needed |
| CLAUDE.md marks M3 as out of scope | N/A | This prompt explicitly overrides it |

---

## Manual Tests

1. `/materials` → no MOCK banner, empty state shown, "Add material" button visible
2. Add MF, stock=500, threshold=200 → **Đủ hàng** badge (green)
3. Add FR, stock=50, threshold=200 → **Cần nhập thêm** badge (red), stock in red text
4. Summary cards: **2** materials, **1** low-stock alert, **550 kg** total
5. Edit MF: stock → 100 → badge flips to **Cần nhập thêm**; low-stock count → 2
6. Delete FR → row removed; total → 1 material, 100 kg
7. `GET /api/orders` still returns orders (no regression)
8. `tsc --noEmit` → 0 errors
9. `npm run build` → ✓ Compiled successfully
