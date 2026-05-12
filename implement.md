# SNY Planner — Tài liệu chuyển giao toàn bộ dự án

## Mục đích
Demo bán hàng cho đội vận hành nhà máy dệt lưới SNY. Thay thế 4 file Excel rời rạc bằng một giao diện web thống nhất. **Đây là DEMO, không có database, không có auth, không có API calls.**

## Lệnh chạy
```
cd sny-planner
npm install
npm run dev
# Mở http://localhost:3000
```

## Stack kỹ thuật
- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **shadcn/ui v4** — dùng **base-ui** (KHÔNG phải Radix UI) — lưu ý quan trọng khi dùng Tooltip
- **State**: `useReducer` + React Context — không Zustand, không Redux
- **Test**: Vitest (`npm run test:run`)
- **Icons**: lucide-react
- **Font**: Inter (Google Fonts, subset latin + vietnamese)

---

## Cấu trúc thư mục

```
sny-planner/
├── app/
│   ├── globals.css
│   ├── layout.tsx              ← Root layout: Sidebar + OrderProvider + TooltipProvider
│   ├── page.tsx                ← redirect("/orders")
│   ├── orders/
│   │   ├── page.tsx            ← Screen 1: danh sách lệnh SX
│   │   └── [id]/page.tsx       ← Screen 1: chi tiết đơn hàng (3 tabs)
│   ├── schedule/
│   │   └── page.tsx            ← Screen 2: lịch máy dệt
│   └── materials/
│       └── page.tsx            ← Screen 3: cảnh báo nguyên liệu
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   ├── orders/
│   │   ├── OrderTable.tsx
│   │   ├── NewOrderModal.tsx   ← live parse badges
│   │   └── WarpingTable.tsx
│   ├── schedule/
│   │   └── ScheduleGrid.tsx    ← showstopper — grid 12 máy × 31 ngày
│   └── materials/
│       ├── AlertCard.tsx
│       └── InventoryTable.tsx
├── data/
│   ├── orders.ts               ← 8 đơn seed
│   ├── specs.ts                ← 4 chuỗi spec thực tế
│   ├── machines.ts             ← 12 máy dệt
│   ├── schedule.ts             ← 3 phiên bản lịch tháng 1/2026
│   ├── inventory.ts            ← 10 loại masterbatch
│   └── warping_template.ts     ← hàm sinh 18 beam warping
├── lib/
│   ├── parseSpec.ts            ← pure function parser (trung tâm kỹ thuật)
│   ├── parseSpec.test.ts       ← 6 test Vitest (6/6 pass)
│   ├── formatters.ts           ← toVN(), toVNDate()
│   └── orderContext.tsx        ← React Context + useReducer
├── types/
│   └── index.ts                ← tất cả TypeScript types
├── package.json
├── tsconfig.json               ← alias "@/*" → "./*"
├── vitest.config.ts
└── next.config.ts
```

---

## Types (`types/index.ts`)

```typescript
export type OrderStatus = "Đang sản xuất" | "Đã duyệt" | "Chờ duyệt";

export type FabricType =
  | "Shade Net" | "Windbreak" | "Rectangular"
  | "Fence" | "Leaf Net" | "Unknown";

export interface ParsedSpec {
  gsm: number | null;
  color: string | null;
  width: number | null;       // metres
  length: number | null;      // metres per roll
  rolls: number | null;
  fabricType: FabricType;
  fr: number | null;          // %FR
  uv: number | null;          // %UV
  raw: string;
}

export interface Order {
  id: string;
  customer: string;
  specRaw: string;
  spec: ParsedSpec;
  meters: number;
  deadline: string;           // ISO "YYYY-MM-DD"
  status: OrderStatus;
}

export interface Machine {
  id: number;
  name: string;               // "Máy 1"
  width: number;              // metres e.g. 6.85
}

export interface ScheduleCell {
  orderId: string;
  label: string;              // 2 dòng cách nhau bằng "\n"
  tooltip: string;            // full spec hiện khi hover
  fabricType: FabricType;
  dayStart: number;
  dayEnd: number;
}

export interface MachineSchedule {
  machineId: number;
  cells: ScheduleCell[];
}

export interface ScheduleRevision {
  version: string;            // "5.1.2026"
  label: string;              // "5/1/2026"
  rows: MachineSchedule[];
}

export interface InventoryItem {
  code: string;
  name: string;
  type: string;
  stock: number;              // kg tồn kho
  committed: number;          // kg đã cam kết
}

export interface WarpingBeam {
  no: number;
  denier: number;
  strand: number;
  color: string;
  soMay: number;
  soBim: number;
  bim: number;
  weightKg: number;
  viTri: "TRƯỚC" | "GIỮA" | "SAU";
}
```

