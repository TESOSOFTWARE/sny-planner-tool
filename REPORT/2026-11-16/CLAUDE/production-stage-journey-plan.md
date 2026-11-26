# M30-05-UI-02 — Tra cứu hành trình và bàn giao sản xuất theo PI

**Nguồn:** MoM 30/10 §2, §4; feedback khách 12/11/2026 về tìm PI để biết kéo sợi/dệt/đóng gói và quyết định có cần sản xuất thêm.  
**Trạng thái:** Code và migration đã chạy trên DB test cô lập; chưa chạy trên production. Còn chờ file đóng gói SNY có PI/item để đối soát actual.
**Tier:** Normal; nếu thêm bảng handoff thì High-risk vì cần schema/migration và quy trình thay đổi production riêng.

## Mục tiêu

Giúp planner tìm một PI hoặc khách hàng, xem tiến độ từng item qua các công đoạn **Kéo sợi → Mắc sợi → Dệt → Cuộn → Đóng gói**, và biết phần nào còn thiếu theo đúng đơn vị PO. Tránh để khách phải dò các bảng kỹ thuật dài.

## Hiện trạng đã kiểm — static-source

- `/orders/production` nằm trong `src/components/orders/ProductionRecordsWorkspace.tsx`: có các tab tra cứu theo PI, nhập trực tiếp và kế hoạch. API tra cứu là `GET /api/production-records`, lọc theo công đoạn, PI nguồn, liên kết/unlinked và phân trang.
- `extruder_daily_output`, `warping_daily_output`, `knitting_daily_detail`, `rolling_daily_metrics` có `orderRef` và `orderId` tùy chọn. Raw PI được giữ khi chưa ghép item; một PI nhiều dòng không được tự gán bừa.
- Đóng gói nhập trực tiếp theo PI nằm ở `manual_production_entries`. `packing_daily_outputs` chỉ là tổng ngày/ca toàn xưởng, không có PI/item nên không thể dùng để tính đóng gói cho một đơn cụ thể.
- PO Summary (`src/components/orders/POSummaryTable.tsx`) tìm PI/khách; hiện có 3 thẻ chính theo PI, công đoạn trung gian thu gọn, item summary gọn và bảng thông số chi tiết có thể mở. Dệt theo item lấy `/api/knitting/progress/[orderId]` từ `knitting_daily_detail.mValue` gắn đúng `orderId`; raw PI có thể cộng ở cấp PI nhưng không gán xuống item.
- Mismatch đã xác minh bằng workbook 11/2026: sheet `CHART` cộng cột `KNITTING!I` (m tổng = tape/roll × length). Parser lưu cột G vào `lengthM`, cột I vào `mValue`; khi phát hiện, các API summary/PI lookup dùng `lengthM`. Đã sửa các tổng mét sang `mValue`, giữ `lengthM` cho chiều dài từng sản phẩm/cuộn. Cùng workbook, chart và tổng `mValue` là 399.785,08 m; `lengthM` chỉ 65.695,08 m; kg khớp 121.339,78 kg. Chưa đọc DB production nên đây là đối chiếu workbook với logic code, không xác nhận số hiện tại trên Vercel.
- SNY xác nhận workbook tháng 11 được gửi/cập nhật hằng ngày và chứa báo cáo từng ngày trong tháng. Vì vậy mọi đối soát phải dùng cùng snapshot/as-of date và cùng các ngày có số liệu; không cộng mỗi file nhận được như một bộ actual mới. Import confirm của EXTRUDER/WARPING/KNITTING detail thay thế nhóm máy/ngày có trong file; KNITTING daily output upsert theo máy/ngày. Nguồn file/phiên bản vẫn chưa được lưu đồng nhất ở mọi bảng.
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

## Tiến độ triển khai

