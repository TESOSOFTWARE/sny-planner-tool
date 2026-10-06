# Plan — Hoàn thiện yêu cầu khách trong chat và đối soát bàn giao

Ngày: 22/09/2026. Slug duy nhất: `current-customer-requests`.
Trạng thái: **PLAN — chờ duyệt, chưa Implement**.

Plan này thay thế thứ tự triển khai và phạm vi CLEAR/Q của `product-color-recipe-plan.md`. Plan cũ giữ làm lịch sử và nguồn bảng mẫu, không dùng làm lệnh triển khai song song.

### Mục tiêu

Hoàn thiện các yêu cầu import đơn, nhận diện khách, sửa số cuộn và lưu cấu hình màu A/B trong chat; kiểm chứng báo cáo các bộ phận từ Excel đến DB và màn hình, với từng yêu cầu có kết quả và bằng chứng riêng.

#### Căn cứ và mức độ đã xác minh

- Nguồn yêu cầu: các ảnh chat người dùng cung cấp; đặc biệt ảnh Hongloan ngày 16/09/2026 yêu cầu số liệu báo cáo chính xác để làm kế hoạch.
- Nguồn bàn giao: `../tailieubangiao/{PROJECT_HANDOVER,REQUIREMENTS_MASTER,CONFLICTS_AND_GAPS}.md`; các spec trong `docs/specs/`; Office/Excel trong `../User Raw Documents/` và `../Sofware Develoment/`. Các đường dẫn `../` trong plan tính từ root repo.
- Đọc cùng `workflows/context/handover-01-product-requirements.md`, `handover-02-formulas-recipes.md`, `handover-03-reports-data.md` để biết nguồn ô/formula và giới hạn suy luận.
- Working tree đã có bản sửa import, validation, số cuộn, tồn kho và Packing. Không viết lại những bản sửa này chỉ vì chưa commit.
- Lượt kiểm tra trước trong hội thoại: 46/46 test local đạt, type-check và build đạt. Đây là baseline của working tree lúc kiểm tra; chưa có UAT/DB migration/backfill/deploy được xác nhận.
- Đọc lại source trong lượt Plan: Rolling confirm chỉ `createMany` theo batch, không upsert và không bọc toàn bộ import trong một transaction. Vì thế ghi chú trước rằng Rolling đã xử lý import lại đầy đủ là sai; nguy cơ nhân đôi là gap kỹ thuật cần xử lý, không phải lý do hỏi khách lại toàn bộ chính sách import.
- HDPE đã có parser chọn block. Nhận định “4 sheet chưa migrate” là trạng thái bàn giao lịch sử; hiện phải tách **parser có hỗ trợ hay chưa** và **DB đã nhập dữ liệu hay chưa**. Ba tên `HDPE KO SỬ DỤNG`, `CHI TAPE HONSIN 2022`, `CHI TAPE TRAN KHANG` chưa được `groupSheetMatches` hỗ trợ trực tiếp; chưa được kết luận cả bốn đều chưa có code.
- Không tìm thấy file `../.tessl/RULES.md` được chỉ dẫn tham chiếu. Áp dụng `AGENTS.md` thực tế trong repo, bao gồm mục mới “Cách test như thế nào là chuẩn”.

#### Phạm vi và thứ tự

