# Plan — Thông số màu/sợi, công thức và đối soát báo cáo các bộ phận

> **22/09/2026 — PLAN LỊCH SỬ, KHÔNG DÙNG ĐỂ IMPLEMENT.** Phạm vi và thứ tự hiện hành nằm tại [current-customer-requests-plan.md](current-customer-requests-plan.md). Giữ file này để truy nguồn ảnh/công thức. Các mục làm Work Order ngay, quy tắc half-up, kết luận chắc chắn về BEAM thứ nhất và các câu hỏi A/B tổng quát bên dưới không phải chỉ dẫn hiện hành. Đọc giới hạn bằng chứng trong context trước khi sử dụng.

Ngày lập: 21/09/2026. Rà lại nguồn gốc: 22/09/2026. Slug: `product-color-recipe`.

Trạng thái: **PLAN — đã tách phần rõ để thực hiện sau duyệt và phần chưa chắc chỉ ghi chú. Chưa Implement.**
Theo chỉ đạo mới: không chờ mọi câu hỏi được giải đáp mới lên kế hoạch cho phần đã rõ. “Đã rõ” là có bằng chứng nghiệp vụ, không đồng nghĩa code đã hoàn thành hoặc bản production đã đúng. Các quyết định kỹ thuật trong phạm vi độc lập bên dưới được đề xuất để duyệt; không gán chúng thành yêu cầu do khách xác nhận.

#### Phạm vi đã rõ — đưa vào kế hoạch thực hiện

| ID | Bằng chứng đã có | Việc lên kế hoạch | Giới hạn |
|---|---|---|---|
| CLEAR-01 | Hongloan yêu cầu báo cáo tất cả bộ phận, số liệu chuẩn để làm kế hoạch | Lập bảng bao phủ, mapping nguồn → code → DB/UI, đối soát và lập danh sách sai lệch | Không tuyên bố danh sách bộ phận đã đầy đủ; chỉ sửa code sau khi gap có đặc tả |
| CLEAR-02 | Ảnh DESERT SAND#467 A/B có đủ thông số và thứ tự thành phần | Chuẩn hóa thành fixture local bảo toàn nguyên văn để dùng đối chiếu/test về sau | Không gắn khách hàng/đơn, không tự chọn A/B, chưa thêm schema/API/UI |
| CLEAR-03 | Formular.xlsx Sheet1!A2:B4, EXTRUDER 2023 Sheet2/Sheet4 có công thức, tên input và ví dụ làm tròn | Viết ba hàm tính thuần; giữ raw value và trả giá trị vận hành làm tròn số nguyên gần nhất cho mét/sợi, kg giữ 2 số lẻ theo ví dụ | `needleCount` có thể cấp số kim; không dùng field `beamCount` hiện mang nghĩa Số dàn thay cho Số beam sử dụng; hai input này phải tách riêng |
| CLEAR-04 | Workbook kế hoạch MB có công thức phân bổ nhiều màu theo trọng số; file Extruder ghi trực tiếp `100KG NHỰA = 3KG MÀU` và các tỷ lệ 3,5%/3,7% | Ghi/số hóa recipe với trọng số từng thành phần, tỷ lệ MB theo recipe/lệnh và các mẫu đối chiếu có ô nguồn | Không hard-code 3%; không biến loss/hệ số của một dòng thành mặc định toàn nhà máy |
| CLEAR-05 | STATISTICAL WARPING có `WEIGHT=QUANTITY×(WEIG−BEAM)`; CC2018 tách Loại beam và kg beam | Sửa đặc tả báo cáo để coi BEAM thứ nhất là loại/spec beam, BEAM thứ hai là kg bì beam; lập migration/compatibility plan đổi tên semantic | Chưa rename schema/code trong bước Plan; giữ dữ liệu cũ, không coi hai trường là beam count |

Thứ tự ưu tiên: CLEAR-01 → CLEAR-05 → CLEAR-02 → CLEAR-03 → CLEAR-04. Các phần độc lập không bị chặn bởi Q1–Q3; riêng truy cập/ghi dữ liệu test vẫn cần môi trường và quyền phù hợp. Lượt hiện tại chỉ chỉnh plan, không bắt đầu thực hiện các bước này.

### Mục tiêu

Biểu diễn đúng hai cấu hình DESERT SAND#467 A/B và các công thức bàn giao, đồng thời lập phạm vi cập nhật/đối soát báo cáo tất cả bộ phận để số liệu trên hệ thống đủ tin cậy cho công tác kế hoạch.

#### Bổ sung yêu cầu REPORT-ALL — báo cáo tất cả bộ phận phục vụ kế hoạch

