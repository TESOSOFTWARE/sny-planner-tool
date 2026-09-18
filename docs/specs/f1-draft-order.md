# SPEC — Sprint F1: Draft Order (Đơn Nháp)

> **Role:** Senior Full-Stack Engineer  
> **Status:** PLAN ONLY — Updated with Null-Safety Audit & Import Rules  
> **Protected File Warning:** Touches `src/app/api/orders/route.ts` and `src/app/api/orders/multi-line/route.ts` — additive changes only, strictly adhering to CLAUDE.md rules.

---

## 1. Context & Business Goal

- **Persona:** Dung (planner tại nhà máy SNY VINA).
- **Pain point:** Đôi khi nhân viên kinh doanh báo thông tin đơn hàng chưa đầy đủ (mới có tên KH + mã PI, chưa chốt khổ/GSM/mét cuộn/màu). Dung cần tạo "Đơn nháp" để lưu hệ thống trước, tránh quên đơn, rồi bổ sung thông tin và "Duyệt" sau.
- **Rules chốt với Tung:**
  1. **Tạo nháp:** Checkbox "Đây là đơn nháp" khi tạo đơn qua `/orders/new-multi`. Lưu nháp chỉ bắt buộc `piNumber` + `customer`.
  2. **Nút "Duyệt":** Hiển thị trên Order Detail khi `isDraft = true`. Bấm "Duyệt" sẽ validate lại toàn bộ theo `multiLineOrderSchema`. Nếu thiếu thông tin → chặn duyệt, báo rõ các field còn thiếu. Nếu đủ → set `isDraft = false`.
  3. **Chặn Schedule (M2):** Đơn nháp **KHÔNG ĐƯỢC phép gán vào Lịch sản xuất** — filter/disable trong `AssignModal` và `AssignFromOrderModal`.
  4. **Badge "NHÁP":** Hiển thị badge màu cam/vàng riêng biệt (khác `OrderStatusBadge`) trên `OrderTable`, `OrderDetail`, `POSummaryTable`.

---

## 2. Proposed Changes

### A. Prisma Schema (`prisma/schema.prisma`)

Add `isDraft` field to `ProductionOrder` model:

```prisma
model ProductionOrder {
  id           String   @id @default(cuid())
  piNumber     String
  subLineIndex Int      @default(0)
  customer     String
  customerId   String?
  customerRef  Customer? @relation(fields: [customerId], references: [id])
  orderDate    DateTime

  // Fabric specs (optional for draft, required for approved orders)
  widthM       Float?   // nullable for draft orders
  lengthM      Float?   // nullable for draft orders
  gsm          Int?     // nullable for draft orders
  color        String?  // nullable for draft orders

  // New field: Draft status
  isDraft      Boolean  @default(false)

  // ... (all other fields remain unchanged)

  @@index([isDraft])
}
```

---

### B. Zod Validation Schemas (`src/lib/validations/order.ts`)

Define 2 separate schema validation modes:

1. **`draftMultiLineOrderSchema` (Minimal validation for drafts):**
   - Required: `piNumber` (non-empty string), `customer` (non-empty string).
   - `orderDate`: optional (defaults to current UTC date if empty).
   - All line fields (`widthM`, `gsm`, `color`, `lengthM`, `qty`, `rollLength`) are optional/nullable.

2. **`multiLineOrderSchema` (Existing full validation for normal orders & approval):**
   - Required: `piNumber`, `customer`, `orderDate`, and per-line `color`, `widthM > 0`, `gsm > 0`, `lengthM > 0` (or `qty > 0` + `rollLength > 0`).

---

### C. Import Flow Scoping (MANDATORY RULE)

- **Excel Import (`ImportOrdersModal`) & Bulk Paste (`/orders/bulk`)**:
  - **XÁC NHẬN RÕ:** 2 luồng import này **KHÔNG HỖ TRỢ tạo đơn nháp** trong sprint này. Chỉ áp dụng tạo nháp cho form nhập thủ công `/orders/new-multi`.
  - Nếu file Excel hoặc văn bản dán thiếu bất kỳ field bắt buộc nào (Khổ, GSM, Màu sắc, Chiều dài), luồng import vẫn báo lỗi validation như cũ, **KHÔNG tự động chuyển thành đơn nháp**.

---

### D. API Routes (`src/app/api/orders/...`)

1. **`POST /api/orders/multi-line`**:
   - Accepts `isDraft: boolean` in request body.
   - If `isDraft === true`: validates payload using `draftMultiLineOrderSchema`.
   - Saves records with `isDraft: true`.
   - If `widthM` or `gsm` are missing: sets `qtySqm = null`, `totalWeightKgs = null`.

2. **`POST /api/orders/[id]/approve` (or `PATCH /api/orders/[id]` with `action: "approve"`)**:
   - Validates the target order (and all sub-lines of the same PI) against `multiLineOrderSchema`.
   - If validation fails: returns `422 Unprocessable Entity` with `missingFields: string[]` (e.g. `["Khổ (m)", "GSM", "Màu sắc"]`).
   - If validation passes: recalculates `qtySqm` and `totalWeightKgs`, updates `isDraft = false`.

---

### E. UI Components

1. **`MultiLineOrderForm.tsx` (`/orders/new-multi`)**:
   - Add checkbox at top section: `[ ] Đây là đơn nháp (lưu tạm khi thông tin chưa đầy đủ)`.
   - When checked: client-side validation relaxes to `piNumber` + `customer` only.

