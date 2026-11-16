# M30-05-UI-02 — Tra cứu hành trình và bàn giao sản xuất theo PI

**Nguồn:** MoM 30/10 §2, §4; feedback khách 12/11/2026 về tìm PI để biết kéo sợi/dệt/đóng gói và quyết định có cần sản xuất thêm.  
**Trạng thái:** PLAN / explore — chưa triển khai code, chưa migration, chưa đọc DB production.  
**Tier:** Normal; nếu thêm bảng handoff thì High-risk vì cần schema/migration và quy trình thay đổi production riêng.

## Mục tiêu

Giúp planner tìm một PI hoặc khách hàng, xem tiến độ từng item qua các công đoạn **Kéo sợi → Mắc sợi → Dệt → Cuộn → Đóng gói**, và biết phần nào còn thiếu theo đúng đơn vị PO. Tránh để khách phải dò các bảng kỹ thuật dài.

## Hiện trạng đã kiểm — static-source

- `/orders/production` nằm trong `src/components/orders/ProductionRecordsWorkspace.tsx`: có các tab tra cứu theo PI, nhập trực tiếp và kế hoạch. API tra cứu là `GET /api/production-records`, lọc theo công đoạn, PI nguồn, liên kết/unlinked và phân trang.
- `extruder_daily_output`, `warping_daily_output`, `knitting_daily_detail`, `rolling_daily_metrics` có `orderRef` và `orderId` tùy chọn. Raw PI được giữ khi chưa ghép item; một PI nhiều dòng không được tự gán bừa.
- Đóng gói nhập trực tiếp theo PI nằm ở `manual_production_entries`. `packing_daily_outputs` chỉ là tổng ngày/ca toàn xưởng, không có PI/item nên không thể dùng để tính đóng gói cho một đơn cụ thể.
- PO Summary (`src/components/orders/POSummaryTable.tsx`) đã tìm PI/khách, nhưng có bảng chi tiết nhiều cột. Journey hiện có tổng kg kéo sợi/mắc sợi từ `/api/orders/journey-summary`; dệt theo PI lấy `/api/knitting/progress/[orderId]`, tức sản lượng theo máy/ngày được phân bổ theo lịch máy.
- Mismatch đã xác minh bằng workbook 11/2026: sheet `CHART` cộng cột `KNITTING!I` (m tổng = tape/roll × length). Parser lưu cột G vào `lengthM`, cột I vào `mValue`; web summary và API PI lookup hiện đang trả/cộng `lengthM`. Cùng workbook, chart và tổng `mValue` là 399.785,08 m; `lengthM` chỉ 65.695,08 m; kg khớp 121.339,78 kg. Chưa đọc DB production nên đây là đối chiếu workbook với logic code, không phải xác nhận số hiện tại trên Vercel.
- Sheet đóng gói trong workbook `STATISTICAL REPORT 11-2026.xlsx` ghi kỳ tháng 01/2026; không dùng nó làm actual đóng gói tháng 11 nếu chưa được SNY xác nhận.

## Flow đề xuất

```text
Tra cứu PI/khách hàng
        ↓
Chọn PI → tách từng item/sub-line
        ↓
┌─────────────┬─────────────┬─────────────┬──────────┬─────────────┐
│ Kéo sợi     │ Mắc sợi     │ Dệt         │ Cuộn     │ Đóng gói    │
│ actual kg   │ actual kg/  │ actual m/kg │ actual   │ actual theo │
│ / nhu cầu   │ beam*       │ / mục tiêu  │ nguồn    │ đơn vị PO   │
└─────────────┴─────────────┴─────────────┴──────────┴─────────────┘
        ↓
Tóm tắt còn thiếu / đủ theo PO, kèm thời điểm cập nhật và nguồn
```

`*` Chỉ đưa beam/đầu vào mắc sợi vào status chính sau khi SNY xác nhận đơn vị bàn giao. Nếu thiếu số liệu hoặc PI chưa được ghép, hiện “Chưa có dữ liệu” / “Chưa gắn item”, không biến thành số 0 hay tự kết luận đủ hàng.

## Kế hoạch triển khai

### P0 — Chốt data contract với SNY

1. Chốt view chính tập trung 3 bước khách hỏi (Kéo sợi, Dệt, Đóng gói); Mắc sợi/Cuộn thu gọn hay hiển thị đầy đủ.
2. Chốt đơn vị mục tiêu theo `orderType`: meters, rolls hay pieces; cách tính tổng mét cho cuộn/tấm; có áp dụng dung sai PO hay không.
3. Chốt actual dệt: dùng `mValue` làm tổng mét như cột M trong chart; giữ `lengthM` là chiều dài mỗi sản phẩm nếu cần xem chi tiết.
4. Chốt cách ghi nhận bàn giao: chỉ cần trạng thái “đã/sẵn sàng sang công đoạn tiếp” hay cần ghi nhận số lượng WIP thực bàn giao, ngày/ca và người giao/nhận.
5. Xin nguồn actual đóng gói có PI/item, đơn vị và kỳ báo cáo. Nếu file chỉ có tổng nhà máy theo ngày, cần SNY xác nhận nhập thủ công theo PI hoặc cung cấp file khác.