| ID | Yêu cầu | Công việc hiện tại | Điều kiện hoàn thành |
|---|---|---|---|
| CHAT-01 | Không mất dòng khi thiếu/trùng NO | Review bản sửa; bổ sung cảnh báo NO tự sinh; kiểm thử 30 dòng và import lại | Mỗi dòng có kết quả, không mất âm thầm |
| CHAT-02 | Khách cũ không bị KH MỚI; sửa liên kết đơn cũ | Ghép duy nhất theo tên chuẩn hóa; backfill có dry-run | Đơn mới nối đúng; đơn cũ có báo cáo trước/sau trên DB được phép |
| CHAT-03 | Excel đủ thông tin như New Order | Kiểm tra template → parser → preview → confirm → detail; sửa sai lệch có bằng chứng | Các field được đối chiếu round-trip, gồm kim/dàn |
| CHAT-04 | Thiếu trường phải báo từng dòng, vẫn nhập dòng hợp lệ | Review validation, số đếm preview/confirm và thông báo kết quả | Số nhận/trùng/xung đột/lỗi cộng đúng tổng |
| CHAT-05 | Sửa số cuộn của đơn nháp | Giữ bản sửa qty; kiểm thử form → PATCH → reload → tổng mét/kg | Đơn rolls/pieces sửa và lưu được, không tái dùng tổng mét cũ |
| CHAT-06 | Màu theo cấu hình A/B | Thêm lưu/chọn thủ công và hiển thị recipe nhiều dàn theo thiết kế dưới đây | 7 thành phần/variant giữ đúng sau reload, có snapshot theo dòng đơn |
| CHAT-07 | Báo cáo tồn kho riêng | Review bản sửa snapshot; đối chiếu file/block và migration trên DB test | Không nhân đôi movement, LAST STOCK và dữ liệu nguồn truy vết được |
| CHAT-08 | Báo cáo tất cả bộ phận chuẩn để lập kế hoạch | Lập mapping toàn bộ nguồn; đối soát chi tiết/tổng; đặc tả và sửa gap thực tế | Không còn sheet nguồn bị bỏ không giải thích; kết quả DB/UI có bằng chứng |

Thứ tự: **kiểm tra baseline → hoàn thiện CHAT-01..05 → đối soát CHAT-07..08 và chốt gap → CHAT-06 → sửa gap báo cáo theo phụ lục đã chốt → review/UAT**. Đối soát báo cáo không chờ feature màu.

Work Order calculator, tự tính MB/FR, tự chọn A/B, tự chọn loss, mua hàng và tự trừ kho nằm ngoài đợt này. Công thức nguồn vẫn được giữ trong context; “chưa implement” không tự biến thành “phải implement ngay”.

### File thay đổi

Trong lượt Plan: tạo file này; thêm liên kết ở `workflows/context/README.md`; đánh dấu plan cũ đã được thay thế; đính chính ghi chú scope trong `workflows/context/business-logic-open-questions.md`.

Sau khi duyệt, phạm vi file như sau. Danh sách review không đồng nghĩa tất cả file sẽ phải sửa.

**A. Đơn hàng và khách hàng**

- `src/lib/excel/parseOrderList.ts` — sửa khóa PI dùng khi sinh NO để chuẩn hóa nhất quán; giữ hàm phân loại hiện tại.
- `src/app/api/orders/import/route.ts` — thêm cảnh báo NO tự sinh/trùng, giữ toàn bộ dòng preview.
- `src/components/orders/ImportOrdersModal.tsx` — sửa số lượng dự kiến nhập theo `decision.status`; hiện số từng nhóm và lý do server trả về sau confirm.
- `src/lib/customers/matching.ts` — tạo hàm ghép tên thuần, dùng chung importer và backfill.
- `src/app/api/orders/import/confirm/route.ts` — dùng ghép tên duy nhất trong transaction hiện có; không tạo khách từ dòng không được nhận.
- `scripts/seed-customers.ts` — dùng matching chung, loại bỏ `findFirst` chọn tùy ý, báo cáo ambiguous/unmatched; cập nhật theo ID đơn chưa liên kết.
- `src/app/api/orders/template/route.ts`, `src/lib/validations/order.ts`, `src/app/api/orders/[id]/route.ts`, `src/components/orders/OrderDetail.tsx`, `src/lib/calculations/orderWeight.ts` — review và kiểm thử bản sửa hiện có; chỉ sửa nếu assertion của CHAT-03..05 chứng minh lỗi, mô tả cách sửa trong phụ lục plan trước khi làm.
- `src/lib/excel/parseOrderList.test.ts`, `src/lib/validations/orderImport.test.ts`, `src/app/api/orders/template/route.test.ts`, `src/lib/calculations/orderWeight.test.ts` — bổ sung hồi quy hành vi.
- `tests/current-customer-requests/customer-matching.test.ts`, `orders.integration.test.ts` — tạo test matching và API/DB test.

**B. Recipe A/B**

