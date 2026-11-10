# M30-08 — Coverage báo cáo thống kê

Nguồn: `STATISTICAL REPORT 10-2026.xlsx`, MoM 30/10 §4. Kết quả offline theo `report-coverage.csv`.

| Phân loại | Sheet | Hành vi trong app |
|---|---|---|
| Nguồn tháng 10 | HDPE, EXTRUDER, WARPING, KNITTING, ROLLING | Workspace Reports theo dõi từng nhóm; import theo parser/preview hiện hữu. Summary lọc tháng và hiển thị đơn vị riêng. |
| Dẫn xuất | CHART, CHART KNITTING, %LINE | Không nhập lại; summary cộng từ bản ghi nguồn, tránh đếm hai lần. |
| Ngoài kỳ / lịch sử | HDPE KO SỬ DỤNG, % DỆT, SẢN LƯỢNG ĐÓNG GÓI, CHI TAPE HONSIN 2022, CHI TAPE TRAN KHANG | Không coi là actual tháng 10. Nguồn đóng gói trong sheet là tháng 01/2026; các bảng tape là lịch sử. |
| Trống | Sheet1 | Không có dữ liệu. |

## Chỉ số summary local

- Kéo sợi và mắc sợi: dòng và kg từ bản ghi theo ngày.
- Dệt: dòng, kg và mét. Không suy diễn % tiến độ đơn từ tổng theo máy.
- Cuộn: nhóm và giữ riêng nhãn metric; không cộng `QUANTITY SMALL`, `QUANTITY BIG`, mét và kg với nhau.
- Đóng gói: tổng kg/mét ngày + đêm từ `PackingDailyOutput`.
- Nhập trực tiếp: tổng theo công đoạn/đơn vị, hiển thị tách khỏi số import để tránh cộng trùng.

## Giới hạn đối soát

Summary code và bộ lọc tháng đã thêm; chưa chạy DB integration hoặc so từng ô source→DB→UI vì PostgreSQL local không hoạt động. Cached formula error trong workbook không được tính lại. UAT và phê duyệt kỳ/metric vẫn cần SNY. Vì vậy coverage static không được hiểu là số liệu đã khớp workbook.