---

## Data files

### `data/orders.ts`
8 đơn seed, import `parseSpec` để tự parse `specRaw` thành `spec`:
```typescript
import { parseSpec } from "@/lib/parseSpec";

const raw = [
  { id: "FABO25044A", customer: "FABO",         specRaw: "220GSM DGREEN 4008 6MX100M 84ROLLS",                                       meters: 8400,  deadline: "2026-01-20", status: "Đang sản xuất" },
  { id: "FABO25045",  customer: "FABO",         specRaw: "220GSM DGREEN 4008 6MX100M 84ROLLS",                                       meters: 8400,  deadline: "2026-01-25", status: "Đang sản xuất" },
  { id: "GBN26-022",  customer: "GBN (Garbinox)",specRaw:"95GSM WHITE 6.5%FR+2%UV 3MX50M 400ROLLS 3LINE",                           meters: 20000, deadline: "2026-01-15", status: "Đang sản xuất" },
  { id: "HSIA26-1",   customer: "HSIA",         specRaw: "170GSM SWHITE 1.6MX100M 85ROLLS (390 needles) 2LINE",                     meters: 8500,  deadline: "2026-02-05", status: "Đã duyệt"       },
  { id: "KSSNY194R1", customer: "KSSNY",        specRaw: "240GSM SNOW WHITE 4.5MX100M 38ROLLS (Single line Black double thread)",   meters: 3800,  deadline: "2026-02-10", status: "Đã duyệt"       },
  { id: "ORCHARDCOVER26-1", customer: "ORCHARDCOVER", specRaw: "240GSM DARK GREEN 2.3MX100M 120ROLLS WINDBREAK",                    meters: 12000, deadline: "2026-02-20", status: "Đã duyệt"       },
  { id: "ALNAIMI26-1",customer: "ALNAIMI",      specRaw: "60GSM DGREEN 2MX50M 330ROLLS",                                            meters: 16500, deadline: "2026-03-01", status: "Chờ duyệt"      },
  { id: "ITP26-1",    customer: "ITP",          specRaw: "55GSM SWHITE FR 3MX50M 176ROLLS",                                         meters: 8800,  deadline: "2026-03-10", status: "Chờ duyệt"      },
];

export const initialOrders: Order[] = raw.map(o => ({ ...o, spec: parseSpec(o.specRaw) }));
```

### `data/machines.ts`
```typescript
export const machines: Machine[] = [
  { id: 1,  name: "Máy 1",  width: 6.85 },
  { id: 2,  name: "Máy 2",  width: 6.56 },
  { id: 3,  name: "Máy 3",  width: 6.85 },
  { id: 4,  name: "Máy 4",  width: 6.56 },
  { id: 5,  name: "Máy 5",  width: 6.85 },
  { id: 7,  name: "Máy 7",  width: 6.56 },
  { id: 8,  name: "Máy 8",  width: 6.85 },
  { id: 11, name: "Máy 11", width: 6.85 },
  { id: 13, name: "Máy 13", width: 6.85 },
  { id: 14, name: "Máy 14", width: 6.56 },
  { id: 19, name: "Máy 19", width: 1.6  },
  { id: 21, name: "Máy 21", width: 1.6  },
];
```

