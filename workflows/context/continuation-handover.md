# Bàn giao tiếp tục SNY Planner Tool

Cập nhật: **23/09/2026**. Đây là tài liệu trạng thái để người nhận tiếp tục công việc, không phải biên bản nghiệm thu hoàn tất.

**Cập nhật Git sau khi soạn bàn giao:** source/SQL/docs đã được commit `1aa86c5` và push lên `origin/develop`. Người dùng sau đó yêu cầu push cả `workflows/`; bộ context và plan trong thư mục này được đưa vào Git cùng bản cập nhật này. Những mô tả “chưa commit” và “workflows bị ignore” bên dưới là trạng thái lúc kiểm kê ban đầu, đã được thay thế bởi cập nhật này. AGENTS và test local bị ignore vẫn chưa được thêm; tài liệu gốc ngoài repo vẫn cần chuyển riêng. Test 46/46 và type-check đã chạy lại đạt trước commit source; chưa chạy migration/backfill/deploy DB khách.

## 1. Trạng thái khi bàn giao

- Repo làm việc: `sny-planner-tool`, nằm trong thư mục cha `SNY` chứa cả tài liệu gốc.
- Máy hiện tại: `/Users/thiennc/Desktop/teso/SNY/sny-planner-tool`.
- Branch: `develop`; HEAD: `18f741e` — `Harden imports and schedule replacement`.
- Kiểm tra ngày 23/09: **35 file tracked đang sửa**, thêm `docs/customer-requirement-gaps.md` và `prisma/sql/` chưa track. Các patch này chưa commit; HEAD không đại diện toàn bộ code đã được kiểm tra trong hội thoại.
- Đã có bản sửa local cho import đơn, validation, số cuộn, tồn kho và Packing. Chưa có bằng chứng đã deploy các bản sửa này hoặc đã chạy migration/backfill trên DB khách.
- Plan mới **đã viết, đang chờ duyệt, chưa triển khai**: [current-customer-requests-plan.md](../plans/current-customer-requests-plan.md). Slug: `current-customer-requests`.
- Chưa có hồ sơ Implement/Review/Fix/Report cho slug này trong `workflows/`. Không được quy các patch có sẵn thành kết quả implement của plan mới.
- [product-color-recipe-plan.md](../plans/product-color-recipe-plan.md) đã đánh dấu lịch sử; không thực hiện song song hoặc lấy các quyết định cũ để ghi đè plan hiện hành.

## 2. Mục đích và yêu cầu khách

SNY Planner phục vụ bộ phận kế hoạch/thống kê/kho nhà máy SNY VINA, tập trung đơn hàng, lịch máy, sản lượng công đoạn và tồn nguyên liệu để lập kế hoạch từ số liệu đáng tin cậy.

Luồng nghiệp vụ chính: PO/PI nhiều dòng → tạo/duyệt đơn nháp → lịch máy → Extruder → Warping → Knitting → Rolling → Packing; báo cáo các công đoạn và tồn kho được nhập từ Excel. Đây là luồng nghiệp vụ, không phải state machine bắt buộc mọi công đoạn nối tiếp trong code.

Yêu cầu trong ảnh chat đã cung cấp:

1. File 30 dòng không được âm thầm chỉ nhập 20 vì thiếu/trùng NO.
2. Khách cũ không bị báo “KH MỚI”; nối lại các đơn cũ đã import, với ví dụ GROMAX, SEDCO, TARPSWIN, INTERWAY.
3. Excel nhập đơn phải bảo toàn thông tin như New Order, gồm số kim/số dàn.
4. Preview báo thiếu trường theo dòng; dòng hợp lệ vẫn được nhập; kết quả báo rõ số nhận và số bỏ.
5. Đơn nháp theo cuộn phải sửa được số cuộn và tính lại số liệu.
6. Bổ sung phần màu theo cấu hình First/Middle/Back Bar; mẫu DESERT SAND A/B đã được cung cấp.
7. Có báo cáo tồn kho riêng.
8. Hongloan ngày 16/09/2026 yêu cầu báo cáo tất cả bộ phận vào hệ thống, số liệu khớp nguồn để kế hoạch sử dụng.