- Nguồn: ảnh chat Hongloan do người dùng bổ sung ngày 21/09/2026, mốc ngày trong ảnh là 16/09/2026, giờ tin cuối 09:59. Nội dung yêu cầu: cập nhật báo cáo thống kê vào hệ thống cho tất cả các bộ phận, số liệu giữa báo cáo gửi về và phần mềm phải chuẩn để bộ phận kế hoạch dựa vào đó làm việc; hệ thống phải sử dụng được trong thực tế.
- **Đã xác nhận từ ảnh:** phạm vi không chỉ là bảng màu hay một báo cáo tồn kho; kết quả cần đạt là dữ liệu đủ và đúng phục vụ kế hoạch. Có nút import hoặc parser chạy thành công chưa đủ để kết luận đáp ứng.
- **Chưa được ảnh xác định:** danh sách bộ phận/file/sheet đầy đủ, kỳ cập nhật, thời hạn cập nhật, đơn vị và tiêu chí sai số từng chỉ tiêu. Phải đối chiếu nguồn bàn giao trước, chỉ hỏi lại phần còn thiếu; không yêu cầu khách gửi lại tài liệu đã có.
- Plan trước chỉ đề cập tồn kho riêng, chưa bao phủ yêu cầu này. Bổ sung một nhánh đối soát báo cáo độc lập, ưu tiên rà soát trước khi kết luận hệ thống đáp ứng; không chờ các câu hỏi A/B được giải quyết mới làm rõ phạm vi báo cáo.
- Trạng thái hiện tại: **đã ghi nhận yêu cầu, chưa kiểm chứng đáp ứng end-to-end**. Việc bổ sung plan không phải xác nhận đã nhập đủ dữ liệu, đã khớp DB/UI hay đã triển khai bản production.

#### Nguồn và điều chỉnh nhận định trước

- `tailieubangiao/PROJECT_HANDOVER.md`, `REQUIREMENTS_MASTER.md`, `CONFLICTS_AND_GAPS.md`, `SNY_PLANNER_BLUEPRINT.md.docx` (đường dẫn tính từ thư mục SNY): đã đối chiếu lại nội dung trong lượt lập plan. Blueprint được đọc qua bản trích văn bản.
- `plans/HANDOVER_FORMULA_AUDIT_2026-09-19.md`: đã ghi rõ công thức có trong Excel; không được quay lại kết luận chung “khách chưa cung cấp công thức”.
- `User Raw Documents/Formular.xlsx`, Sheet1!A2:B4: mét/beam, kg/beam, số sợi/beam. Đã đối chiếu lại nội dung ô trích xuất.
- `User Raw Documents/kế hoạch đặt MB 2025.xlsx`: sheet `tính % MB ` và `tính FR` chứa công thức khối lượng, phân bổ màu, loss, MB/FR. Ví dụ bên dưới dựa trên audit nguồn; không coi mọi dòng cùng một công thức.
- Ảnh DESERT SAND A/B người dùng vừa gửi: bằng chứng trực tiếp cho cấu hình ba dàn. Không còn cần hỏi “mỗi bar có một hay nhiều thành phần?” — ảnh đã thể hiện nhiều cột thành phần. Workbook MB và CC2018 đã cho thấy việc phân bổ dùng trọng số/strand của recipe, không chia đều theo số cột.
- `User Raw Documents/EXTRUDER 2024 + extruder 2025 O.xlsx`: các dòng hướng dẫn ghi rõ tỷ lệ màu theo kg nhựa, ví dụ `MÀU *3%` đi cùng `100KG NHỰA =3KG MÀU`; các đơn khác dùng 3,5% hoặc 3,7%. Vì vậy 3% không phải mặc định toàn nhà máy.
- `User Raw Documents/kế hoạch đặt MB 2025.xlsx`, sheet `MB Korea 20.5.2025`: các dòng 86–88 phân bổ 3160-2, 3233-5 và 8005A bằng trọng số recipe, loss và tỷ lệ MB; đây là công thức nhiều màu thực tế, không còn là câu hỏi không có dữ liệu.
- `User Raw Documents/STATISTICAL REPORT 04-2026.xlsx`, `WARPING!G7:L8`, đối chiếu header Work Order trong CC2018: BEAM thứ nhất là loại/spec beam; BEAM thứ hai là kg bì beam; `WEIGHT = QUANTITY × (WEIG − kg bì beam)`.
- Code working tree: `prisma/schema.prisma`, `src/app/api/customers/color-presets/route.ts`, `src/components/orders/MultiLineOrderForm.tsx`. `ColorPreset` chỉ có một color/mbCode/mbSupplier cùng wale/cours/eyelet; chưa biểu diễn được bảng ba dàn nhiều thành phần, A/B, heating.
- Form hiện tự điền `needleCount` từ `preset.wale`, schema/UI gọi trường này là `Số kim`. Có thể dùng nó làm input số kim khi đơn đã có giá trị; phải hiển thị đơn vị kim/inch và cho người dùng kiểm tra. `beamCount` của đơn lại được gọi là `Số dàn`, không tương đương `Số beam sử dụng` trong Formular.
- Tài liệu bàn giao cũ nói không tìm thấy Product Recipe/loss khổ trong CLAUDE/specs; đó là giới hạn nguồn tìm kiếm lúc ấy, không phủ định công thức Excel hay ảnh mới.
- Giới hạn: đã lập chỉ mục toàn bộ 629 sheet của 14 workbook gốc và đọc sâu các vùng liên quan, nhưng không tuyên bố một người đã kiểm chứng thủ công từng ô trong 2.875.311 ô dữ liệu. Chưa xác nhận DB hay bản deploy từ code local. Chi tiết lượt rà lại nằm ở `workflows/context/handover-recheck-2026-09-22.md`.