### `data/inventory.ts`
10 loại masterbatch thực tế từ CC2018:
| code     | name                    | stock | committed | thiếu? |
|----------|-------------------------|-------|-----------|--------|
| SWHITE   | MB SWHITE               | 1065  | 540       | không  |
| 3160-2   | MB BEIGE NHẠT (3160-2)  | 220   | 377       | **có** |
| 3233-5   | MB BEIGE ĐẬM (3233-5)   | 280   | 592       | **có** |
| 8005A    | MB BEIGE ĐẬM TAPE       | 600   | 240       | không  |
| 9175-2   | MB TERRACOTA            | 150   | 145       | không  |
| 3232-3   | MB IVORY                | 410   | 65        | không  |
| 8086-2   | MB GREEN                | 132   | 58        | không  |
| 2032-2   | MB STEEL GREY           | 318   | 130       | không  |
| 6026-1   | MB AQUA BLUE            | 250   | 80        | không  |
| 432-2    | MB GUNMETAL             | 200   | 100       | không  |

### `data/schedule.ts`
3 phiên bản: `5.1.2026` (mới nhất, index 0), `3.1.2026`, `2.1.2026`.

Mỗi phiên bản có `rows: MachineSchedule[]`. Phiên bản 5.1.2026 gồm 5 rows:
- **Máy 1**: ngày 1-11 = FABO25045 (Shade Net), ngày 12-25 = HSIA26-1 (Rectangular)
- **Máy 2**: ngày 1-6 = GBN26-022 yellow, ngày 7-12 = 25KG1201 dblue, ngày 13-19 = GBN26-022 black
- **Máy 3**: ngày 1-14 = KSSNY194R1 (Leaf Net), ngày 15-23 = ORCHARDCOVER26-1 (Windbreak)
- **Máy 4**: ngày 4-8 = ITP26-1
- **Máy 5**: ngày 2-9 = ALNAIMI26-1

Các máy còn lại (7,8,11,13,14,19,21) không có cell trong seed data — hiển thị hàng trống.

### `data/warping_template.ts`
Hàm `generateWarpingBeams(color, totalBeams=18)` sinh 18 beam luân phiên TRƯỚC/GIỮA/SAU:
- Denier: xoay vòng [14.5, 18.5, 20, 14.5, 18.5, 20]
- Strand: TRƯỚC=144, GIỮA=128, SAU=112
- Weight: `denier * strand * 0.0055 + 1.2`

---

## Thư viện lib/

### `lib/parseSpec.ts` — Trung tâm kỹ thuật
Pure function, không side effects. Xử lý 4 định dạng spec thực tế:

```typescript
export function parseSpec(raw: string): ParsedSpec
```

**Logic parser:**
- `gsm`: regex `/(\d+(?:[.,]\d+)?)\s*GSM/i`
- `width` (Khổ): regex `/(\d+(?:[.,]\d+)?)\s*MX/i`
- `length` (Dài cuộn): regex `/MX\s*(\d+(?:[.,]\d+)?)\s*M\b/i`
- `rolls`: regex `/(\d+)\s*ROLLS?/i`
- `fr`: regex `/(\d+(?:[.,]\d+)?)\s*%FR/i`
- `uv`: regex `/(\d+(?:[.,]\d+)?)\s*%UV/i`
- `color`: strip GSM, %FR, %UV, `(...)`, số 4 chữ số, WxL, ROLLS, LINE → phần còn lại
- `fabricType`: keyword scan: LEAF NET > SHADE NET > WINDBREAK > RECTANGULAR > FENCE > KIWI → mặc định Shade Net

**4 test case phải pass:**
1. `"220GSM DGREEN 4008 6MX100M 84ROLLS"` → gsm=220, color=DGREEN, width=6, length=100, rolls=84
2. `"170GSM SWHITE 1.6MX100M 85ROLLS (390 needles) 2LINE"` → gsm=170, color=SWHITE, width=1.6
3. `"95GSM WHITE 6.5%FR+2%UV 3MX50M 400ROLLS 3LINE"` → fr=6.5, uv=2, color=WHITE
4. `"240GSM SNOW WHITE 4.5MX100M 38ROLLS (Single line Black double thread)"` → color=SNOW WHITE