Ảnh chat là bằng chứng yêu cầu; câu “đã fix” trong chat là thông báo lịch sử, không chứng minh bản đang chạy đúng.

## 3. Đã làm và chưa làm theo yêu cầu

| ID | Phần đã có trong code local | Phần chưa hoàn tất/kiểm chứng |
|---|---|---|
| CHAT-01: số dòng/NO | Preview trả toàn bộ dòng parse; sinh NO thiếu tránh số tường minh phía sau; phân loại new/identical/conflict/invalid | Cần hoàn thiện cảnh báo NO tự sinh và số đếm UI; kiểm tra cùng PI khác hoa thường; UAT 30 dòng từ preview tới DB |
| CHAT-02: khách cũ | Confirm import ghép tên không phân biệt hoa thường; gắn customerId; có script backfill | Chưa xác nhận dữ liệu bốn khách trên DB thật đã sửa; script còn `findFirst`, không xử lý đủ trùng tên; matching whitespace/ambiguous cần hoàn thiện theo plan; không suy alias |
| CHAT-03: field Excel | Template/parser/preview/confirm có kim, dàn, MB, GSM SX, ngày giao, container, packing, eyelet, note, qty và quy cách | Cần kiểm thử round-trip API/DB/UI toàn bộ field; đơn vị UV có dấu hiệu không thống nhất cần đối chiếu nguồn |
| CHAT-04: thiếu trường | Có validation từng dòng; confirm chỉ tạo dòng mới hợp lệ; trả summary | UI đếm hợp lệ đang dựa `isValid`, có thể gồm conflict/identical; cần đếm theo quyết định server và kiểm tra thông báo |
| CHAT-05: số cuộn | Detail có input số cuộn/số tấm; hàm tính lại mét/m²/kg, không lấy tổng mét cũ khi thiếu input rolls/pieces | Chưa kiểm thử UI + PATCH + reload trên DB test; cần kiểm tra nháp/duyệt và stale update |
| CHAT-06: A/B | Hiện chỉ có ColorPreset một màu/MB/supplier và thông số gợi ý | **Chưa có** ProductColorRecipe, snapshot trên đơn, API/panel chọn A/B; thiết kế mới chỉ nằm trong plan |
| CHAT-07: tồn kho | Có Materials; bản sửa local thêm snapshot, chọn block, retry/correction và bảo vệ mốc tồn; có SQL | Chưa xác nhận migration đã áp dụng; chưa test transaction/concurrency trên DB thật sự tách biệt; chưa chứng minh bao phủ mọi sheet tồn |
| CHAT-08: mọi bộ phận | Có parser/API/UI Extruder, Warping, Knitting tổng/chi tiết, Rolling, Packing | Chưa đối soát toàn bộ nguồn → DB → UI; Rolling append có nguy cơ nhân đôi; sheet kho/chỉ tape còn cần mapping |

“Có code” trong bảng không đồng nghĩa đã nghiệm thu, triển khai hoặc cập nhật dữ liệu khách.

## 4. Các phần nghiên cứu/tài liệu đã hoàn thành

- Đã tổng hợp mục tiêu, actor, entity, luồng, rule, nguồn nghiệp vụ, câu hỏi và giới hạn bằng chứng thành bộ context.
- Đã kiểm kê các nhóm bàn giao: `tailieubangiao`, `Sofware Develoment`, `Tổng hợp thông tin dự án`, `User Raw Documents`, `plans`, source cũ và source hiện tại.
- Hồ sơ audit ghi đã lập chỉ mục **14 workbook, 629 sheet, 2.875.311 ô có dữ liệu và 1.211.858 ô công thức**. Đã đọc sâu vùng liên quan nghiệp vụ; **không tuyên bố đã kiểm chứng thủ công từng ô**. Hình nhúng, macro, external link và cached formula chưa được xác minh toàn diện.
- Đã tìm được công thức Work Order, MB/FR, ví dụ phân bổ nhiều màu và cơ sở kg nhựa của chỉ dẫn MB 3%; không hỏi khách gửi lại toàn bộ công thức.
- Đã lập plan theo yêu cầu người dùng, phân biệt phần làm ngay, bước đối soát cần thêm mapping và phần mở rộng ngoài scope.
- Trong các lượt lập plan/bàn giao gần nhất chỉ cập nhật Markdown; các patch source có sẵn phải được giữ và review, không gán toàn bộ tác giả/trạng thái hoàn tất cho người lập tài liệu.