- `prisma/schema.prisma` — thêm model `ProductColorRecipe`; thêm `ProductionOrder.colorRecipeSnapshot Json?`, không thay `ColorPreset`.
- `prisma/sql/20260922_product_color_recipes.sql` — tạo SQL additive, transaction, kiểm tra schema trước/sau; không drop/reset dữ liệu.
- `src/types/productColorRecipe.ts` — tạo DTO recipe và snapshot.
- `src/lib/validations/productColorRecipe.ts` — tạo validator và schema request.
- `src/app/api/color-recipes/route.ts` — tạo GET/POST danh mục phiên bản bất biến.
- `src/app/api/orders/[id]/color-recipe/route.ts` — tạo PUT gắn snapshot vào một dòng đơn.
- `src/components/orders/ColorRecipePanel.tsx` — tạo panel xem/chọn/tạo phiên bản, dùng trên chi tiết đơn.
- `src/components/orders/OrderDetail.tsx`, `src/types/index.ts` — tích hợp panel và trường snapshot nullable; các đơn hiện có không cần backfill recipe.
- `tests/current-customer-requests/fixtures/desert-sand-467.json` — fixture A/B từ ảnh, không tự seed DB thật.
- `tests/current-customer-requests/colorRecipe.test.ts`, `colorRecipe.integration.test.ts` — kiểm tra cấu trúc, lưu snapshot, stale update và lịch sử bất biến.

**C. Báo cáo và dữ liệu**

- `workflows/context/statistical-report-coverage.md` — tạo ma trận bao phủ tới file/sheet/chỉ tiêu.
- `workflows/context/statistical-report-reconciliation.md` — tạo kết quả source/parser/DB/UI, không ghi PASS cho bước chưa chạy.
- `tests/current-customer-requests/report-reconciliation.test.ts` — bộ đối chiếu parser với giá trị kỳ vọng được đọc độc lập từ nguồn.
- `tests/current-customer-requests/materials.integration.test.ts`, `packing.integration.test.ts`, `rolling.integration.test.ts` — kiểm thử transaction/import lặp/sửa cùng kỳ trong DB test.
- Review `src/lib/excel/parseMaterialReport.ts`, các route `src/app/api/materials/import-transactions/`, các route sửa vật tư/giao dịch, `prisma/sql/20260919_material_report_snapshots.sql` và modal HDPE/MB/Korea.
- Review toàn tuyến parser/API/UI Extruder, Warping, Knitting tổng và chi tiết, Rolling, Packing; ghi đường dẫn thực tế vào ma trận coverage.
- Sửa parser thiếu sheet, thay đổi định danh Rolling hoặc cách phân bổ tiến độ chỉ sau bước C xác lập mapping/khóa/phạm vi thay thế và bổ sung **file/hàm/interface/edge case** vào chính plan này. Chưa đủ căn cứ để chốt schema chung cho tồn chỉ tape hoặc tự xóa toàn bộ Rolling theo ngày.

**D. Hồ sơ PIRF cùng slug**

- `workflows/impl/current-customer-requests-impl.md` — ghi các bước triển khai thực sự hoàn thành và baseline patch có sẵn.
- `workflows/review/current-customer-requests-review.md` — append findings C/W/N theo mẫu AGENTS, không ghi đè lần review cũ.
- `workflows/fix/current-customer-requests-fix.md` hoặc `workflows/fix-hard/current-customer-requests-fix-hard.md` — theo mức finding.
- `workflows/reports/current-customer-requests-report.md` — chỉ chốt phạm vi đạt, kèm phần chưa UAT/deploy.

### Các bước (theo đúng thứ tự thực hiện, không theo mục tiêu trừu tượng)