### `lib/formatters.ts`
```typescript
toVN(1065)        // → "1.065"  (dấu chấm hàng nghìn)
toVN(4.5, 1)      // → "4,5"   (dấu phẩy thập phân)
toVNDate("2026-01-20") // → "20/01/2026"
```

### `lib/orderContext.tsx`
React Context + `useReducer`. Action duy nhất: `ADD_ORDER`.
- `OrderProvider` bọc toàn bộ layout
- `useOrders()` hook: `{ orders, addOrder, getOrder }`
- ID đơn mới: `NEW-${Date.now().toString(36).toUpperCase()}`
- Đơn mới tự động status = "Chờ duyệt", meters = rolls × length

---

## Components

### `components/layout/Sidebar.tsx`
- Fixed left, width 56 (224px), bg-slate-900
- Logo: chữ "S" nền emerald + "SNY Planner"
- 3 nav items dùng `usePathname()` để highlight active
- Active = `bg-emerald-600`, inactive = `text-slate-400 hover:bg-slate-800`

### `components/layout/Topbar.tsx`
- Props: `title: string`
- Sticky top, height 14 (56px), bg-white
- Hiển thị avatar "DK" nền emerald-100 + tên "Dung / Kế hoạch SX"

### `components/orders/NewOrderModal.tsx`
Dialog với 3 input: tên khách, textarea spec (font-mono), date picker.

**SpecBadges** — component con: nhận `ParsedSpec`, lọc các field không null, render badge shadcn cho từng field. Cập nhật live khi gõ.

`handleSave()`: gọi `addOrder()` → `setTimeout(50ms)` → tìm đơn có ID bắt đầu "NEW-" → navigate.

### `components/orders/OrderTable.tsx`
`StatusBadge`: emerald=Đang SX, sky=Đã duyệt, amber=Chờ duyệt.
Cột "Xem": icon Eye → Link đến `/orders/${encodeURIComponent(order.id)}`.

### `components/orders/WarpingTable.tsx`
Nhận `color: string`, gọi `generateWarpingBeams(color)` → 18 hàng.
Cột Vị trí: badge màu — TRƯỚC=sky, GIỮA=violet, SAU=amber.

### `components/schedule/ScheduleGrid.tsx`
**Đây là component quan trọng nhất.**

Màu theo fabric type:
| FabricType  | bg           | border          |
|-------------|--------------|-----------------|
| Shade Net   | emerald-100  | emerald-300     |
| Windbreak   | violet-100   | violet-300      |
| Rectangular | sky-100      | sky-300         |
| Fence       | orange-100   | orange-300      |
| Leaf Net    | lime-100     | lime-300        |

**Layout grid:**
- Container: `overflow-x-auto` → div con `minWidth: calc(31 * 68px + 220px)`
- Header: div flex — cột trái 220px cố định + 31 cột ngày 68px mỗi cột
- Mỗi hàng máy: div flex `minHeight: 56px`
  - Cột trái 220px: tên máy + khổ
  - 31 ô ngày: kiểm tra `dayStart <= d <= dayEnd`
    - Nếu `d === dayStart`: render `<CellBlock>` (có tooltip)
    - Nếu ở giữa (continuation): render div bar mỏng cùng màu opacity-70
    - Nếu không có cell: null

**CellBlock**: dùng base-ui `<Tooltip>` + `<TooltipTrigger>` (KHÔNG có prop `asChild` vì base-ui không hỗ trợ) + `<TooltipContent side="bottom">`.

**⚠️ Lưu ý quan trọng về shadcn/base-ui tooltip:**
shadcn v4 dùng `@base-ui/react` thay vì Radix. `TooltipTrigger` KHÔNG có prop `asChild`. Styling trực tiếp qua `className` trên `TooltipTrigger`.

### `components/materials/AlertCard.tsx`
Hardcoded 3 dòng cảnh báo:
- ⚠ Thiếu 157 kg MB BEIGE NHẠT (3160-2) — thứ Tư 7/1
- ⚠ Thiếu 312 kg MB BEIGE ĐẬM (3233-5) — thứ Sáu 9/1
- ✓ Đủ MB SWHITE — tồn 1.065 kg, cần 540 kg