#### Dữ liệu mẫu đã biết — không hỏi khách gửi lại

Chung A/B: nhãn `325gsm, DESERT SAND#467`; Tape width `2.0mm-440D`; Mono `24-450D`; Course 14; Wale 6; MB Rate 3%; `With heating machine`.

| Dàn / cột từ trái sang phải | Loại sợi / thông số | Màu | Nhà cung cấp | Áp dụng |
|---|---|---|---|---|
| FIRST / 1 | Mono Filament / 24-450D | Beige 3160-2 | MB KOREA | A và B |
| FIRST / 2 | Mono Filament / 24-450D | Beige 3233-5 | MB KOREA | A và B |
| FIRST / 3 | Mono Filament / 24-450D | Snow white 1065 | MB CHAU AU | A và B |
| MIDDLE / 1 | Mono Filament / 24-450D | Beige 3160-2 | MB KOREA | A và B |
| MIDDLE / 2 | Mono Filament / 24-450D | Beige 3233-5 | MB KOREA | A và B |
| BACK / 1 | Tape Filament / 2mm-440D | Light beige 3233-5 | MB KOREA | A và B |
| BACK / 2 | Tape Filament / 2mm-440D | Dark beige 3160-2 | MB KOREA | A |
| BACK / 2 | Tape Filament / 2mm-440D | Beige 8005A | MB ARIRANG | B |

Không chuẩn hóa mất nhãn `Light beige`/`Beige`, không gộp màu trùng mã nhưng khác dàn/nhà cung cấp. Giữ chuỗi `24-450D`, không đoán ý nghĩa số 24.

### File thay đổi

**Trong bước Plan hiện tại:** cập nhật plan và tài liệu context rà nguồn; không sửa source/schema/test.

**File cho phần đã rõ, sau khi duyệt thực hiện:**

- CLEAR-01: hai tài liệu bao phủ/đối soát liệt kê bên dưới; không thay source trong bước khảo sát.
- CLEAR-02: `workflows/context/fixtures/desert-sand-467.json` — tạo fixture local gồm hai cấu hình A/B, dùng interface `ColorRecipeSpec` bên dưới; không customerId/orderId, không suy ra trọng số. Không cần tạo DTO production ở bước này.
- CLEAR-03: `src/lib/calculations/workOrder.ts` — tạo ba hàm thuần cùng input/result types theo hợp đồng bên dưới; `src/lib/calculations/workOrder.test.ts` — tạo test local cho raw value, giá trị làm tròn theo ví dụ nguồn và input lỗi. Không sửa caller hiện có.
- CLEAR-04: `workflows/context/masterbatch-formula-examples.md` — ghi mẫu một màu, phân bổ nhiều màu, tỷ lệ 3%/3,5%/3,7% và FR có/không có hệ số cuối 1,1; mỗi mẫu có file/sheet/ô/công thức/input/kết quả và giới hạn áp dụng. Chỉ ghi số liệu sau khi đọc lại ô nguồn, không dùng audit tóm tắt thay kiểm chứng.
- CLEAR-05: cập nhật plan REPORT-ALL bằng semantic mapping `beamTypeOrSpec`, `beamTareKg`, `quantity`, `grossWeightKg`, `netWeightKg`; trước khi sửa schema phải lập phương án giữ tương thích dữ liệu/API hiện có. Không migration trong lượt này.

**Nhánh REPORT-ALL — đầu ra dự kiến sau khi duyệt bước rà soát:**

- `workflows/context/statistical-report-coverage.md` — bảng bao phủ bộ phận → file/sheet/cột → ý nghĩa/đơn vị/kỳ → parser → dữ liệu lưu → API/UI dùng cho kế hoạch → bằng chứng và phần chưa kiểm tra.
- `workflows/reports/statistical-report-reconciliation.md` — kết quả đối soát từng nguồn/kỳ, chi tiết chênh lệch, nguyên nhân, trạng thái và bằng chứng kiểm tra. Không tạo báo cáo PASS khi chưa chạy đối soát.
- File source cần sửa chỉ được chốt sau khi tìm ra gap và cập nhật plan chi tiết. Không mặc định phải viết lại toàn bộ parser hoặc thêm module mới.

**GHI CHÚ CHƯA CHẮC — các file tích hợp dưới đây không thuộc phạm vi thực hiện đã rõ:**

Lưu/chọn cấu hình phụ thuộc Q1–Q3. Danh sách sau chỉ giữ hướng dự kiến để không mất ngữ cảnh; không được triển khai khi duyệt riêng CLEAR-01–05:

- `prisma/schema.prisma` — bổ sung cấu hình, phiên bản và liên kết dòng đơn; tên model dự kiến `ProductColorRecipe`, `ProductColorRecipeVersion`. Chưa chốt khóa unique/ownership trước Q1.
- Migration mới theo convention repo — chỉ thêm dữ liệu/cột nullable, không migrate hay backfill DB thật trong bước lập plan.
- `src/types/productColorRecipe.ts` — tạo DTO cho bảng ba dàn, tách tên hiển thị và nguồn thông số.
- `src/lib/validations/productColorRecipe.ts` — tạo validator dùng chung UI/API; không thêm rule tỷ lệ khối lượng khi chưa biết cơ sở tính.
- `src/app/api/color-recipes/route.ts`, `src/app/api/color-recipes/[id]/route.ts` — API danh sách/chi tiết/tạo phiên bản, hợp đồng request/response cần chốt sau Q1–Q3; không xóa cứng phiên bản đã dùng.
- `src/components/orders/ColorRecipeSelector.tsx`, `src/components/orders/ColorRecipeTable.tsx` — tạo bộ chọn và bảng chi tiết giữ đúng thứ tự 3/2/2 thành phần của ví dụ.
- `src/components/orders/MultiLineOrderForm.tsx`, `src/components/orders/OrderDetail.tsx` — chọn/xem cấu hình theo từng dòng đơn, không thay ô `mbCode` đơn thành chuỗi ghép nhiều mã.
- Các route tạo/sửa đơn hiện có (`src/app/api/orders/route.ts`, `multi-line/route.ts`, `[id]/route.ts`) và validation/types liên quan — bổ sung liên kết phiên bản nếu Q3 được duyệt. Trước triển khai phải ghi đầy đủ field/payload và hành vi PATCH trong bản plan cập nhật.
- `src/lib/validations/productColorRecipe.test.ts` — test fixture A/B, bảo toàn thứ tự và nhãn; giữ local theo yêu cầu không push test mới.
- `docs/customer-requirement-gaps.md`, `workflows/context/business-logic-open-questions.md` — sau khi duyệt, cập nhật câu hỏi đã được ảnh giải đáp; không tiếp tục yêu cầu gửi lại bảng mẫu.

**GHI CHÚ CHƯA CHẮC — tích hợp công thức:**

- Work Order: phần hàm tính, mapping nghiệp vụ và làm tròn theo ví dụ đã thuộc CLEAR-03. UI phải thêm input riêng `fabricWidths` và `beamCountUsed`; không map ngầm `ProductionOrder.beamCount` vì field đó là Số dàn.
- MB: dự kiến tạo `src/lib/calculations/masterbatchDemand.ts` và `masterbatchDemand.test.ts`; interface nhận recipe weights, planned product kg, loss factor và `mbRatePct` tường minh. Chỉ quyết định tự động chọn hệ số tổng quát còn chờ Q3; calculator không tự chọn.
- Giai đoạn cấu hình màu không sửa parser tồn kho. Tồn kho riêng được đưa vào nhánh REPORT-ALL để xác định đúng file/sheet khách dùng; mọi thay đổi parser phát sinh phải có đặc tả và duyệt riêng trước Implement.

### Các bước (theo đúng thứ tự thực hiện, không theo mục tiêu trừu tượng)

**Nhánh REPORT-ALL bổ sung — thực hiện rà soát trước, không phụ thuộc Q1–Q3:**

1. Kiểm kê nguồn bàn giao và các yêu cầu chat đã có; lập danh sách bộ phận, workbook, sheet, kỳ báo cáo và người cung cấp. Bắt đầu từ Extruder/kéo sợi, Warping, Knitting/dệt, Rolling/cuộn, Packing/đóng gói và nguyên liệu/tồn kho; đây là danh sách khởi đầu theo các luồng đã biết, **không tự coi là toàn bộ bộ phận**. Sheet chưa hiểu hoặc chưa hỗ trợ phải có dòng riêng trong bảng bao phủ.
2. Với từng chỉ tiêu, xác định cột/ô nguồn, đơn vị, ngày/ca/máy/đơn hoặc mã vật tư, cách cộng dồn và loại bỏ subtotal/TOTAL. Ghi rõ chỉ tiêu nhập trực tiếp hay tính lại. Không cộng lẫn kg, mét, cuộn. SMALL/BIG được giữ nguyên nhãn nguồn; Warping dùng semantic đã xác định cho hai cột BEAM, không tiếp tục gọi cả hai là count.
3. Lần theo dữ liệu từ file → preview → confirm → bản ghi lưu → API → màn hình mà planner dùng. Ghi tách trạng thái “có code”, “đã test local”, “đã đối soát môi trường được phép”, “đã nghiệm thu”; không dùng trạng thái này thay cho trạng thái khác.
4. Sau khi có môi trường test được cho phép, đối soát toàn bộ dòng/chỉ tiêu trong bộ dữ liệu nghiệm thu đã thống nhất: số dòng nguồn hợp lệ, được nhận, bị loại kèm lý do; giá trị chi tiết và tổng theo đúng chiều ngày/ca/máy/đơn/vật tư. Truy được chênh lệch tới file/sheet/dòng/cột và bản ghi đích. Chưa có môi trường thì ghi chưa kiểm chứng, không ghi PASS.
5. Kiểm tra báo cáo nhiều ngày, import lặp, file đổi tên, báo cáo sửa số liệu cùng kỳ, thiếu ngày, dòng không match đơn, dòng tổng xen dữ liệu và định dạng số/ngày. Ghi hành vi thực tế; quy tắc sửa kỳ/ghi đè theo từng loại báo cáo phải được xác nhận, không áp rule tồn kho cho mọi bộ phận.
6. Lập danh sách gap theo mức ảnh hưởng đến số liệu kế hoạch. Với mỗi gap, cập nhật file/hàm/interface, điều kiện xử lý và fixture kiểm thử trong plan trước khi xin duyệt sửa code. Rà lại nguồn trước khi kết luận thiếu tài liệu.
7. Nghiệm thu với bộ phận kế hoạch: dùng một kỳ báo cáo thống nhất, xem số liệu cần thiết trên hệ thống, truy lại nguồn và xác nhận đủ để thực hiện công việc kế hoạch. Danh sách bộ phận, chỉ tiêu, mức làm tròn, kỳ cập nhật và người xác nhận phải được chốt; không tự hứa thời hạn hay tự quy định sai số.