2. **Badge "NHÁP" (`DraftBadge.tsx`)**:
   - Displays in parallel with `OrderStatusBadge` on `OrderTable.tsx`, `OrderDetail.tsx`, `POSummaryTable.tsx`.
   - Styling:
     ```tsx
     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-[#FFF8E7] text-[#D97706] border border-[#F59E0B]/30">
       <span className="material-symbols-outlined text-[14px]">edit_note</span>
       NHÁP
     </span>
     ```

3. **`OrderDetail.tsx` (`/orders/[id]`)**:
   - If `isDraft === true`:
     - Display top banner: `⚠️ ĐƠN NHÁP — Thông tin đơn hàng chưa đầy đủ. Cần bổ sung thông tin và Duyệt trước khi gán vào Lịch sản xuất.`
     - Display prominent primary button: **"Duyệt đơn nháp →"**.
     - Clicking **"Duyệt đơn nháp"**: sends approve request to API. If missing fields exist, displays modal/alert listing exact missing fields.

4. **Schedule Assign Modal (`AssignModal.tsx` & `AssignFromOrderModal.tsx`)**:
   - Filter out orders where `isDraft === true` from the assignable dropdown list.

---

## 3. Null-Safety Audit (BẮT BUỘC)

Vì `widthM`, `lengthM`, `gsm`, `color` chuyển sang optional trên schema, dưới đây là audit chi tiết từng vị trí xử lý `null` (đảm bảo hiện dấu **`—`** thay vì `NaN`, `undefined` hoặc vỡ layout):

1. **`src/lib/calculations/orderWeight.ts`**:
   - **Quy tắc**: Nếu bất kỳ input bắt buộc nào (`widthM`, `gsm`, `lengthM` hoặc `qty`/`rollLength`) bị `null`, `undefined` hoặc `<= 0`, hàm trả về `{ totalMeters: null, qtySqm: null, totalWeightKgs: null }`.
   - **Tuyệt đối KHÔNG return `NaN`**, không tính toán mù khi thiếu input.

2. **`OrderTable.tsx`**:
   - Cột **Khổ (m)**: hiển thị `${row.widthM}m` nếu có, ngược lại hiển thị dấu **`—`** (italic, font-outline).
   - Cột **GSM**: hiển thị `${row.gsm}` nếu có, ngược lại hiển thị **`—`**.
   - Cột **Màu sắc**: hiển thị `${row.color}` nếu có, ngược lại hiển thị **`—`**.
   - Cột **Diện tích (m²)** & **Trọng lượng (kg)**: hiển thị số định dạng hoặc **`—`** nếu `null`. Không bao giờ hiện `NaN` hay `undefined`.

3. **`POSummaryTable.tsx`**:
   - Các cột chi tiết sub-line: hiển thị dấu **`—`** nếu field bị `null`.
   - **Phần tổng hợp SL / m² / kg của cả PI Group**: Khi tính tổng `totalQtySqm` và `totalWeightKgs` cho PI Group, **BỎ QUA (không cộng dồn)** các sub-line đang là đơn nháp (`isDraft = true`) hoặc thiếu `qtySqm`/`totalWeightKgs`. Nếu toàn bộ sub-line của PI đó là đơn nháp, tổng m² và kg hiển thị **`—`**.

4. **`OrderDetail.tsx`**:
   - **Progress Tracking (`producedMeters`, `remainingMeters`, `remainingDays`)**: **ẨN HOÀN TOÀN** section này nếu `order.isDraft === true` hoặc thiếu thông tin sản lượng/chiều dài. Không hiển thị các con số tính toán sai hoặc `NaN`.
   - Các field thông số kỹ thuật (Khổ, GSM, Màu, Chiều dài, Mét/cuộn): hiển thị dấu **`—`** nếu chưa có giá trị.

5. **`ImportOrdersModal.tsx` & `/orders/bulk`**:
   - **Xác nhận**: Luồng import Excel/Bulk paste **KHÔNG tạo đơn nháp**. Nếu thiếu field, hiển thị lỗi validate cụ thể như hiện tại.

---

## 4. Test Cases Bắt Buộc Trước Khi Báo Done

Thực hiện tạo 1 đơn nháp **CHỈ CÓ `piNumber` + `customer`** (không GSM, không widthM, không color) và kiểm tra:

1. **Order List (`/orders`)**:
   - Hiển thị đúng hàng đơn nháp với badge **NHÁP**.
   - Cột Khổ, GSM, Màu sắc, Trọng lượng hiện dấu **`—`**. Không bị `NaN`, `undefined` hay crash.
2. **PO Summary (`/orders/summary`)**:
   - PI Group hiển thị đúng, có badge **NHÁP**.
   - Cột tổng m² và tổng kg hiện **`—`**, không bị vỡ layout.
3. **Order Detail (`/orders/[id]`)**:
   - Banner cảnh báo đơn nháp và Nút **"Duyệt đơn nháp →"** hiển thị.
   - Section **Progress Tracking** bị ẩn hoàn toàn (không tính toán mù).
   - Bấm "Duyệt đơn nháp" → hiển thị modal báo thiếu: `Khổ (m), GSM, Màu sắc, Chiều dài/Số cuộn`.
