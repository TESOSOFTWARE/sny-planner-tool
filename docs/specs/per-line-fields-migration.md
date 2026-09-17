# Implementation Plan: Per-Line Fields Migration

## Goal

Chuyển `meshType`, `needleCount`, `beamCount`, và `gsm` từ **shared fields**
(1 giá trị cho toàn PI) thành **per-line fields** (mỗi sub-line khác nhau).
Thêm 2 field mới `eyeletLines` (Int?) và `eyeletSpec` (String?) vào schema.
Mục đích: phản ánh thực tế SNY — 1 PI có thể chứa nhiều loại lưới khác GSM.

---

## Audit: schema hiện tại

✅ Đã xác nhận trong `prisma/schema.prisma`:
- `meshType String?` — đã tồn tại
- `needleCount Int?` — đã tồn tại
- `beamCount Int?` — đã tồn tại
- `gsm Int` — đã tồn tại (per-line trong DB, nhưng đang ở shared section trên UI)
- `hasEyelet Boolean @default(false)` — GIỮ NGUYÊN, không xóa

---

## Schema changes

Chỉ THÊM 2 field mới. KHÔNG xóa bất kỳ field nào.

```diff
model ProductionOrder {
  // ... tất cả fields hiện tại giữ nguyên ...

+  // Eyelet spec chi tiết — per-line, bổ sung cho hasEyelet boolean (backward compat)
+  eyeletLines  Int?     // số lines eyelet: 2, 3, 4, 6...
+  eyeletSpec   String?  // mô tả: "5cm interval", "4-5cm middle", "single band both edges"
}
```

`prisma db push` — Tung chạy thủ công sau khi review plan, KHÔNG auto-chạy.

---

## Data migration

Script `scripts/migrate-perline-fields.ts`:

```
1. Lấy tất cả ProductionOrder, group theo piNumber
2. Với mỗi PI group:
   a. Lấy firstLine = sub-line có subLineIndex nhỏ nhất
   b. Với mỗi sub-line còn lại:
      - nếu meshType == null → set meshType = firstLine.meshType
      - nếu needleCount == null → set needleCount = firstLine.needleCount
      - nếu beamCount == null → set beamCount = firstLine.beamCount
      - eyeletLines, eyeletSpec → để null (không có giá trị cũ để copy)
      - gsm KHÔNG thay đổi (đã là per-line trong DB, giá trị cũ đã đúng)
3. Log: số PI groups, số orders updated, số orders skipped (đã có đủ data)
4. --dry-run mode: in before/after cho mỗi record, KHÔNG write DB
```

---

## UI changes

### Task 3: `src/components/orders/MultiLineOrderForm.tsx`

**Shared section — XÓA:**
- `gsm` input (disabled placeholder hiện tại — xóa hoàn toàn khỏi shared section)
- `meshType` input
- `needleCount` input
- `beamCount` input

**Shared section — GIỮ LẠI:**
- PI Number, Customer, Order Date, MB Code, Description, Remark

**Per-line `OrderLine` component — THÊM:**
- `gsm` input — đã có trong per-line, giữ nguyên
- `meshType` — text input, optional, label "Loại lưới"
- `needleCount` — number input, optional, label "Số kim"
- `beamCount` — number input, optional, label "Số dàn"
- `eyeletLines` — number input, optional, label "Số lines eyelet"
- `eyeletSpec` — text input, optional, label "Mô tả eyelet",
  placeholder "VD: 5cm interval, single band both edges"

**Copy từ dòng trước khi "+ Thêm dòng":**
Thay `append(DEFAULT_LINE)` bằng `append({...lastLine, color: ''})` để copy
TẤT CẢ per-line fields trừ color (vì color thường khác). Planner chỉ sửa field nào khác.

**Validation schema `src/lib/validations/order.ts`:**
- Xóa `meshType`, `needleCount`, `beamCount` khỏi top-level `multiLineOrderSchema`
- Thêm vào `lineSchema`: `meshType`, `needleCount`, `beamCount`, `eyeletLines`, `eyeletSpec`
- Thêm vào `createOrderSchema` và `updateOrderSchema`: `eyeletLines`, `eyeletSpec`

### Task 4: `src/components/orders/OrderDetail.tsx`

Trong VIEW mode, section kỹ thuật, thay/bổ sung phần Eyelet:

```
Eyelet hiển thị logic (ưu tiên từ trên xuống):
1. eyeletLines != null → "X lines" + (eyeletSpec ? " — {eyeletSpec}" : "")
2. eyeletLines == null && hasEyelet == true → "Có" (backward compat)
3. cả hai → "Không"
```

Trong EDIT mode: thêm `eyeletLines` (number) + `eyeletSpec` (text) vào form.
Cập nhật `updateOrderSchema` và default values.

### Task 5: `src/components/orders/POSummaryTable.tsx`

Per-line expanded row, thêm cột:
- `meshType` — hiện text, hide cột nếu null cho toàn bộ sub-lines
- `Eyelet` — render: eyeletLines ? `{eyeletLines} lines${eyeletSpec ? ', ' + eyeletSpec : ''}` : (hasEyelet ? 'Có' : '—')
- `needleCount` và `beamCount` đã có (lines 99–100 hiện tại) — kiểm tra lại header label

### Task 6: `src/app/api/orders/multi-line/route.ts`