**Nhánh đã rõ CLEAR-02–05 — thực hiện sau duyệt, không chờ Q1–Q3:**

1. CLEAR-02: tạo fixture A/B từ bảng nguồn trong plan; ghi `sourceNote` chỉ tới ảnh khách đã cung cấp, soát đủ 7 thành phần mỗi cấu hình. So sánh hai cấu hình để xác nhận chỉ nhãn variant và màu/nhà cung cấp BACK/2 khác nhau.
2. CLEAR-03: tạo types, validator input nội bộ rồi ba hàm tính thuần theo thứ tự mét/beam → kg/beam → số sợi/beam. Trả cả raw và giá trị vận hành: mét/sợi làm tròn số nguyên gần nhất, kg làm tròn 2 chữ số theo ví dụ. Không import Prisma, đọc env hay gọi mạng. Không sửa công thức PO hiện có.
3. CLEAR-03: thêm test các ví dụ Formular/Extruder và input lỗi; kiểm tra raw với sai số số học tối đa `1e-9`, đồng thời khóa 8.482,142… → 8.482 m, 141,732… → 142 sợi và 124,606… → 125 sợi. Đây là làm tròn kết quả hiển thị/vận hành theo ví dụ; raw value vẫn được giữ để đối soát.
4. CLEAR-04: mở lại từng ô nguồn mẫu MB/FR, ghi bảng đối chiếu có provenance; mẫu chưa đọc đủ đánh dấu NOT_VERIFIED, không suy công thức từ cache hoặc tên sheet.
5. CLEAR-05: lập mapping đổi tên Warping, fixture theo `WARPING!G7:L8`, kiểm tra net kg = quantity × (gross − tare) và bảo toàn dữ liệu/API cũ trước migration.
6. Review phần đã thực hiện theo AGENTS.md, ghi rõ phạm vi local độc lập; không báo đã hoàn thành toàn bộ tính năng màu/Work Order/MB hoặc báo cáo tất cả bộ phận.

**Ghi chú chưa chắc — Q1–Q3 và các bước tương lai, KHÔNG phải công việc được phép triển khai khi duyệt phần đã rõ:**

1. **Chốt nguồn và phạm vi:** dùng bảng mẫu trên làm fixture; ghi rõ công thức đã có nhưng chưa được số hóa đủ. Không coi thông báo “đã fix” trong chat là bằng chứng bản đang deploy đã đúng.
2. **Duyệt các quyết định còn thiếu:**
   - **Q1 — Nơi quản lý:** cấu hình theo khách hàng + mã sản phẩm, dùng chung toàn nhà máy, hay nhập riêng từng dòng đơn? Ảnh không có thông tin xác định khách hàng. Không gán DESERT SAND cho một khách tùy đoán.
   - **Q2 — Chọn A/B:** đề xuất planner chọn rõ A hoặc B, không tự chọn theo GSM/màu hay tồn kho. Khách có yêu cầu chọn tự động không? Nếu có phải nêu điều kiện.
   - **Q3 — Lịch sử và bảng chọn hệ số:** đề xuất đơn giữ snapshot/phiên bản recipe đã chọn; chỉnh recipe tạo phiên bản mới. Workbook cung cấp hệ số theo từng dòng nhưng chưa có decision table tổng quát cho loss 1,05/1,1/1,2 và phụ trội 1,1. Giai đoạn đầu lưu hệ số tường minh trên từng recipe/lệnh, không tự chọn. Chỉ cần xác nhận nếu muốn hệ thống tự chọn hệ số hoặc cho phép sửa lan sang đơn cũ.