Điểm vào bộ tài liệu: [README context](README.md). Nội dung chính:

- [Mục tiêu và yêu cầu khách](handover-01-product-requirements.md).
- [Công thức và cấu hình](handover-02-formulas-recipes.md).
- [Báo cáo và độ đúng dữ liệu](handover-03-reports-data.md).
- [Tiếp nhận và nguồn bằng chứng](handover-04-delivery-sources.md).
- [Business logic tổng hợp](business-logic.md), [phạm vi đã đọc](business-logic-source-coverage.md).

## 5. Kết quả kiểm tra đã thực hiện

Kết quả dưới đây từ lượt kiểm tra **22/09/2026 trong hội thoại**, không phải chạy lại ngày 23/09:

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| TypeScript `tsc --noEmit` | Đạt | Không xác minh dữ liệu DB |
| Test trong `src`, Node test runner + tsx | 46/46 đạt | Unit/parser/helper/template, không phải UAT hay integration DB đầy đủ |
| `npm run build` | Đạt | Có cảnh báo tải Google Font thất bại; không chứng minh deploy/migration |
| UI end-to-end với file khách | Chưa xác minh | Không được ghi PASS |
| Migration/backfill/đối soát DB khách | Chưa xác minh | Không tự chạy dựa vào `.env` hiện tại |

Có 9 file test trong `src`: order template, orderWeight, parseMaterialReport, parseOrderList, parsePackingReport, parsePastedText, preserveOrderLinks, importSafety, orderImport.

**Lưu ý quan trọng:** `tests/integration/complete-existing-flows.test.ts` hiện chỉ kiểm tra guard URL DB local có tên kết thúc `_test`; không gọi API hay kiểm tra transaction. Tên file không phải bằng chứng đã có integration test nghiệp vụ.

Lệnh chạy lại unit baseline từ repo root:

```sh
node --import tsx --test src/app/api/orders/template/route.test.ts src/lib/calculations/orderWeight.test.ts src/lib/excel/parseMaterialReport.test.ts src/lib/excel/parseOrderList.test.ts src/lib/excel/parsePackingReport.test.ts src/lib/excel/parsePastedText.test.ts src/lib/excel/preserveOrderLinks.test.ts src/lib/schedule/importSafety.test.ts src/lib/validations/orderImport.test.ts
./node_modules/.bin/tsc --noEmit
npm run build
```

## 6. Những điểm cần giữ đúng khi tiếp tục

1. **Rolling:** `src/app/api/materials/rolling/import/confirm/route.ts` hiện dùng `createMany` theo batch, không upsert, không transaction bao cả file. Không tin mô tả “upsert/insert” cũ. Phải xác định khóa dòng/block và phạm vi thay thế trước khi sửa; PI + ngày không đủ vì PI nhiều dòng. Không xóa toàn bộ theo ngày hoặc filename tùy tiện.
2. **Kho:** nhận định bốn sheet chưa migrate là lịch sử bàn giao. HDPE hiện có parser chọn block; DB đã được nhập chưa vẫn chưa xác minh. `HDPE KO SỬ DỤNG`, `CHI TAPE HONSIN 2022`, `CHI TAPE TRAN KHANG` chưa được parser nhóm hiện tại chọn trực tiếp; các file còn có sheet khác phải kiểm kê theo từng kỳ. Không gộp kg/mét/cuộn vào một trường tồn chỉ vì đều là inventory.
3. **UV:** preview import nhân `uvPct × 100`, template dùng 0.02, schema ghi 0–100. Đây là dấu hiệu lệch đơn vị cần nguồn thật xác nhận trước sửa; không nhân/chia 100 hàng loạt dữ liệu cũ.
4. **Khách hàng:** backfill còn chọn `findFirst`; phải phát hiện nhóm nhiều candidate trước ghi. Không tự nối tên viết tắt/alias hoặc ghi đè customerId đã có.
5. **Tiến độ:** DONE hiện dựa lịch hết hạn; không chứng minh đủ sản lượng/đóng gói/giao hàng. Một máy/ngày chạy nhiều đơn có nguy cơ quy tổng mét cho nhiều đơn; chống đếm trùng trong một đơn không giải quyết phân bổ giữa các đơn.
6. **Warping:** nguồn `WARPING!L8 = K8 × (I8 − J8)` và ví dụ 14 × (35,5 − 13,5) = 308 kg. J được đối chiếu là bì beam; G là loại/spec beam mới là suy luận mạnh từ nguồn khác, không được nâng thành rule chắc chắn để migrate. `ProductionOrder.beamCount` đang là “Số dàn”, không phải số beam dùng cho Work Order.
7. **SMALL/BIG:** giữ nhãn nguồn và các metric riêng; chưa đủ bằng chứng Việt hóa thành ca làm/cỡ lõi. Ngày gộp Rolling có hành vi lấy ngày đầu; không tự chia đôi sản lượng.
8. **Tài liệu cũ:** `docs/customer-requirement-gaps.md` và một số spec còn câu hỏi đã được workbook/ảnh trả lời; không sao chép nguyên danh sách câu hỏi để hỏi khách. Tra nguồn trước, ghi rõ mâu thuẫn giữa tài liệu và source.

