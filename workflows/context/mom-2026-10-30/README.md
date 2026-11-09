# Đầu ra khảo sát MoM 30/10

Chạy offline ngày 09/11/2026 bằng `python3 scripts/audit-mom-3010.py`. Nguồn là 4 workbook đính kèm trong Downloads và 4 workbook quy cách tải nguyên bản từ Drive vào `/private/tmp/sny-m30-sources`. Không thực thi công thức/macro; script audit không đọc DB.

| Task | Đầu ra thực tế | Giới hạn |
|---|---|---|
| M30-01 | [Manifest 8 workbook](source-manifest.json) có SHA256 và số ảnh; [591 sheet](sheet-inventory.csv) có tên, kích thước khai báo và mẫu header | Mỗi sheet đọc 20 dòng đầu; chưa chứng minh mọi ô đã được đối soát. Nguồn tải ở thư mục tạm cần được giữ riêng nếu chạy lại sau khi máy dọn tmp. |
| M30-01 | [Ma trận trường sơ bộ](field-gap-review.csv) đối chiếu field nguồn với schema | Cần rà thêm parser/form trước khi kết luận một field bị mất hoàn toàn. |
| M30-01 | [117 header đại diện](field-coverage.csv) có ô nguồn và vị trí tham chiếu schema/parser/validation/form/detail/persistence | Tham chiếu từ khóa trong code là bằng chứng tĩnh; chưa phải test round-trip. Cần rà ngữ nghĩa và mọi biến thể bổ sung. |
| M30-02 | [193 dòng kế hoạch cần rà](pi-mapping-review.csv), [tổng hợp](audit-summary.json) | Chỉ 2 dòng khớp mã PI của catalog cung cấp; 191 chưa tìm thấy. Catalog chỉ tới 13/05/2026, nên đây không phải tỷ lệ chất lượng của DB hiện hành. |
| M30-08 | [Coverage 14 sheet](report-coverage.csv) | Đo kỳ từ ô kiểu ngày và lỗi cached; chuỗi ngày gộp cần parser riêng. Không tính lại Excel. |

Phương pháp M30-02: chỉ khảo sát dòng có ORDER, Color, Gauge và Denier; lấy phần trước hậu tố GSM làm mã ứng viên, so mã sau khi bỏ whitespace và đổi hoa. Đây là phép chẩn đoán đơn giản, không phải production resolver, không có fuzzy-match và không gán item ID. Hai dòng chỉ khớp PI vẫn phải rà item. Các dòng không đủ cột không nằm trong tập 193; cần thiết kế parser đầy đủ trước khi kết luận độ phủ file.

M30-01 và M30-02 **chưa hoàn tất toàn phạm vi**. Người dùng hiện không có catalog mới; [đề xuất hợp đồng dữ liệu](data-contract.md) giữ PI thô và liên kết nullable. [Thiết kế field](field-design.md) ghi rõ trường cần bổ sung/rà lại. Người dùng cần mẫu in khác của SNY; M30-06/07 chờ mẫu này. Auth đã chốt chỉ email/mật khẩu và có [hướng dẫn local](local-login.md).

Các file CSV bảo toàn mã và tọa độ nguồn; text bắt đầu bằng ký tự công thức được thêm dấu nháy để không thực thi khi mở bằng Excel. Đầu ra chứa dữ liệu khách, chỉ sử dụng trong phạm vi dự án.

Task card và ghi chú Markdown được whitelist cụ thể trong Git; các JSON/CSV sinh từ nguồn khách giữ local. Khi clone sang máy khác cần chạy lại script với file nguồn được bàn giao. Xem [kiểm tra/UAT](uat-status.md) để phân biệt PASS local với phần chưa nghiệm thu SNY.
