# 04 — Quyết định đã chốt và bẫy kỹ thuật

Đừng lật lại quyết định dưới đây nếu không có yêu cầu mới từ anh Trí hoặc khách.

## 1. Quyết định nghiệp vụ / sản phẩm
| Quyết định | Ngày | Nguồn |
|---|---|---|
| **Chưa làm đăng nhập/phân quyền** trong Phase 1 — D2 | 09/10 | BACKLOG F |
| "Đơn đang chạy" = đã gán lịch; "đã xong" = hết lịch (không nút tay) | 09/10 | BACKLOG E (Q2, O02) |
| Máy hư: số đã dệt **ước tính theo lịch** (năng suất × ngày làm việc trước ngày dừng), không lấy sản lượng thật | 09/10 | BACKLOG E (O03) |
| Ngày nghỉ tô **vàng** (MoM ghi "trắng") — lệch chủ động | 10/10 | Đối chiếu MoM 12/10 |
| Lịch nghỉ chung toàn nhà máy; ai cũng sửa được | 09/10 | BACKLOG E (O01), F |
| Vật tư gắn PI bằng cách ghi PI trên phiếu xuất (phương án A) | 09/10 | BACKLOG E (O04) |
| Tổng hợp sản lượng theo PI (§3.4 / H1): **hoãn** | 09/10 | BACKLOG B |
| Import lịch: PI nhiều dòng gắn **dòng đầu**; PI chưa có thì tạo **đơn nháp giữ chỗ** | 11/10 (A7=b) | BACKLOG |
| ~~Import HDPE lịch sử chỉ ghi snapshot theo ngày, không đổi tồn hiện tại (D1 = B)~~ — **thay bằng D1 = B+ ngày 27/10** (dòng dưới) | 09/10 | BACKLOG F |
| 83 file test giữ local, không đưa vào git | 19/10 | 1910-04 huỷ |
| Nhật ký xoá đơn: hoãn tới trước go-live | 19/10 | 1910-09 |
| **Xếp chung:** khoá nhóm = PI + khổ + GSM + màu + loại lưới (server kiểm lại); ngày **làm tròn lên**, cho sửa tay + cảnh báo "Thiếu N ngày"; ô mét khoá = tổng nhóm; thanh nhóm chỉ hình thành khi cùng máy + cùng ngày bắt đầu/kết thúc; **lịch cũ không tự gộp** | 22/10 | `REPORT/22102026/CLAUDE/PLAN_2210_FEEDBACK_DUNG_XEP_MAY_22102026.md` |
| Thanh công cụ Chuyển máy / Dời ngày đi **cả nhóm**; Chuyển máy… trong Chi tiết đổi **1 dòng** (tách nhóm); swap chặn khi trong nhóm | 22/10 | như trên |
| Máy hư cho nhóm: **giữ cách lưu** (năng suất cả máy trên từng lịch con), tính đã dệt/còn lại **cấp nhóm** rồi chia từng dòng bằng phần dư lớn nhất theo cent; hàm thuần không tính ngày, ngày máy đích qua `resolveAssignmentDates` | 26/10 | `REPORT/26102026/CLAUDE/CARD_2610-01_2610-02_CODEX_26102026.md` |
| Nhu cầu sợi theo đơn dùng hệ số **1,05**, không sửa trong đợt MoM | 07/10 | `KE_HOACH_TONG_HOP_SCHEDULE_MATERIALS_SAU_FEEDBACK_07102026.md:356` |
| **D1 đổi từ B sang B+** — nhập lịch sử HDPE nhận **mọi kỳ** trong file (một file tháng = một lần nhập); tồn hiện tại = ảnh chụp **mới nhất trong DB** (không phải mới nhất trong file), chỉ tự đè khi không có dấu vết chỉnh tay; lịch sử vẫn **không tạo phiếu**; tên chưa có: Bỏ qua / Tạo mới / Ánh xạ, mặc định Bỏ qua; kỳ chồng nhau = xung đột, không tự chọn | 27/10 | `REPORT/27102026/CLAUDE/PLAN_FINAL_HDPE_THEO_THANG_27102026.md`, card 2710-03 |
| Kỳ gộp nhiều ngày (`23+24+25/10`): `stockReportDate` lấy **ngày cuối** kỳ | 27/10 | card 2710-03 |
| B3: mở card tổng hợp sản lượng theo mã PI ghi trong file (chưa cần gắn đơn) — 2710-04, chưa viết | 27/10 | chat 27/10 |