## 7. Nghiệp vụ đã có bằng chứng, không hỏi lại từ đầu

- Work Order: mét/beam = kg × 9.000.000 / sợi / denier; kg/beam = mét × sợi × denier / 9.000.000; sợi/beam = khổ cm × loss kim × kim/inch × số khổ / 2,54 / số beam. Nguồn `Formular.xlsx`, `EXTRUDER 2023.xlsx`. Ví dụ phù hợp làm tròn gần nhất nhưng chưa chứng minh quy tắc `.5` chung.
- MB: có chỉ dẫn `100KG NHỰA =3KG MÀU` và tỷ lệ 3,5%/3,7% khác; có công thức phân bổ theo trọng số trong workbook kế hoạch MB. Không hard-code 3% hoặc một hệ số loss cho mọi sản phẩm.
- Heating đã có dưới dạng chỉ dẫn sản xuất; chưa tìm thấy công thức định lượng để thêm hệ số tính toán.
- DESERT SAND#467: 325 GSM; Tape 2.0mm-440D; Mono 24-450D; Course 14; Wale 6; MB 3%; With heating machine. FIRST có 3 thành phần, MIDDLE 2, BACK 2. A có BACK/2 Dark beige 3160-2 / Korea; B có Beige 8005A / Arirang. Bảng đầy đủ nằm trong context công thức và plan cũ.
- Các nhóm báo cáo và sheet đã được bàn giao đủ để bắt đầu mapping; không hỏi chung “tất cả bộ phận là bộ phận nào?”. Sheet `% DỆT`, `%LINE`, `CHART`, `CHART KNITTING` là tổng hợp/pivot, không import cộng thêm như nguồn độc lập.

**Ranh giới hiện tại:** lưu/chọn A/B thủ công + snapshot là thiết kế đề xuất trong plan, chưa phải xác nhận khách và chưa implement. Work Order calculator, tự tính MB/FR, tự chọn A/B/loss, mua hàng, tự trừ tồn là ngoài đợt này; không lấy “có công thức” làm quyền triển khai tất cả tự động hóa.

## 8. Thứ tự để người nhận tiếp tục