1. Ghi HEAD, `git status`, danh sách patch/schema đang có vào impl; đối chiếu với baseline 46 test và build đã ghi. Không reset, overwrite hay tách mất thay đổi người dùng.
2. Lập bảng CHAT-01..08 → nguồn yêu cầu → file/hàm → test → trạng thái local/DB/UI/deploy. Đọc lại source sát phạm vi trước khi chỉnh, vì worktree có thể thay đổi sau Plan.
3. Kiểm tra API import trên DB test: 30 dòng hợp lệ, NO trống xen NO tường minh, cùng PI khác hoa thường, duplicate giống/khác nội dung, PI đã có trong DB. Dùng kết quả để khóa regression trước bản sửa A.
4. Sửa bước sinh NO dùng cùng chuẩn PI trim/uppercase như classifier; bổ sung warnings và counts UI. Giữ điều kiện generated NO + PI đã tồn tại → conflict, không tự chọn dòng để ghi đè.
5. Tạo matching tên khách; dùng chung trong confirm/backfill. Chạy test duy nhất/trùng tên/không tìm thấy. Backfill chỉ nối đơn có `customerId=null`, bỏ nhóm ambiguous, không sửa liên kết đã có. Tên viết tắt khác tên pháp nhân để unmatched, không suy alias.
6. Đối chiếu 31 cột template và các field New Order qua parser/confirm/DB/detail. Kiểm tra riêng UV: preview đang nhân `uvPct * 100` trong khi schema ghi 0–100 và template dùng 0.02; xác định đơn vị từ workbook/đơn mẫu trước khi sửa. Không tự đổi dữ liệu UV hàng loạt. Ghi test cho đơn vị được chứng minh.
7. Thử sửa nháp rolls/pieces/ meters, clear input, lưu/reload, stale timestamp. Đối chiếu tổng mét/m²/kg và validation duyệt nháp. Chỉ sửa lỗi được tái hiện, giữ công thức PO và sợi hiện tại.
8. Tạo ma trận báo cáo từ bộ bàn giao: EXTRUDER/WARPING/KNITTING/ROLLING/PACKING và mọi sheet kho/chỉ tape thực sự xuất hiện từng file. Đánh dấu sheet dẫn xuất `% DỆT`, `%LINE`, `CHART`, `CHART KNITTING` là tính lại, không import cộng thêm. Dùng danh mục file hiện có, không yêu cầu khách gửi lại.
9. Dùng STATISTICAL tháng 4 và 5 làm bộ đối soát ban đầu; file tháng 8 trong ảnh chat chỉ ghi chưa có file nếu không tìm được trong nguồn, không giả vờ đã chạy. Mỗi metric có ô nguồn, đơn vị và kỳ; đối chiếu chi tiết trước tổng. Các loại workbook khác ghi rõ nguồn bổ trợ hay nguồn cần import để tránh double-count.
10. Chạy migration snapshot vật tư trên DB test tách biệt sau khi xác minh đích; kiểm tra dữ liệu cũ còn nguyên. Thử import retry, đổi tên file, sửa cùng ngày, báo cáo cũ hơn, sửa tay sau snapshot, hai confirm đồng thời. Packing kiểm tra đủ 6 metric/ngày và ngày không có trong file phải giữ nguyên.
11. Tái hiện Rolling import cùng file hai lần và lỗi giữa batch trên DB test. Ghi rõ tăng dòng/tổng nếu xảy ra. Trước khi sửa, bổ sung phụ lục định danh block/kỳ, phạm vi replacement, xử lý legacy chưa có provenance, ngày gộp và bảo toàn `orderId`; không dùng `PI + date` làm unique vì cùng PI có nhiều dòng. Đây là bước thiết kế nội bộ từ nguồn/code; chỉ hỏi nghiệp vụ nếu còn hai cách hợp lệ cho cùng dữ liệu và không có chứng cứ phân xử.
12. Với sheet tồn chưa hỗ trợ: đối chiếu header, đơn vị và phương trình; chốt mapping đích rồi bổ sung phụ lục parser/schema/API/UI/test. Không ép kg/mét/cuộn vào `Material.currentStock` chỉ vì cùng là “tồn kho”. Phần chưa có mapping chưa được cấp trạng thái READY_TO_IMPLEMENT.
13. Sau khi duyệt thiết kế recipe bên dưới, thêm schema/SQL/types/validator → API danh mục → API gắn dòng đơn → panel chi tiết → test. Dùng fixture local trước; chỉ lưu recipe thật khi người dùng thao tác hoặc có danh sách seed được duyệt.
14. Thực hiện các gap báo cáo đã có phụ lục hoàn chỉnh; chạy lại đối soát đúng nhóm ảnh hưởng. Nếu còn gap cần thiết kế mới, cập nhật plan trước khi Implement theo AGENTS, không tự mở rộng từ một bug thành refactor toàn hệ thống.
15. Chạy kiểm tra local, integration DB test và UI; lưu evidence theo CHAT ID. Review ở bước riêng sau Implement; xử lý Critical/Warning, lặp tối đa 2–3 vòng theo AGENTS.
16. Lập report chỉ rõ phiên bản source/schema, bộ file, kết quả, giới hạn. Chuẩn bị danh sách migration/backfill/deploy để duyệt riêng; không dùng kết quả build làm bằng chứng hệ thống khách đã được cập nhật.