### P1 — Sửa metric và đối soát sản lượng

- Đổi tổng mét dệt trong `/api/reports/production-summary` và `/api/production-records` sang `mValue`; giữ riêng `lengthM` nếu cần hiển thị mét/cuộn.
- So khớp theo ngày và ca: `KNITTING!I` với tổng web `mValue`, `KNITTING!L` với tổng web kg. Không import sheet `CHART` như nguồn thứ hai vì đây là sheet dẫn xuất.
- Quyết định và ghi rõ PO Summary đang dùng actual detail gắn PI hay phân bổ từ `knitting_daily_output` theo lịch máy; không trộn hai cách trong cùng một KPI.

### P2 — Làm màn tra cứu PI gọn

- Dùng PO Summary/Tra cứu theo PI làm điểm vào chung; một ô tìm PI/khách, chọn PI, sau đó xem item riêng.
- Hiện từng công đoạn dạng thẻ/timeline: target, actual, còn thiếu, đơn vị, cập nhật gần nhất, nguồn và trạng thái liên kết. Mặc định chỉ bật 3 công đoạn khách cần; thông số kỹ thuật để trong “Chi tiết”.
- Tính “đủ/còn thiếu theo PO” từ công đoạn hoàn tất đóng gói khi có actual theo PI và cùng đơn vị; nếu chưa đủ dữ liệu thì không đưa khuyến nghị.

### P3 — Ghi nhận bàn giao WIP (chỉ sau khi chốt nghiệp vụ)

Nếu SNY xác nhận cần quản lý số lượng thực bàn giao, thiết kế entity/API `ProductionHandoff`: order item, công đoạn nguồn/đích, số lượng, đơn vị, ngày/ca, người giao/nhận, nguồn actual và ghi chú. Cho phép bàn giao một phần; chặn vượt số lượng khả dụng; giữ audit/rollback. Không quy đổi giữa kg, beam, mét, cuộn/tấm khi chưa có hệ số được SNY xác nhận.

## Scope dự kiến khi P0 được chốt

- UI: `src/components/orders/POSummaryTable.tsx`, `src/components/orders/ProductionRecordsWorkspace.tsx` và page summary/Production Orders.
- Data/API: `src/app/api/orders/journey-summary/route.ts`, `src/app/api/production-records/route.ts`, `src/app/api/knitting/progress/[orderId]/route.ts`, `src/app/api/reports/production-summary/route.ts`.
- Chỉ P3 mới sửa `prisma/schema.prisma` và thêm migration/rollback.

## Out of scope

- Tự động trừ nguyên liệu kho khi có sản lượng.
- Tự động quy đổi WIP giữa kg, beam, mét, cuộn và tấm.
- Thay đổi mẫu in M30-06/07 hoặc nhập file khách vào production để QA.

## Acceptance dự kiến

1. Tra cứu PI/khách trả về đúng đơn và từng item; nhiều item không bị cộng lẫn đơn vị.
2. Kéo sợi hiển thị kg actual so với nhu cầu sợi; Dệt hiển thị mét tổng theo `mValue` so với mục tiêu PO; Đóng gói hiển thị actual theo cùng đơn vị với mục tiêu.
3. Các số tổng dệt khớp `CHART` theo cùng khoảng ngày/ca; kg khớp riêng, không cộng mét với kg.
4. Dòng PI chưa ghép được vẫn nhìn thấy nhưng không bị gán nhầm item hoặc cộng vào kết luận theo PI.
5. Không đưa ra “cần sản xuất thêm/đã đủ” khi thiếu actual đóng gói hoặc đơn vị không tương thích.
6. Nếu có handoff ledger, một phần WIP có thể bàn giao; tổng bàn giao không vượt lượng khả dụng; lưu đầy đủ người/thời điểm/đơn vị.

## Điều kiện dừng cần xác nhận

- Chưa chốt số lượng nào được xem là “đã bàn giao” giữa từng cặp công đoạn và theo đơn vị nào.
- Chưa có bằng chứng file đóng gói tháng 11 có PI/item; sheet trong workbook hiện tại ghi tháng 01/2026.
- Current `lengthM` vs `mValue` mismatch phải sửa/đối soát trước khi dùng mét dệt để khuyến nghị sản xuất thêm.