Đọc `meshType`, `needleCount`, `beamCount` từ **mỗi `line`** thay vì từ top-level.
Thêm `eyeletLines`, `eyeletSpec` từ mỗi `line`.

> ⚠️ Prompt gốc nói "ngoài việc accept 4 fields mới trong request body" cho
> `api/orders/route.ts` và `api/orders/[id]/route.ts` — nhưng `multi-line/route.ts`
> **phải sửa** vì đây là route chính cho new order form. Confirm với Tung.

### Task 7: `src/types/index.ts`

Thêm `eyeletLines: number | null` và `eyeletSpec: string | null`
vào `SerializedProductionOrder` type.

---

## Files

### New files
- `docs/specs/per-line-fields-migration.md` — plan này
- `scripts/migrate-perline-fields.ts` — backfill script

### Modified files
- `prisma/schema.prisma` — thêm `eyeletLines`, `eyeletSpec`
- `src/lib/validations/order.ts` — move meshType/needleCount/beamCount vào lineSchema, thêm eyeletLines/eyeletSpec
- `src/components/orders/MultiLineOrderForm.tsx` — shared → per-line migration, copy-from-prev
- `src/components/orders/OrderDetail.tsx` — hiển thị eyeletLines/eyeletSpec + backward compat
- `src/components/orders/POSummaryTable.tsx` — thêm meshType/eyelet columns
- `src/app/api/orders/multi-line/route.ts` — đọc meshType/needleCount/beamCount từ line (KHÔNG từ top-level)
- `src/types/index.ts` — thêm 2 fields mới vào SerializedProductionOrder

### Protected (không sửa)
- `CLAUDE.md`, `.env`, `.env.local`
- `src/app/api/orders/route.ts`
- `src/app/api/orders/[id]/route.ts`

---

## Open Question — cần Tung confirm trước khi build

**Q1:** `src/app/api/orders/multi-line/route.ts` hiện đang đọc `meshType`,
`needleCount`, `beamCount` từ top-level của request body (shared). Sau migration,
cần đọc từ mỗi `line`. File này có nằm trong danh sách protected không?

Prompt gốc viết: "ngoài việc accept 4 fields mới trong request body" cho
`api/orders/route.ts` và `api/orders/[id]/route.ts` — nhưng KHÔNG nhắc
`multi-line/route.ts`. Tuy nhiên về mặt logic, `multi-line/route.ts` PHẢI sửa.

→ **Recommendation:** Tung confirm `multi-line/route.ts` được sửa (không phải protected).

---

## Risks

1. **Data integrity:** Backfill chỉ copy từ sub-line index nhỏ nhất. Nếu sub-line 0
   cũng null meshType (order import cũ), toàn PI vẫn null sau backfill. Chấp nhận
   được — planner nhập tay sau.

2. **API backward compat:** `api/orders/route.ts` (POST legacy) và
   `api/orders/[id]/route.ts` (PATCH) vẫn nhận `meshType` ở top-level body
   (single-order flow). PATCH trong OrderDetail.tsx cũng vẫn gửi đúng field.
   Không breaking.

3. **Import/Bulk paste:** Parser không thay đổi. Các đơn import vẫn có null
   cho eyeletLines/eyeletSpec — backward compat đảm bảo bởi optional fields.

4. **POSummaryTable N+1 không tăng:** không fetch thêm gì mới.

5. **Copy-from-prev UX:** Nếu planner nhập sai GSM dòng 1 rồi mới phát hiện,
   dòng 2 trở đi sẽ copy GSM sai. Edge case — chấp nhận được, planner sửa tay.

---

## Manual tests Tung must run (Phase C)

1. `tsc --noEmit` → 0 errors
2. `npm run dev` → 0 compile errors
3. Dry-run script: `npx tsx scripts/migrate-perline-fields.ts --dry-run`
   → in đúng số PI groups, số orders cần update
4. Mở `/orders/new-multi` → GSM, meshType, needleCount, beamCount **chỉ** xuất
   hiện ở per-line section, KHÔNG còn ở shared section
5. Tạo đơn 2 sub-lines: sub-line 1 = GSM 95 / Diamond, sub-line 2 = GSM 140 / Hex
   → save → Order Detail hiện đúng 2 GSM, 2 meshType khác nhau
6. Nhập eyeletLines=4, eyeletSpec="5cm interval" cho sub-line 1 → save →
   Order Detail hiện "4 lines — 5cm interval"
7. Mở order cũ (hasEyelet=true, eyeletLines=null) → hiện "Eyelet: Có"
8. Mở order cũ (hasEyelet=false, eyeletLines=null) → hiện "Eyelet: Không"
9. Click "+ Thêm dòng" → fields copy từ dòng trước (GSM, meshType, needleCount, beamCount)
10. PO Summary → expand PI có 2 sub-lines khác GSM → thấy đúng 2 GSM, 2 meshType khác nhau

---

## Out of Scope

- ❌ Xóa `hasEyelet` field — giữ lại backward compat
- ❌ Pricing fields (U/Price, Amount, Total)
- ❌ Status badge/filter
- ❌ Auth/roles
- ❌ Thay đổi KnittingDailyOutput hoặc MachineAssignment
- ❌ Import Excel / Bulk paste (không thay đổi parser)
- ❌ `api/orders/route.ts` và `api/orders/[id]/route.ts` (protected)