### Signature / Interface

#### A. Import và matching

- Giữ `parseOrderList(buffer: Buffer): ParsedOrder[]` và `classifyOrderImport(rows: ParsedOrder[], existing: ProductionOrder[]): OrderImportDecision[]`.
- Trong parser, map NO tường minh và bộ đếm NO dùng `piNumber.trim().toUpperCase()`; `piNumber` xuất ra vẫn giữ text gốc. Không đổi numbering của dòng có NO hợp lệ.
- Preview giữ `preview`, `totalParsed`, `decisions`, `piWarnings`. Warning gồm mọi dòng `noWasGenerated` và mọi identity trùng, kể cả trùng giống hệt; không chỉ conflict. Không lọc rows để xây request confirm.
- UI đếm `new`, `identical`, `conflict`, `invalid` từ decisions; nút ghi “Import N dòng mới”. Sau confirm sử dụng `summary` và `decisions` server trả về, vì DB có thể đổi sau preview. Không dùng `isValid` để hứa số dòng được tạo.
- `src/lib/customers/matching.ts`: đặt types trước các hàm export:

```ts
type CustomerCandidate = { id: string; name: string }
type CustomerMatch =
  | { status: 'matched'; customerId: string }
  | { status: 'unmatched' }
  | { status: 'ambiguous'; customerIds: string[] }
normalizeCustomerName(name: string): string
matchCustomer(name: string, candidates: CustomerCandidate[]): CustomerMatch
```

- Chuẩn hóa tên: trim, gom whitespace liên tiếp thành một space, uppercase. Không xóa dấu câu, dấu tiếng Việt, hậu tố pháp nhân; không fuzzy-match. Candidate phải lấy đủ tập khách để so tên chuẩn hóa, không dùng SQL lọc exact tên trước rồi bỏ sót whitespace.
- `matched` → dùng ID; `ambiguous` → conflict và không ghi; `unmatched` → importer tạo khách chỉ cho dòng `new`. Backfill báo cáo unmatched, không tạo khách mới tự động trong đợt sửa liên kết cũ. Dry-run là mặc định; `--run` mới ghi, hai flag đồng thời → lỗi usage. Mỗi update kiểm tra `id + customerId:null`, tránh đè liên kết phát sinh sau dry-run.

#### B. Recipe — quyết định thiết kế đề xuất duyệt, không gán thành rule khách đã xác nhận

- Mẫu được lưu theo nhãn sản phẩm và variant; `customerId` nullable chỉ để phân loại khi biết chắc. Không tự gán DESERT SAND cho INTERWAY. Dòng đơn giữ snapshot riêng; người dùng chọn tường minh. Thiết kế này cho phép triển khai mà không yêu cầu một thuật toán A/B chưa được khách yêu cầu.
- `ProductColorRecipe`: `id String @id @default(cuid())`, `label String`, `variant String`, `customerId String?`, `version Int`, `spec Json`, `createdAt DateTime @default(now())`; FK nullable tới Customer, `onDelete: Restrict`; bảng `product_color_recipes`; index customerId; unique `[label, variant, version]`. Nhãn/variant được trim, không tự upper; version do server cấp trong transaction có khóa chống cấp trùng. Không có API sửa/xóa phiên bản ở đợt này.
- `ProductionOrder.colorRecipeSnapshot Json?` đặt cạnh `mbCode`; không bắt buộc cho nhập/duyệt đơn. Snapshot không bị thay khi sửa catalog, đổi qty hoặc import lại đơn.