3. **Cập nhật và duyệt plan chi tiết giai đoạn 1:** chốt model/unique/version, null-vs-omitted của PATCH, API status/error, vị trí UI quản lý cấu hình, tất cả đường tạo/sửa đơn và kiểm thử transaction. Nếu chưa chốt thì dừng, không để người Implement thiết kế thay.
4. **Implement giai đoạn 1 sau duyệt:** schema nullable → DTO/validation → API → bảng cấu hình/bộ chọn → liên kết dòng đơn → fixture/test. Không auto-seed A/B vào DB thật. Bản mẫu chỉ dùng local/test cho tới khi xác nhận ownership.
5. **Nghiệm thu cấu hình:** chọn A/B, reload, mở lại đơn cũ sau khi tạo phiên bản mới; đối chiếu toàn bộ 7 thành phần, không chỉ màu cuối Back Bar. Chạy hồi quy nhập tay/Excel để tránh làm mất needleCount/beamCount và các trường đã có.
6. **Tích hợp calculator Work Order:** triển khai đúng ba công thức đã có nguồn; lấy width và số kim từ đơn khi có, nhập/giữ riêng số khổ dệt, số beam sử dụng và denier; không dùng `ProductionOrder.beamCount` (Số dàn) hay hai cột BEAM Warping làm input thay thế. Review và nghiệm thu riêng.
7. **Tích hợp nhu cầu MB:** đối chiếu ít nhất mẫu một màu, nhiều màu, tỷ lệ 3%/3,5%/3,7%, hệ số loss khác nhau và FR không có hệ số cuối 1,1. Hệ số được truyền từ recipe/lệnh, không tự suy. Chỉ hiển thị nhu cầu khi đủ input; chưa tạo mua hàng/trừ tồn kho tự động.
8. **Review → Fix → Report:** theo AGENTS.md, cùng slug; chỉ báo hoàn thành phạm vi đã duyệt khi có bằng chứng test/UI. Dừng sau Plan hiện tại, không tiến sang bước 4 tự động.

### Signature / Interface

Đầu ra tài liệu REPORT-ALL (không phải API mới):

- Bảng bao phủ có các cột: `requirementId`, `department`, `sourceFile`, `sheet`, `sourceRange`, `metric`, `unit`, `periodAndDimensions`, `businessMeaning`, `parserPath`, `storageTarget`, `consumerPath`, `evidence`, `verificationStatus`, `openQuestion`.
- Bảng đối soát có các cột: `requirementId`, `sourceFile`, `sheet`, `sourceRowOrCell`, `periodAndDimensions`, `metric`, `sourceValue`, `storedValue`, `displayedValue`, `unit`, `difference`, `roundingRule`, `status`, `reason`, `evidence`.
- `verificationStatus`: `NOT_READ`, `READ_NOT_MAPPED`, `MAPPED_NOT_VERIFIED`, `VERIFIED`, `BLOCKED`; `status` đối soát: `MATCH`, `MISMATCH`, `NOT_VERIFIED`. Thiếu dữ liệu đích là `NOT_VERIFIED` hoặc `MISMATCH` tùy bằng chứng, không tự đổi thành 0. Không đặt ngưỡng sai số mặc định để biến chênh lệch thành MATCH.

Đề xuất để duyệt, chưa phải hợp đồng code cuối cùng:

Đoạn DTO cấu hình sau chỉ dùng mô tả fixture CLEAR-02 ở phạm vi đã rõ. Tạo module production/validator/UI/API vẫn thuộc ghi chú chờ xác minh, không thuộc CLEAR-02.

- `BarPosition = 'FIRST' | 'MIDDLE' | 'BACK'` trong `src/types/productColorRecipe.ts`.
- `ColorRecipeComponent`: `bar: BarPosition`, `position: number` (thứ tự 1-based trong dàn), `filamentType: 'MONO' | 'TAPE'`, `yarnSpecText: string`, `colorText: string`, `supplierText: string`. Không có `weightShare` mặc định.
- `ColorRecipeSpec`: `label: string`, `variant: string`, `gsm: number`, `tapeWidthText: string`, `monoSpecText: string`, `course: number`, `wale: number`, `mbRatePct: number`, `heating: boolean`, `components: ColorRecipeComponent[]`, `sourceNote: string`. Đây là dữ liệu kỹ thuật của cấu hình, không ghi đè `gsm`/`productionGsm` của đơn.
- Đề xuất `validateColorRecipeSpec(input: unknown)` trong `src/lib/validations/productColorRecipe.ts`, đặt schema trước hàm export. Kết quả phân biệt `{ success: true, data: ColorRecipeSpec }` và `{ success: false, issues: Array<{ path: string, message: string }> }`. Ownership/ID/version nằm ngoài spec, chốt theo Q1–Q3.
- Công thức Work Order, đặt trong `src/lib/calculations/workOrder.ts` sau khai báo input/result types, theo thứ tự:
  1. `calculateMetersPerBeam({ kg, strands, denier })` → `kg * 9000000 / strands / denier`.
  2. `calculateKgPerBeam({ meters, strands, denier })` → `meters * strands * denier / 9000000`.
  3. `calculateStrandsPerBeam({ widthCm, needleLossFactor, needlesPerInch, fabricWidths, beamCount })` → `widthCm * needleLossFactor * needlesPerInch * fabricWidths / 2.54 / beamCount`.