2 button: "Xem chi tiết", "Xuất đề xuất mua hàng" (no-op demo).

### `components/materials/InventoryTable.tsx`
Logic highlight: `remaining = stock - committed`. Nếu `remaining < 0` → row `bg-red-50`.
Cột "Còn lại" đỏ + ký hiệu "⚠" nếu thiếu.

---

## Pages (App Router)

### `app/layout.tsx`
```tsx
<html lang="vi">
  <body>
    <OrderProvider>
      <TooltipProvider>
        <div className="flex min-h-screen bg-slate-50">
          <Sidebar />
          <div className="flex-1 ml-56 flex flex-col">{children}</div>
        </div>
      </TooltipProvider>
    </OrderProvider>
  </body>
</html>
```

### `app/orders/page.tsx` (`"use client"`)
- Lấy `orders` từ `useOrders()`
- Nút "+ Tạo đơn mới" → `useState` mở `<NewOrderModal>`
- Render `<OrderTable orders={orders} />`

### `app/orders/[id]/page.tsx` (`"use client"`)
- `params` là `Promise<{id: string}>` → dùng React `use(params)` để unwrap
- `decodeURIComponent(id)` trước khi tìm order
- 3 tabs: `overview` | `warping` | `materials`
- Tab materials: lấy top 5 từ inventory, tính `need = meters * 0.0003 * factor`

### `app/schedule/page.tsx` (`"use client"`)
- `useState(0)` cho versionIdx — index vào `scheduleRevisions[]`
- Select dropdown: value = `String(versionIdx)`, onChange parse `Number(v)`
- Button "Phát hành phiên bản mới" → Dialog no-op

### `app/materials/page.tsx` (`"use client"`)
Chỉ render `<AlertCard />` và `<InventoryTable items={inventory} />`.

---

## Cấu hình

### `package.json` — scripts quan trọng
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

### `tsconfig.json` — alias
```json
{ "paths": { "@/*": ["./*"] } }
```

### `vitest.config.ts`
```typescript
export default defineConfig({
  test: { environment: "node", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
});
```

---

## Luồng dữ liệu chính

```
initialOrders (data/orders.ts)
    ↓ parseSpec() tại import time
OrderProvider (useReducer)
    ↓ useOrders() hook
OrdersPage → OrderTable (danh sách)
           → NewOrderModal → addOrder() → dispatch ADD_ORDER
OrderDetailPage → WarpingTable, InventoryTab
```

```
scheduleRevisions (data/schedule.ts)  ← const array, 3 revisions
    ↓ chọn bằng useState(versionIdx)
ScheduleGrid ← machines (data/machines.ts)
    ↓ render 12 rows × 31 columns
```

---

## Những điểm dễ nhầm / gotcha

1. **base-ui Tooltip**: `TooltipTrigger` không có prop `asChild`. Style trực tiếp qua `className`.
2. **params là Promise**: `app/orders/[id]/page.tsx` dùng `use(params)` để unwrap (Next.js 15+ App Router requirement).
3. **encodeURIComponent**: Mã đơn có dấu gạch ngang (FABO25045) — dùng `encodeURIComponent` khi tạo URL, `decodeURIComponent` khi đọc.
4. **Sidebar width**: `w-56` = 224px → content area dùng `ml-56` để offset.
5. **Schedule grid**: máy không có cell trong revision vẫn hiển thị hàng trống (lấy từ `machines` array, không phải từ `revision.rows`).
6. **Số VN**: `toVN(1065)` → `"1.065"` (dấu chấm), `toVN(4.5, 1)` → `"4,5"` (dấu phẩy).
7. **addOrder navigation**: Có race condition nhỏ — dùng `setTimeout(50ms)` để chờ state update trước khi navigate. Trong production nên dùng callback.

---

## Kết quả test
```
✓ lib/parseSpec.test.ts (6 tests) 5ms
Test Files  1 passed (1)
Tests  6 passed (6)
```

## Build status
```
✓ Compiled successfully
✓ TypeScript — no errors
Routes: / ○  /orders ○  /orders/[id] ƒ  /schedule ○  /materials ○
```