1. Đọc file này, `AGENTS.md` hiện tại và plan `current-customer-requests`; đọc context theo luồng cần làm. `AGENTS.md` đã thay đổi giữa các lượt, dùng bản trên đĩa; hiện nhấn mạnh viết/chạy automation test trước khi coi Implement xong. Tham chiếu `../.tessl/RULES.md` không thấy ở đường dẫn repo chỉ tới, không tuyên bố đã đọc.
2. Xác nhận trạng thái duyệt plan. Yêu cầu soạn bàn giao không phải phê duyệt Implement. Quy trình theo AGENTS: Plan → Implement → Review → Fix → Report; giữ cùng slug, append review, tối đa 2–3 vòng fix.
3. Ghi lại HEAD/worktree và review các patch hiện có; chạy lại baseline khi bắt đầu sửa. Không reset hoặc overwrite thay đổi người dùng.
4. Hoàn thiện CHAT-01..05 theo plan: NO/warnings/counts, matching/backfill, field parity/UV, qty draft và API/DB/UI regression.
5. Lập `statistical-report-coverage.md` và `statistical-report-reconciliation.md` theo từng nguồn. Hai file này **chưa tồn tại** lúc bàn giao. Dùng STATISTICAL tháng 4/5 đã có làm dữ liệu đầu tiên; không coi ảnh tên file tháng 8 là đã có file gốc.
6. Thiết lập/xác minh DB test tách biệt; kiểm thử migration snapshot, import lặp/correction/concurrency/rollback và dữ liệu cũ. Không dùng DB khách để thử.
7. Chốt phụ lục gap Rolling và sheet tồn: file/hàm/interface/identity/phạm vi replacement/legacy/test phải cụ thể trước khi Implement. Plan hiện có bước khảo sát nhưng chưa đặc tả sửa hoàn chỉnh cho mọi sheet; không chuyển phần này thành câu hỏi khách khi còn tra được nguồn.
8. Implement recipe theo thiết kế đã duyệt: schema/SQL → validator/types → API catalog/gắn snapshot → panel chi tiết → tests. Không tự seed DESERT SAND cho một khách chưa được nguồn xác nhận.
9. Review riêng, sửa finding có bằng chứng, UAT file thực; report tách local/DB/UI/deploy. Chuẩn bị migration/backfill/deploy và quyền thực hiện trước thao tác lên môi trường thật.

Ví dụ nghiệm thu bắt buộc: 30 dòng đủ field và NO trống → giải trình đủ 30; khách cũ duy nhất → không tạo mới; width 4m/GSM100/rollLength100/qty20→25 → mét 2000→2500, m² 8000→10000, kg 800→1000; retry báo cáo không tăng tổng; A/B giữ đúng 7 thành phần sau reload. Tổng đúng nhưng chi tiết sai vẫn không đạt.

## 9. Cách chuyển giao đủ dữ liệu

- `workflows/`, `AGENTS.md`, thư mục `tests` và nhiều file `*.test.ts` đang được ignore theo yêu cầu người dùng không push nhầm. File bàn giao này cũng nằm trong vùng ignore.
- Có **hai test đã tracked từ trước**: `src/lib/excel/preserveOrderLinks.test.ts`, `src/lib/schedule/importSafety.test.ts`. Ignore không làm untrack file đã tracked; không tự xóa/untrack chúng trong bước bàn giao.
- Clone repo chỉ nhận nội dung committed; **không nhận 35 patch chưa commit, các file untracked và bộ context/test ignored**. Cần chuyển bản sao workspace hoặc gói file chọn lọc riêng cho người tiếp nhận, gồm source local, SQL, AGENTS, workflows và test cần thiết. Chưa tạo/gửi gói bàn giao trong lượt này.
- Chuyển kèm các thư mục nguồn ở cha `SNY`: `tailieubangiao`, `Sofware Develoment`, `Tổng hợp thông tin dự án`, `User Raw Documents`, `plans`. Giữ cấu trúc để link tương đối còn dùng được.
- Các ảnh chat/A/B đã nằm trong hội thoại; chưa có bộ ảnh nguồn độc lập ổn định trong context. Chuyển/export kèm ảnh khi bàn giao cho người không truy cập hội thoại. Nội dung yêu cầu và thông số đã được ghi lại ở file này/context.
- Không đưa `.env`, mật khẩu, connection string hoặc backup DB nhạy cảm vào gói chia sẻ mặc định; bàn giao quyền truy cập qua kênh riêng được chủ dự án cho phép. Các bản trích nguồn ở thư mục tạm không nên là phụ thuộc duy nhất; dùng file gốc để tái kiểm tra.

## 10. Mức độ hoàn tất thực tế

Đã có khung hiểu nghiệp vụ, bộ context, plan tiếp tục và nhiều bản sửa local chạy qua unit/type/build ở lượt trước. **Chưa hoàn tất toàn bộ yêu cầu chat, chưa clear mọi rule của toàn dự án, chưa nghiệm thu số liệu báo cáo, chưa xác nhận migration/backfill/deploy.** Người nhận có thể tiếp tục từ plan và worktree hiện tại; cần giữ sự phân biệt này trong mọi báo cáo tiến độ.