- **Đã làm local:** `/api/reports/production-summary`, `/api/production-records` và Knitting Detail summary dùng `mValue` làm tổng mét sản phẩm; `lengthM` vẫn được giữ riêng là chiều dài sản phẩm/cuộn theo dòng báo cáo.
- **Đã làm local:** tiến độ dệt theo dòng PI lấy actual `mValue` từ `knitting_daily_detail` qua `orderId`; bỏ cách phân bổ `knitting_daily_output` theo lịch máy khỏi KPI actual theo PI. Dòng chưa link được báo riêng, không hiện 0 như thể chưa sản xuất.
- **Đã làm local:** PO Summary giữ tóm tắt actual/target; thao tác bàn giao được chuyển ra trang navbar riêng `/production-handoffs`, tìm theo PI/khách/màu rồi chọn dòng hàng.
- **Đã chốt với người yêu cầu:** đối chiếu đóng gói theo đơn vị PO (mét/cuộn/tấm), không dung sai; nhưng chờ file SNY có PI/item. Số nhập tay chỉ hiển thị tách biệt, không dùng làm actual báo cáo để tính phần còn thiếu.
- **Đã chốt:** WARPING `QUANTITY` là beam; ROLLING `QUANTITY SMALL/BIG` cộng theo đơn vị PO. Chuỗi bàn giao là kg → beam → m → unit PO.
- **Đã làm local:** thêm model, SQL migration/rollback, API đọc/ghi/void, form/lịch sử WIP; kiểm actual khả dụng theo `orderId`, stage và unit. Import report bị chặn nếu thay thế làm actual thấp hơn WIP đã bàn giao.
- **Browser UAT local:** trang navbar riêng chạy trên DB cô lập `sny_uat_codex_20261117`, PI `TEST-M30-001`. Đã bàn giao Kéo sợi→Mắc sợi 100+20 kg; Mắc sợi→Dệt 2 beam; Dệt→Cuộn 400 m; Cuộn→Đóng gói 6 cuộn rồi void. Balance, lịch sử và audit void hiển thị đúng.
- **Còn mở:** file actual đóng gói SNY có PI/item chưa được cung cấp nên chưa đối soát actual đóng gói với target PO.
- **Verify:** `npx prisma generate`, `npx prisma validate` với URL giả chỉ để validate schema, `npm run typecheck`, `npm run build`, `npm test` (225/225) và `git diff --check` PASS. Có test mock cho API handoff/over-limit/void và import guard. Build có cảnh báo thiếu ESLint nhưng exit code 0. Không dùng production DB.

### P0 — Chốt data contract với SNY

1. **Đã làm:** view chính tập trung Kéo sợi, Dệt, Đóng gói; Mắc sợi/Cuộn thu gọn.
2. **Đã chốt/triển khai một phần:** mục tiêu PO theo `orderType`: meters→m, rolls→số cuộn, pieces→số tấm; không áp dung sai và không quy đổi đơn vị.
3. **Đã chốt cho triển khai:** dùng `mValue` làm tổng mét như cột M trong chart; giữ `lengthM` là chiều dài sản phẩm/cuộn trên dòng chi tiết.
4. **Đã chốt và triển khai:** lưu số lượng WIP, ngày/ca, người giao/nhận; đơn vị theo chặng kg→beam→m→unit PO. WARPING `QUANTITY` là beam; ROLLING cộng `QUANTITY SMALL/BIG` theo unit PO.
5. **Đang chờ SNY:** file actual đóng gói có PI/item, đơn vị và kỳ báo cáo. Người yêu cầu chọn chờ file; không dùng số nhập tay làm actual báo cáo để đối soát.
6. Dùng quy tắc snapshot tháng: mỗi ngày nhận bản cập nhật lũy kế; khi xác nhận import, chỉ thay các ngày/máy có trong snapshot mới, không nhân đôi dữ liệu cũ.

### P1 — Sửa metric và đối soát sản lượng

- **Đã làm:** đổi tổng mét dệt trong `/api/reports/production-summary`, `/api/production-records` và Knitting Detail summary sang `mValue`; giữ riêng `lengthM` cho chiều dài sản phẩm/cuộn.
- So khớp theo ngày và ca trong cùng snapshot: `KNITTING!I` với tổng web `mValue`, `KNITTING!L` với tổng web kg. Không import sheet `CHART` như nguồn thứ hai vì đây là sheet dẫn xuất.
- **Đã làm:** PO Summary dùng actual detail `mValue` gắn theo `orderId`; bỏ phân bổ `knitting_daily_output` theo lịch máy khỏi KPI actual theo PI. PI-level summary có thể cộng raw PI để tra cứu, nhưng không gán xuống sub-line.

### P2 — Làm màn tra cứu PI gọn

- **Đã làm local:** PO Summary hiển thị target/actual/chênh chính; màn ghi nhận WIP nằm ở menu navbar riêng. Trang riêng tìm PI/khách/màu, chọn dòng, xem actual khả dụng, ghi bàn giao và xem lịch sử/void.
- **Còn chờ dữ liệu:** actual đóng gói từ file SNY có PI/item. Mục tiêu PO được hiện; số nhập tay có nhãn riêng và không dùng để kết luận.
- Chỉ tính phần còn đóng gói khi có metric báo cáo theo PI và cùng đơn vị target; không dung sai.

### P3 — Ghi nhận bàn giao WIP

Người yêu cầu xác nhận cần ghi số lượng WIP, ngày/ca, người giao/nhận; đơn vị gợi ý là **Kéo sợi→Mắc sợi: kg; Mắc sợi→Dệt: beam; Dệt→Cuộn: m; Cuộn→Đóng gói: cuộn/tấm**. Đề xuất entity `ProductionHandoff` lưu item, công đoạn nguồn/đích liền kề, lượng Decimal, đơn vị, ngày/ca, người giao/nhận, người tạo, ghi chú và thời điểm tạo. Hỗ trợ bàn giao một phần; không quy đổi đơn vị.