```ts
type BarPosition = 'FIRST' | 'MIDDLE' | 'BACK'
type ColorRecipeComponent = {
  bar: BarPosition; position: number; filamentType: 'MONO' | 'TAPE';
  yarnSpecText: string; colorText: string; mbCode: string; supplierText: string;
}
type ColorRecipeSpec = {
  gsm: number | null; tapeWidthText: string; monoSpecText: string;
  course: number | null; wale: number | null; mbRatePct: number | null;
  heatingInstruction: string; components: ColorRecipeComponent[]; sourceNote: string;
}
type ColorRecipeSnapshot = {
  schemaVersion: 1; recipeId: string; recipeVersion: number;
  label: string; variant: string; spec: ColorRecipeSpec;
}
```

- `validateColorRecipeSpec(input: unknown): { success: true; data: ColorRecipeSpec } | { success: false; issues: { path: string; message: string }[] }`; export sau Zod schema trong file validation.
- Giới hạn kỹ thuật: label/variant 1–100 ký tự, text thành phần 1–200, source/heating tối đa 2000; components 1–100; mỗi bar có ít nhất một thành phần; position nguyên dương liên tiếp từ 1 và không trùng trong bar; numeric null hoặc hữu hạn >0, riêng MB 0–100. Đây là validation lưu dữ liệu, không suy thêm công thức/capacity nhà máy.
- `GET /api/color-recipes?customerId=<id>&q=<text>` → `{ success:true, recipes: ColorRecipeSnapshot[] }`, trả phiên bản mới nhất mỗi label/variant; có customerId thì gồm mẫu chung và mẫu của khách, không tự chọn mẫu đầu. GET không seed mẫu.
- `POST /api/color-recipes` nhận `{ label, variant, customerId: string|null, spec: ColorRecipeSpec }` → 201 với recipe snapshot. Cùng label/variant tạo version kế tiếp; customerId phải tồn tại nếu có. Tạo version khác customerId của cùng series → 409, yêu cầu label khác; không chuyển ownership ngầm.
- `PUT /api/orders/[id]/color-recipe` nhận `{ recipeId: string|null, expectedUpdatedAt: string }`; dùng transaction, kiểm tra timestamp trong điều kiện update để tránh race. Recipe có customerId khác đơn → 409; recipe chung nullable có thể được chọn thủ công. `null` gỡ snapshot; property thiếu →422. Response `{success:true, order}` với timestamp và snapshot mới. Không sửa GSM/màu/MB/khối lượng của đơn từ recipe.
- Lỗi chung: 400 JSON hỏng, 404 không thấy đơn/recipe/khách, 422 validation kèm issues, 409 `STALE_ORDER` hoặc `RECIPE_CUSTOMER_MISMATCH`, 500 lỗi DB chung. Lỗi không tạo snapshot một phần.
- `ColorRecipePanel({ orderId, customerId, updatedAt, snapshot, onSaved })`, `onSaved(order: ProductionOrder):void`; đặt dưới phần thông số kỹ thuật trong `OrderDetail`. Hiển thị FIRST/MIDDLE/BACK theo position; chọn variant và bấm lưu; nút tạo phiên bản mở editor đầy đủ thông số. Đổi khách trên đơn có recipe khác khách → route PATCH đơn trả 409, yêu cầu gỡ/chọn lại; recipe chung không bị chặn. Nhập Excel giữ nguyên format đợt này, có thể bổ sung recipe ở chi tiết sau import.
- Các đơn cũ/chính thức có thể được người dùng gắn snapshot thủ công; snapshot chỉ là thông số được lưu trên dòng đơn, không phát hành lại lệnh sản xuất hoặc thay lịch/sản lượng. Lịch sử catalog bất biến không đồng nghĩa đã có audit log mọi thao tác gắn/gỡ đơn.

#### C. Đối soát và phụ lục gap

