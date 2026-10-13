# SNY PATTERNS.md — 4 pattern Excel-like (Antigravity)

## 1. Dense table (orders/summary, materials 8 tabs)
- Frozen cột PI/material + sticky thead, zebra, `tabular-nums`, search PI/khách/màu/GSM, filter tab + saved views, bulk paste preview trước khi ghi.
- Map: `OrderTable.tsx`, `POSummaryTable.tsx`, `MaterialsTable.tsx`, `HDPETab/MBTab/KoreaTab`.

## 2. Schedule timeline 40x31
- Memo `machineId|date → assignments`, zoom ngày/tuần (sau), drag dời + overlap inline, badge `+N` click-through, label PI không mất khi scroll ngang.
- Map: `app/schedule/page.tsx`, `AssignModal`, `DetailModal`, `api/assignments`.

## 3. Import wizard (Flatfile-flow)
- 3 bước: upload (+sheet + size/row limit + báo `.xlsb`) → preview diff (xóa/tạo/nháp/ambiguous/invalid/protected + borderline checkbox) → confirm revalidate + snapshot `ScheduleImportLog` + nhắc gán tay.
- Map: `ImportScheduleModal.tsx`, `Import*Modal.tsx`, `api/schedule/import*`, `lib/excel/parse*.ts`.

## 4. Inline edit + validate
- View/Edit cùng chỗ (OrderDetail/DetailModal), Zod server-side, tính lại `qtySqm/kg/sợi` qua `orderWeight.ts`, toast thành công, giữ `dataSource` manual/import/seed.
- Map: `OrderDetail.tsx`, `MultiLineOrderForm.tsx`, `lib/validations/order.ts`, `lib/calculations/orderWeight.ts`.
- Ô "gõ rồi chọn gợi ý" BẮT BUỘC dùng `components/ui/SuggestCombobox.tsx` (bàn phím, ARIA, vị trí, trạng thái). Không `<datalist>`, không tự viết dropdown; thiếu thì mở rộng prop của component. Nguồn dữ liệu do nơi dùng truyền `load`. Còn nợ: Màu, Mô tả, `AddTransactionModal`, `RollingTab`, `CalendarMonthPopover`.
