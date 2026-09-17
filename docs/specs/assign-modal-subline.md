# Implementation Plan: AssignModal Sub-line Detail

## Goal

Cập nhật dropdown chọn đơn hàng trong AssignModal từ PI-level display sang per-sub-line display,
thêm detail panel sau khi chọn. Cập nhật AssignFromOrderModal để hiện detail panel của order đang assign.

---

## Current behavior vs new behavior

| | Before | After |
|---|---|---|
| AssignModal dropdown | `KTQ26-4 (KTQ)` — 6 sub-lines hiện cùng 1 label | `KTQ26-4 · Dòng 1 — 2.0m · Black · 67gsm · Scaffolding` — 6 dòng riêng |
| AssignModal detail | Không có | Panel hiện ngay dưới dropdown sau khi chọn |
| AssignFromOrderModal header | `KTQ26-4 · Sub-line 0` — thiếu thông tin | Giữ header + thêm detail panel bên dưới |
| API | `/api/assignments` POST nhận `orderId` ✅ | Không thay đổi |

---

## Task 3 verdict — KHÔNG cần thay đổi API

- `api/assignments` POST: đã nhận `orderId` = ID của ProductionOrder sub-line ✅
- `api/orders` GET: đã trả về flat array (1 row = 1 sub-line) ✅
- Issue hiện tại: chỉ là display format, không phải data structure

---

## Files modified (chỉ 2 files)

1. `src/components/schedule/AssignModal.tsx`
2. `src/components/schedule/AssignFromOrderModal.tsx`

---

## Dropdown option format (exact)

```
{piNumber} · Dòng {subLineIndex + 1} — {widthM}m · {color} · {gsm}gsm[· {meshType}]
```

Examples:
- `KTQ26-4 · Dòng 1 — 2.0m · Black · 67gsm · Scaffolding`
- `KTQ26-4 · Dòng 2 — 2.0m · Green · 67gsm · Scaffolding`
- `RLT26-2 · Dòng 1 — 3.0m · Blue · 60gsm`  ← meshType null → không hiện

Sort order: theo `piNumber` ASC, `subLineIndex` ASC.

---

## Detail panel — fields và vị trí

Vị trí: ngay sau dropdown, trước "Bắt đầu/Kết thúc" date range.
Chỉ render khi đã chọn 1 sub-line (selectedOrderId !== '').

```
┌── bg-surface-container-low, rounded-lg, p-3, mt-1 ──────────┐
│  KTQ26-4 · Dòng 1                  [text-label-sm, bold]    │
│  Khách:        KTQ                 [2-col grid]              │
│  Chiều rộng:   2.0 m                                        │
│  GSM:          67                                            │
│  Màu:          Black                                         │
│  Loại lưới:    Scaffolding         [chỉ hiện nếu meshType]  │
│  Tổng mét:     23,000 m            [lengthM, toLocaleString] │
│  Số lượng:     230 cuộn            [chỉ hiện nếu qty != null]│
└──────────────────────────────────────────────────────────────┘
```

---

## Steps (7 bước)

### Step 1 — Mở rộng `Order` interface trong AssignModal
Thêm fields: `subLineIndex, widthM, gsm, color, meshType, lengthM, qty`  
`/api/orders` đã trả về full ProductionOrder — chỉ cần khai báo thêm trong interface.

### Step 2 — Helper function `formatOrderLabel`
```ts
function formatOrderLabel(o: Order): string {
  const base = `${o.piNumber} · Dòng ${o.subLineIndex + 1} — ${Number(o.widthM).toFixed(1)}m · ${o.color} · ${o.gsm}gsm`
  return o.meshType ? `${base} · ${o.meshType}` : base
}
```

### Step 3 — Sort orders trong AssignModal
Sau khi fetch, sort theo `piNumber` ASC → `subLineIndex` ASC trước khi set state.

### Step 4 — Cập nhật dropdown render
`<option>` dùng `formatOrderLabel(o)` thay vì `{o.piNumber} ({o.customer})`.

### Step 5 — Thêm `selectedOrder` computed value
```ts
const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? null
```

### Step 6 — Thêm detail panel vào AssignModal
Render ngay sau dropdown `<div>`, trước date range grid.
Dùng inline component `SubLineDetailPanel({ order })`.

### Step 7 — Thêm detail panel vào AssignFromOrderModal
Modal này đã có `order` prop — thêm `SubLineDetailPanel` ngay dưới header, trước machine ID input.

---

## Shared helper — `SubLineDetailPanel`

Vì cả 2 modals dùng cùng panel, define trong từng file (không tạo file riêng để tránh phức tạp).
Fields và styling giống nhau. Tổng ~30 LOC cho mỗi file.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `/api/orders` response không có `widthM/gsm/color/meshType/qty/lengthM` | Thấp — API trả full ProductionOrder rows | Kiểm tra trước khi code |
| Dropdown quá dài (>100 options) | Thấp — SNY có ~50 orders hiện tại | Out of scope (sprint prompt xác nhận) |
| Sort làm thay đổi thứ tự existing dropdown | Không có risk — chỉ là display |

---

## Manual tests Tung phải chạy (Phase C)

1. `/schedule` → click ô trống → AssignModal mở
2. Dropdown: PI có nhiều sub-lines (KTQ26-4) → thấy **nhiều dòng riêng**, mỗi dòng khác label
3. Format đúng: `KTQ26-4 · Dòng 1 — 2.0m · Black · 67gsm · Scaffolding`
4. Sub-line không có meshType → không hiện "null", format ngắn hơn đúng cách
5. Chọn 1 sub-line → detail panel hiện ngay bên dưới với đủ thông tin
6. Assign → kiểm tra DB lưu đúng `orderId` (không bị nhầm sang sub-line khác)
7. `/orders/{id}` → "Assign to machine" → AssignFromOrderModal: detail panel hiện đúng thông tin sub-line
8. Existing assignments không bị ảnh hưởng (kiểm tra `/schedule` hiển thị đúng)

---

## Out of Scope

- ❌ Filter/search dropdown
- ❌ Thay đổi overlap check logic
- ❌ Thay đổi MachineAssignment schema
- ❌ Tạo file mới (không cần)
- ❌ Thay đổi bất kỳ API route nào