- **Hợp đồng kỹ thuật CLEAR-03, đề xuất duyệt:** export `MetersPerBeamInput = { kg: number; strands: number; denier: number }`, `KgPerBeamInput = { meters: number; strands: number; denier: number }`, `StrandsPerBeamInput = { widthCm: number; needleLossFactor: number; needlesPerInch: number; fabricWidths: number; beamCount: number }` và `WorkOrderCalculationResult = { ok: true; rawValue: number; operationalValue: number } | { ok: false; field: string; message: string }` trước ba hàm export trong `workOrder.ts`. Mỗi hàm nhận type tương ứng, trả `WorkOrderCalculationResult`.
- Tất cả input phải là number hữu hạn và > 0; kiểm tra theo thứ tự field được liệt kê trong type, trả lỗi đầu tiên với message `Giá trị phải là số hữu hạn lớn hơn 0`. Không tự chuyển chuỗi/null thành số. Kiểm tra này là hàng rào kỹ thuật của calculator, không xác nhận khoảng input vận hành hay quy tắc số nguyên của nhà máy.
- `needleLossFactor` là hệ số tường minh (1,05), không phải phần trăm (5); không đặt default 1,05, không suy ra từ loss trọng lượng sợi. Giữ nguyên thứ tự phép toán đã ghi. Output không hữu hạn hoặc <= 0 do tràn/underflow → `{ ok: false, field: 'result', message: 'Kết quả ngoài phạm vi tính toán' }`.
- Giữ `rawValue`; `operationalValue` làm tròn số nguyên gần nhất cho mét/sợi và 2 chữ số cho kg theo ba ví dụ nguồn. Vì mọi input hợp lệ đều dương, quy tắc `.5` dùng half-up. Không dùng `operationalValue` để sửa ngược input.
- **Chưa chốt:** khóa cấu hình, persistence/API/UI quản lý phiên bản, hành vi thay khách hàng khi đã chọn cấu hình, mapping nhập Excel cấu hình, API/DTO tính MB. Những mục này chặn triển khai phần tương ứng, không được tự mặc định.

### Edge case & hành vi

- REPORT-ALL: sheet/bộ phận chưa được hỗ trợ → ghi rõ chưa bao phủ; không âm thầm bỏ rồi tuyên bố “tất cả”.
- REPORT-ALL: không link được đơn → giữ dấu vết nguồn và đánh dấu chưa liên kết; không mặc định gán đơn khác hoặc dùng 0 để biểu diễn dữ liệu chưa biết.
- REPORT-ALL: tổng khớp nhưng dòng chi tiết sai → vẫn không đạt; tổng đúng có thể che hai sai lệch bù nhau.
- REPORT-ALL: chưa rõ ý nghĩa cột/đơn vị hoặc quy tắc làm tròn → ghi BLOCKED ở chỉ tiêu liên quan, tiếp tục kiểm tra phần còn lại, không tự suy diễn.
- Cùng DESERT SAND#467/325gsm có A và B → hiển thị cả hai, không deduplicate chỉ theo màu/GSM; không tự chọn A đầu danh sách.
- Một màu/mã xuất hiện ở nhiều dàn → giữ nhiều thành phần và đúng nhà cung cấp, không gộp theo mã MB.
- Đơn cũ chưa có recipe → hiển thị “Chưa chọn cấu hình”; giữ nguyên nghiệp vụ duyệt và nhập Excel hiện có theo đề xuất Q3.
- Thiếu trọng số recipe hoặc `mbRatePct` → hiện “Chưa đủ dữ liệu tính MB”, không coi mỗi cột bằng nhau và không trả 0 kg. `3%` nghĩa là 3 kg màu/100 kg nhựa ở lệnh ghi 3%; không tự áp cho lệnh 3,5%/3,7%.
- Chuỗi `24-450D` → giữ nguyên; không diễn giải 24 là số sợi hay số kim.
- Wale/Course/needleCount/beamCount → giữ riêng; không gán Course 14 thành beamCount 14 chỉ vì trùng ví dụ Formular.
- Heating → lưu/xem/in như chỉ dẫn sản xuất và yêu cầu chất lượng; không thay đổi phép tính vì toàn bộ nguồn đã rà không có công thức dùng cờ này.
- Đổi khách hàng/cấu hình trên đơn đã sản xuất → phải chốt quy tắc ở Q1–Q3 trước khi mở khả năng sửa; không tự lan truyền sang assignment/sản lượng/vật tư.
- Hệ số MB/FR khác nhau giữa các dòng Excel → không áp dụng 1,1 cho toàn bộ đơn chỉ vì mẫu đầu có 1,1.

### Không được làm

- Không sửa code ở lượt lập plan; không migration/seed/backfill, kết nối ghi DB, commit/stage/push.
- Không thay công thức PO: `qtySqm = widthM * totalMeters`, `totalWeightKgs = qtySqm * gsm / 1000`.
- Không thay công thức sợi hiện có: `requiredYarnKg = qtySqm * (productionGsm ?? gsm) / 1000 * 1.05` bằng loss trên kim hoặc loss MB.
- Không dùng `WarpingDailyOutput.beamCount1/beamCount2` làm input Work Order. Bằng chứng nguồn đã xác định chúng lần lượt là loại/spec beam và kg bì beam, không phải hai beam count.
- Không xây AI tự suy màu, tự chọn thay thế nhà cung cấp, tự đặt hàng/trừ tồn, auth hay scheduler trong task này.
- Không diễn giải “ảnh có 3 dàn” thành beamCount=3; đây là hai khái niệm chưa được chứng minh tương đương.
- Không sửa/ghi đè những thay đổi đang có trong working tree. Không sửa ignore để đưa workflows/AGENTS/test mới vào Git; kiểm tra lại tracked/untracked trước mọi thao tác Git tương lai.