**Mapping đã chốt:** WARPING `QUANTITY` là beam; ROLLING `QUANTITY SMALL/BIG` cộng theo unit PO.

**High-risk plan đã được duyệt để tạo file local:** model/bảng `ProductionHandoff` / `production_handoffs` với `id`, `orderId` (FK Restrict), `fromStage`, `toStage`, `sourceMetricLabel`, `quantity Decimal(12,2)`, `unit`, `transferredAt` (UTC date), `shift`, `handedOffBy`, `receivedBy`, `note`, `createdByEmail`, `createdAt`, `voidedAt`, `voidedByEmail`, `voidReason`. Index theo `[orderId, transferredAt]` và `[fromStage, toStage, transferredAt]`; không backfill dữ liệu cũ. SQL: `prisma/sql/20261116_production_handoffs.sql`; rollback: `prisma/sql/rollback_20261116_production_handoffs.sql`.

API đã làm: `GET/POST /api/orders/[id]/handoffs` và `POST /api/orders/[id]/handoffs/[handoffId]/void`, quyền `output.read`/`output.actual.enter`. POST chỉ nhận cặp công đoạn liền kề. Trong transaction khóa bảng source rồi dòng PO, tính actual khả dụng theo metric/unit và trừ handoff chưa void; từ chối nếu vượt. Sửa sai bằng void có lý do, không hard-delete audit. Source import confirm cũng khóa bảng và chặn thay report làm actual thấp hơn WIP đang hiệu lực.

UI đã làm: trang navbar riêng “Bàn giao WIP”, tìm PI/khách/màu, chọn dòng PO, ghi số lượng/đơn vị/ngày/ca/người giao/người nhận/ghi chú; hiển thị lịch sử, lượng actual còn khả dụng và void kèm lý do. Không cho bàn giao khi actual nguồn thiếu hoặc unit không khớp.

**Rollback:** dừng ghi, xuất/backup các bản ghi handoff để lưu hồ sơ; migration down drop index và bảng `production_handoffs`. Rollback xóa các bản ghi handoff, không đụng production output hoặc đơn hàng. Migration file đã tạo nhưng chưa chạy database.

## Scope dự kiến khi P0 được chốt

- UI: `src/components/orders/POSummaryTable.tsx`, `src/components/orders/ProductionRecordsWorkspace.tsx` và page summary/Production Orders.
- Data/API: `src/app/api/orders/journey-summary/route.ts`, `src/app/api/orders/[id]/handoffs/**`, source import confirm routes, `src/app/api/production-records/route.ts`, `src/app/api/knitting/progress/[orderId]/route.ts`, `src/app/api/reports/production-summary/route.ts`.
- Schema/migration local: `prisma/schema.prisma`, `prisma/sql/20261116_production_handoffs.sql`, rollback tương ứng.

## Out of scope

- Tự động trừ nguyên liệu kho khi có sản lượng.
- Tự động quy đổi WIP giữa kg, beam, mét, cuộn và tấm.
- Thay đổi mẫu in M30-06/07 hoặc nhập file khách vào production để QA.

## Acceptance dự kiến

1. Tra cứu PI/khách trả về đúng đơn và từng item; nhiều item không bị cộng lẫn đơn vị.
2. Kéo sợi hiển thị kg actual so với nhu cầu sợi; Dệt hiển thị mét actual theo `mValue` ở cấp PI và chỉ hiện actual theo item đã link; Đóng gói hiện target theo đơn vị PO. Actual đóng gói chờ file SNY có PI/item, số nhập tay được tách riêng.
3. Các số tổng dệt khớp `CHART` theo cùng khoảng ngày/ca; kg khớp riêng, không cộng mét với kg.
4. Dòng PI chưa ghép được vẫn nhìn thấy nhưng không bị gán nhầm item hoặc cộng vào kết luận theo PI.
5. Không đưa ra “cần sản xuất thêm/đã đủ” khi thiếu actual đóng gói hoặc đơn vị không tương thích.
6. Handoff ledger hỗ trợ bàn giao một phần, chặn vượt actual khả dụng cùng đơn vị, lưu người/thời điểm và void có lý do; import không được làm actual thấp hơn WIP đang hiệu lực.

## Điều kiện còn chặn hoàn tất

- Chờ file SNY có actual đóng gói theo PI/item; workbook hiện tại có sheet đóng gói ghi tháng 01/2026.
- Migration chỉ chạy trên DB test riêng `sny_uat_codex_20261117`; chưa chạy production.
- Chưa có file SNY có PI/item nên actual đóng gói chưa được đối soát với PO.