## 2. Quy trình làm việc đã chốt
- Claude: phân tích, plan, viết card, review, kiểm thật. **Codex: sửa `src/`.** Claude không tự sửa `src/` (luật `CLAUDE.local.md`), trừ khi anh Trí yêu cầu trực tiếp.
- Mỗi card 1 commit; Codex commit local rồi **dừng chờ Claude review**; Claude tự chạy lại test, không tin số của Codex.
- Card ghi rõ `file:line`, số liệu kiểm, lệnh test; "Không được" (không push, không DB thật, không `git add .`).
- Review chéo: Codex review lại plan/card của Claude trước khi làm; Claude review lại kết quả Codex.

## 3. Bẫy kỹ thuật đã gặp (đừng giẫm lại)
| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| **Merge vào `main` bằng `gh pr merge` (API)** | Vercel không tạo deploy production (#18, #19); merge bằng nút web thì deploy trong 15–60 s (#20, #22) | Luôn merge `main` trên web. Lỡ rồi thì `vercel promote <url bản develop cùng code>` |
| **Localhost dùng DB production** | Thao tác thử trên local ghi thật vào dữ liệu khách | Chỉ thao tác trên PI `TEST-xxxx`, chạy Playwright có chặn ghi (05) |
| Ngày lưu 2 kiểu: app lưu `…T17:00Z` (= 0h VN), import/legacy có thể lưu `…T00:00Z` | So timestamp thô thì 2 lịch cùng ngày VN không thấy nhau → nhân đôi sản lượng (R-1) | So theo biên ngày VN: `${scheduleDay(d)}T00:00:00+07:00` … `T23:59:59.999+07:00` (như `overlapWhere`) |
| Sản lượng dệt lưu `reportDate` = `…T00:00:00Z` | — | Dùng `scheduleOutputBounds` / `outputFallsWithinSchedule` |
| Cộng float tổng mét (446,4 + 180,6 …) | Thừa 1 ngày khi tổng sát bội năng suất (R-2) | `roundMeters` trước khi chia; chia mét theo cent (số nguyên) |
| Lịch nghỉ `FactoryCalendar` là bộ quy tắc; tháng chưa nạp sẽ âm thầm dùng mặc định "nghỉ CN" | Tính sai ngày kết thúc tháng sau | Tính ngày qua `resolveAssignmentDates` (tự nạp lại khi vượt khoảng); không tự gọi `calculateProductionSchedule` với lịch truyền sẵn |
| `withAssignmentLock` = `LOCK TABLE machine_assignments SHARE ROW EXCLUSIVE` (không phải advisory lock), timeout 5 s | Thao tác nhóm trên prod chậm ~10 s; đọc trước khoá có cửa sổ cạnh tranh (R-7) | Đọc dữ kiện quyết định bên trong transaction |
| `npx tsx --test "<file>"` với đường dẫn có `[id]` / `[orderId]` | Coi ngoặc vuông là glob, báo 0 test (tưởng đạt) | Chạy `npx tsx "<file>"` hoặc `node --import tsx "<file>"` |
| `npm test` glob `src/**/*.test.ts` | Bỏ sót file trong thư mục `[...]` | Chạy riêng các file đó |
| `next build` trên máy không ra được internet | Tải Google font timeout | `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=<…>/test-results/1810-04/next-font-mocks.cjs`; build xong `git checkout -- tsconfig.json` |
| `pg_dump` bản 17 trên PATH | Không dump được Neon PG 18.6 | Dùng `pg_dump` 18 (skill `/pg-backup`) |
| Chuỗi tiếng Việt trong bundle JS bị minifier mã hoá | Grep bundle production không thấy chữ | Grep tên trường ASCII (ví dụ `orderIds`, `perMember`) để xác nhận bản deploy |
| File Excel khách: tên sheet có khoảng trắng cuối (`"HDPE "`, `"ROLLING "`), sheet bẫy `"HDPE KO SỬ DỤNG"`, block ngày bước không đều, header M/B không phủ hết cột | Parse sai vị trí | Định vị bằng nhãn, không bằng chỉ số dòng (BACKLOG B, ghi chú §3.1) |
| Cột `OUT USEING` trong Excel là **số dư suy ra**, không phải lượng ghi nhận | Không tách vật tư theo đơn được | Nói với khách trước khi hứa phân bổ vật tư theo đơn (BACKLOG B, ghi chú §3.4) |
| File báo cáo > 4,5 MB | Vercel chặn 413 | Đã xử lý N16 (15/10) |
| Xoá theo mã PI | PI nhiều dòng có cả đơn thật lẫn nháp cùng mã → xoá nhầm đơn thật | Xoá theo id, qua route `bulk-delete` có `expectedAssignments` |
| Hook guard `.agents/hooks.json` không chạy dưới Claude Code | Luật chỉ trên giấy | Tự tuân thủ (AGENTS.md "Riêng Claude Code") |
| Sheet **WARPING** của khách: từ khối 16/10 dòng tên công ty đổi thành `%`; parser cũ dựa vào dòng đó nên dồn 7 ngày vào 15/10 **mà vẫn báo thành công** | Số liệu sai âm thầm | Đã sửa 2710-01: mốc khối = dòng tiêu đề `WARPING`; chặn khối thiếu ngày, chặn 2 khối cùng ngày. Khách đổi bố cục file → chạy dry-run trước |
| Sheet **HDPE**: khách gộp 3 ngày cuối tuần thành một khối `09+10+11/10/2026`; parser cũ chỉ nhận 2 ngày | Nhập lịch sử cả tháng bị từ chối | Đã sửa 2710-02: nhận N ngày; `reportPeriodEnd` = ngày cuối |
| Tên vật tư trong file **lệch chính tả giữa các tháng**, cả trong cùng file (`9043 BROWN` / `9043 BRROWN`) | Tạo vật tư trùng, tồn tách đôi | Màn nhập lịch sử có gợi ý tên gần giống + Ánh xạ (2710-03); cho sửa tên vật tư. Luôn xem trước; không chọn "Tạo mới" khi chưa chắc |
| Route xác nhận Knitting tổng `upsert` tuần tự 760 dòng → 45 s trên local | Có thể timeout trên Vercel với file lớn hơn | Backlog: gom `createMany`/transaction |
| Gửi file nguyên 5,5 MB thẳng vào API bằng script → 413 | Tưởng route hỏng | Trình duyệt tự cắt sheet (`prepareReportUpload`) trước khi gửi; script kiểm cũng phải cắt |
| Route **confirm** không đồng nhất: Knitting tổng, Rolling, HDPE nhận **file multipart**; Extruder, Warping nhận **JSON `{ rows: preview.rows }`** | Gọi sai kiểu → 400 "Invalid JSON" (không ghi gì) | Đọc modal tương ứng trước khi gọi route bằng script |
| `recordsDeleted` ở confirm Extruder/Warping = **số nhóm máy×ngày quét xoá**, không phải số dòng đã xoá (`extruder/import/confirm/route.ts:102`) | Tưởng mất dữ liệu | Đối chiếu id trước/sau; backlog đổi nhãn |
| Không phải mọi `*.test.ts` đều là test local (B1): `reportHistoryImport.test.ts` đã track từ `77f12ac` | Sửa test mà không commit → checkout sạch đỏ | Kiểm `git ls-files <file>` trước khi xếp vào B1 |