### Cách kiểm tra xong

**Plan hiện tại:** tách CLEAR-01–05 khỏi ghi chú Q1–Q3; chỉ tài liệu context/plan được cập nhật. Sau duyệt mới thực hiện phần độc lập đã mô tả, không tự mở rộng sang schema/API/UI hay quy tắc còn chưa chắc.

**Nghiệm thu phần đã rõ:**

- CLEAR-01: mỗi nguồn đã kiểm tra có mapping và bằng chứng; nguồn chưa kiểm tra ghi đúng trạng thái. Hoàn thành bảng rà soát không đồng nghĩa đã nghiệm thu REPORT-ALL end-to-end.
- CLEAR-02: fixture có hai variant, mỗi variant có 3/2/2 thành phần đúng bảng ảnh; không thêm giả định ownership, tỷ lệ phân bổ hoặc tiêu chí tự chọn.
- CLEAR-03: ba hàm đạt raw và operational value của các ví dụ bên dưới, cùng test invalid input/overflow. Chạy `node --import tsx --test src/lib/calculations/workOrder.test.ts` khi thực hiện; không kết nối DB. UI/persistence chưa nằm trong nghiệm thu này.
- CLEAR-04: mỗi mẫu có ô nguồn cụ thể và phép tính kiểm tra được; khác biệt giữa mẫu được giữ nguyên, không nâng công thức một dòng thành quy tắc chung.

**REPORT-ALL — tiêu chí nghiệm thu đề xuất để chốt với bộ phận kế hoạch:**

- Danh sách tất cả bộ phận/báo cáo cần dùng được xác nhận; mỗi mục có mapping và trạng thái, không có sheet bị bỏ qua mà không giải thích.
- Với bộ dữ liệu/kỳ nghiệm thu đã chốt, chi tiết và tổng trên nguồn → DB → UI khớp theo đơn vị và quy tắc làm tròn được duyệt; không còn chênh lệch chưa giải thích. Test/build pass không thay thế bước đối soát này.
- Mọi dòng nguồn được giải trình: đã nhận, bỏ có lý do, không hợp lệ hoặc chưa liên kết; không mất dòng âm thầm, không nhân đôi do import lại.
- Planner xem được chỉ tiêu cần dùng, kỳ dữ liệu và các phần thiếu/chưa liên kết; kiểm tra được ít nhất một tình huống lập kế hoạch thực tế được họ lựa chọn, không chỉ xem màn hình demo.
- Báo cáo nghiệm thu chỉ rõ file/kỳ, phiên bản code, môi trường, kết quả chi tiết, giới hạn, người xác nhận. Phần chưa truy cập hoặc chưa kiểm tra phải để NOT_VERIFIED, không tuyên bố hoàn thành chung.

**Giai đoạn 1 sau duyệt:**

- A → FIRST 3 thành phần, MIDDLE 2, BACK 2; BACK/2 = Dark beige 3160-2 / MB KOREA.
- B → giữ nguyên các thông số khác; BACK/2 = Beige 8005A / MB ARIRANG.
- Reload không mất dữ liệu; chọn A không bị đổi thành B vì cùng màu/GSM; phiên bản mới không làm thay đổi thông số đơn cũ (nếu duyệt Q3).
- Đơn không chọn recipe vẫn nhập tay/import/sửa số lượng như trước; recipe không ghi đè tổng trọng lượng PO hoặc nhu cầu sợi hiện hành.
- Thiếu mapping/tỷ lệ → không sinh lượng MB, không có giao dịch tồn kho tự động.

**Calculator CLEAR-03:**

- 38 kg, 144 sợi, 280D → raw 8482,142857… và operational 8.482 mét/beam.
- 8500 m, 144 sợi, 280D → 38,08 kg/beam.
- 300 cm, factor 1,05, 8 kim/inch, 2 khổ dệt, 14 beam → raw 141,732283… và operational 142 sợi.
- 200 cm, factor 1,055, 8 kim/inch, 3 khổ dệt, 16 beam → raw 124,606299… và operational 125 sợi.
- Denier/beamCount bằng 0, input âm, NaN/Infinity hoặc thiếu → lỗi đúng field, không lưu kết quả sai.

**MB CLEAR-04:** mẫu `tính % MB !G5` = 10425,998 kg; I5 = 10947,2979 kg; với L5 = 0,8 và hệ số cuối 1,1 thì M5 = 96,33622152 kg. Bổ sung fixture phân bổ ba màu từ `MB Korea 20.5.2025!D86:D88`, các tỷ lệ 3%/3,5%/3,7% và dòng FR không nhân hệ số cuối. Mỗi hệ số phải là input có provenance, không là mặc định chung.

Khi thực sự triển khai: chạy unit test cục bộ, `npm run build`, kiểm tra API/UI trên DB test được cho phép; không dùng DB production để thử. Báo cáo tách rõ kết quả local, môi trường UAT và deploy; giữ test mới local theo yêu cầu hiện tại của người dùng.