- Bảng coverage: `requirementId, sourceFile, sheet, sourceRange, metric, unit, dimensions, parserPath, dbField, uiPath, status, evidence`.
- Bảng reconciliation: `sourceFile, sheet, cell, period, machineOrMaterialOrOrder, metric, sourceValue, parsedValue, storedValue, displayedValue, difference, status, reason`.
- `status = NOT_CHECKED | MATCH | MISMATCH | SOURCE_ERROR | UNSUPPORTED`; dữ liệu chưa đọc/null không đổi thành 0. File có công thức lỗi/cached value nghi ngờ → SOURCE_ERROR, không dùng số đó làm oracle tự động.
- Phụ lục mỗi gap phải có `gapId, input fixture, existing behavior, expected behavior with source, files, exact signatures, identity/replacement scope, transaction behavior, legacy policy, tests`. Phần thiếu một trong các mục này chỉ được audit, chưa được Implement.
- Không có quyền ghi DB test rõ ràng → vẫn hoàn tất parser/source đối soát và ghi DB/UI là NOT_CHECKED; không dùng `.env` hiện tại như bằng chứng đó là DB thử nghiệm.

### Edge case & hành vi

- 30 dòng mới đủ trường nhưng NO đều trống → sinh 30 NO duy nhất, preview đủ 30 và cảnh báo; confirm tạo 30. Cùng PI đã tồn tại → conflict cho NO tự sinh, không hứa import đủ 100% bất kể dữ liệu.
- NO `1, trống, 2` trong cùng PI kể cả khác hoa thường → `1,3,2`; dòng trùng hệt → không tạo thêm; cùng khóa khác nội dung → giữ bản cũ, hiển thị conflict.
- Missing Color/GSM/date/kích thước → đỏ từng dòng; các dòng hợp lệ khác tiếp tục. Date sai, numeric sai không được báo nhầm chỉ là “thiếu trường”.
- Khách trùng sau chuẩn hóa → không chọn first; khách viết tắt chưa có alias → unmatched; không tự nhận là cùng pháp nhân.
- Đơn nháp thiếu thông số → được lưu theo schema nháp; duyệt cần đủ field. Clear qty/rollLength không giữ lại totals cũ cho rolls.
- A/B cùng nhãn/GSM vẫn là hai variant; mỗi mẫu 3/2/2 thành phần. Màu cùng mã ở dàn khác vẫn là thành phần riêng. `24-450D` giữ nguyên text.
- A: BACK/2 Dark beige 3160-2 / MB KOREA; B: BACK/2 Beige 8005A / MB ARIRANG. Các thành phần khác giữ đúng ảnh; heating lưu chuỗi chỉ dẫn, không sinh hệ số.
- Đơn không chọn recipe vẫn hoạt động như trước; sửa qty không đổi snapshot. Tạo version mới không làm đổi đơn đã chọn bản cũ.
- Báo cáo lặp/corrected → kiểm thử theo từng module; Rolling append hiện tại là MISMATCH nếu nhân đôi, không hợp thức hóa bằng cách gọi là hành vi đã bàn giao.
- Ngày gộp Rolling giữ nhãn và giới hạn gán ngày đầu đã ghi trong bàn giao; không tự chia đều hai ngày hoặc tạo ngày không tồn tại.
- PI nhiều sub-line chưa nối được → giữ ref gốc và cảnh báo; không dùng sub-line đầu, không quy toàn bộ sản lượng cho tất cả đơn rồi báo đủ để lập kế hoạch.

### Không được làm

- Không Implement ở lượt Plan; không stage/commit/push, không chạy migration/backfill trên DB thật hoặc deploy chỉ vì plan được viết xong.
- Không sửa loss 1.05 của nhu cầu sợi, công thức PO, hay thêm Work Order/MB calculator trong đợt này.
- Không coi manual A/B + snapshot là quyết định khách đã xác nhận; đây là thiết kế đề xuất cho phạm vi lưu/chọn được duyệt qua plan.
- Không đổi ngữ nghĩa `beamCount` thành beams used; không rename BEAM Warping dựa riêng vào giả thuyết cột G.
- Không tự xóa dữ liệu Rolling cũ hoặc gộp mọi sheet tồn về kg trước mapping.
- Không thêm auth, AI, auto-schedule, purchasing, revision workflow cho mọi báo cáo hoặc xuất kho tự động.
- Giữ yêu cầu local-only cho workflows/AGENTS/tests. Không sửa ignore để đưa chúng lên remote; khi cần bàn giao kiểm thử nêu rõ test local không tự đi theo source được push.

### Cách test như thế nào là chuẩn

1. **Unit:** fixture nhỏ có input/output nghiệp vụ kiểm tra độc lập; assertion gồm counts, giá trị, trường mất dữ liệu và trạng thái conflict. Không chỉ snapshot implementation hay kiểm có gọi hàm.
2. **Integration DB test:** gọi preview/confirm thật trên DB PostgreSQL tách biệt; đọc DB sau request, đo row count/tổng/liên kết trước sau; thử retry/concurrency/rollback. Không mock Prisma rồi coi là đã kiểm chứng transaction.
3. **UI:** thao tác upload → preview → confirm → reload; sửa nháp → lưu → reload; chọn recipe → đổi version → mở lại đơn cũ. Ghi môi trường và ảnh/kết quả từng CHAT ID, không kết luận UI chỉ từ test hàm.
4. **File thật:** đối chiếu nguồn với parser, DB và UI theo từng chiều ngày/ca/máy/đơn/vật tư. Dùng công thức/ô nguồn kiểm tra độc lập; không lấy chính parser tạo expected values. Tổng khớp nhưng chi tiết lệch vẫn fail.
5. **Regression:** 46 test baseline phải còn đạt; bổ sung test nhóm đã sửa. Chạy `node --import tsx --test` với danh sách test src và tests mới; `tsc --noEmit`; `npm run build`. Build đạt không xác nhận migration, backfill hay deploy.
6. **Review:** findings theo AGENTS gồm file:line, lý do, cách sửa cụ thể. Report chỉ ghi hoàn tất khi không còn Critical/Warning trong phạm vi; phần chưa được kiểm thử để riêng.

### Cách kiểm tra xong

| Kiểm tra | Kết quả phải thấy |
|---|---|
| 30 dòng đủ field/NO trống, DB rỗng cho PI | 30 preview, 30 new, 30 DB; mọi NO tự sinh có cảnh báo |
| 30 dòng gồm 20 new, 3 identical, 2 conflict, 5 invalid | Preview/confirm giải trình 30; tạo đúng 20; giữ bản cũ |
| Khách cũ tên cùng chuẩn hóa | Không tạo Customer mới, ID đúng; ambiguous không ghi |
| Backfill dry-run | DB không thay đổi; danh sách ID có thể nối và không thể nối rõ ràng |
| Đơn rolls: width=4m, GSM=100, qty 20→25, rollLength=100 | Tổng mét 2000→2500; m² 8000→10000; kg 800→1000; sợi 840→1050 nếu productionGsm trống |
| Template chứa số kim/dàn và optional fields | Sau import/reload bằng dữ liệu gốc, không null hóa |
| Recipe A/B | Mỗi variant đúng 7 thành phần; BACK/2 đúng nhà cung cấp; snapshot cũ bất biến |
| Materials/Packing retry và đổi tên file | Row count và tổng không tăng vì retry; sửa cần xác nhận đúng phạm vi |
| Rolling retry | Không được nghiệm thu khi vẫn nhân đôi; phụ lục sửa phải được thực hiện/test trước PASS |
| Mọi sheet nguồn trong bộ bàn giao | Có coverage row và lý do import/derived/unsupported, không bỏ qua âm thầm |
| Source → DB → UI | MATCH ở chi tiết và tổng theo precision lưu/hiển thị có ghi rõ; không dùng epsilon tự đặt để che sai số nghiệp vụ |

Plan được coi là xong khi các bước sẵn sàng triển khai và các bước cần mapping bổ sung được phân biệt rõ. **Không coi CHAT-07/08 đã có đặc tả sửa hết mọi sheet ở thời điểm này**: bước mapping/đối soát là phần được lập kế hoạch trước, phụ lục gap phải hoàn tất trước từng thay đổi chưa xác định.

Sau khi người dùng duyệt, thực hiện đúng thứ tự ở trên. Dừng ở Plan hiện tại theo `AGENTS.md`; không yêu cầu khách xác nhận lại ba câu scope chung đã có cơ sở trong bàn giao.
