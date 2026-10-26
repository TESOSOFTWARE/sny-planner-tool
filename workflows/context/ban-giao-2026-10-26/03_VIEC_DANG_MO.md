# 03 — Việc đang mở (26/10/2026), theo thứ tự ưu tiên

Người quyết: **anh Trí** (TESO). "Khách" = chị Dung / chị Nguyên / SNY. Không tự làm mục cần duyệt.

## P0 — làm ngay, không cần code
| # | Việc | Ai | Chặn / ghi chú |
|---|---|---|---|
| 1 | **Đơn hàng trên prod gần như trống.** 19/10: 3.047 dòng đơn, 78 lịch. 26/10: **17 dòng / 6 PI**, 7 lịch. Khách xoá trong khoảng 19–22/10. Hỏi khách có chủ ý không; nếu lỡ tay thì khôi phục từ bản sao 19/10 | Anh Trí hỏi khách | Câu A1 trong `REPORT/22102026/CLAUDE/CAU_HOI_KHACH_22102026.md`. Đã có trong tin gửi khách 26/10 (bản dài); chưa có trả lời |
| 2 | Việc bảo mật hạ tầng | Anh Trí | Xem bản đầy đủ trong `REPORT/BAN_GIAO_26102026/03_VIEC_DANG_MO.md` P0 #2 |
| 3 | Gửi khách tin trả lời góp ý 22/10 (tìm đơn, xếp chung, chốt đơn) | Anh Trí | Đã soạn 26/10 trong phiên chat |
| 4 | Buổi ~30 phút hướng dẫn tổ thống kê **nhập STATISTICAL REPORT tháng 10** (5 tab) và xem "Tiến độ sản xuất" | Anh Trí + khách | Khách phản hồi 26/10 "chưa lên được sản lượng": chức năng có, chưa có dữ liệu tháng 10 (`REPORT/26102026/CLAUDE/DIEU_TRA_PHAN_HOI_KHACH_SAN_LUONG_SOI_26102026.md`) |
| 5 | Xoá 2 dòng sản lượng demo M-004 ngày 05–06/10 (`knitting_daily_output`, tạo 07/10) | Cần anh duyệt ghi DB | Sót từ đợt dọn demo 15/10 |
| 6 | Chị Dung gỡ 3 ô HSIA cũ (M-014, 26–28/10) rồi xếp lại thành 1 thanh | Khách | Lịch cũ không tự gộp (chốt 22/10) |

## P1 — cần chốt scope với khách
| # | Việc | Tình trạng | Cần |
|---|---|---|---|
| 7 | **Công thức sợi theo beam** (`User Raw Documents/Formular.xlsx`): số mét/beam = kg × 9.000.000 ÷ số sợi ÷ denier; số sợi/beam = khổ(cm) × loss kim × số kim × số khổ ÷ 2,54 ÷ số beam | Chưa có trong code, **không có trong MoM 07/10** | Khách xác nhận "công thức tính sợi" là cái này. Nếu có: card mới (hàm thuần + 4 ô nhập denier/số kim/số khổ/số beam, hiện ở Chi tiết đơn và tab Warping). Cột `needleCount`, `beamCount` đã có |
| 8 | **Tổng hợp sản lượng theo PI** (MoM §3.4, H1) | Hoãn 09/10 | Khách cho biết cách gắn PI: ghi PI ở cột RE MARK (parser đã hỗ trợ từ 14/10) hay chọn PI khi nhập |
| 9 | Sửa nhiều lịch GĐ2–3 | Chờ khách câu 2, 3, 4, 6 | `REPORT/16102026/CLAUDE/PLAN_GIAI_PHAP_SUA_NHIEU_LICH_16102026.md:86-92` |
| 10 | Lịch nghỉ tháng 11–12/2026 | Đã có tới 02/11 | Khách gửi (câu A4) |
| 11 | Câu 12: số máy / khổ máy lệch 10/40 máy giữa báo cáo KNITTING và Production Schedule | Chưa hỏi | Có thể làm tiến độ theo đơn gán nhầm máy |
| 12 | K-14: đơn đóng kiện có tính theo tấm không | Chưa hỏi | Chị Nguyên |
| 13 | Hẹn buổi **UAT** các mục MoM | Chưa có | Chưa mục nào nghiệm thu |
| 14 | Menu Reports / Settings (Phase 2): mốc thời gian | Chưa nói với khách | — |

## P2 — backlog code (đã phân tích, chưa giao)
| Mã | Việc | Nguồn |
|---|---|---|
| R-3 | Chọn nhiều lịch chạm mốc 500 có thể cắt ngang nhóm xếp chung | Review Codex 26/10 |
| R-6 | PI > 50 dòng cùng quy cách: báo hạn mức thay vì "Invalid input" | Review 26/10 |
| R-7 | Đọc dữ liệu đơn trước khi khoá bảng ở POST xếp chung | Review 26/10 |
| U-1 | Thanh giữ chỗ dạng nhóm ghi "N dòng · X m" | Test 22/10 |
| U-2 | Xếp 1 dòng lẻ: điền sẵn mét còn lại | Test 22/10 |
| U-3 | 409 trùng lịch nói rõ trùng PI / ngày nào | Test 22/10 |
| — | Chuyển máy nhóm trên prod mất ~10 s (serverless + LOCK TABLE); thêm thông báo "đang xử lý" nếu khách than | Kiểm prod 26/10 |
| 1910-09 | Nhật ký xoá đơn (cần schema) | Hoãn tới trước go-live |
| — | `MaterialTransaction.orderId` thiếu relation + index | BACKLOG C |

## P3 — card đã viết 19/10, **chưa làm** (đang xếp hàng)
Kiểm 26/10: không có commit, không có stash, không có file chưa commit, không có báo cáo `REPORT/*/CODEX/<card>.md` cho các card này. Lý do: các card này xếp sau 1910-11, rồi feedback 22/10 được cho chen trước (`REPORT/22102026/CLAUDE/PLAN_2210_FEEDBACK_DUNG_XEP_MAY_22102026.md:57`). Nội dung card đầy đủ: `REPORT/19102026/CLAUDE/GIAO_VIEC_CODEX_DOT_SAU_19102026.md`. Trước khi làm, đối chiếu lại với code hiện tại (đã đổi nhiều sau 22/10).
| Card | Việc |
|---|---|
| 1810-02b | UI Orders/Customers (Orders tràn ngang ở 768) |
| 1910-01 | Phân trang thống nhất |
| 1910-06 | Dropdown màu Sửa PI ở 768 |
| 1910-07 | Nhãn DAY/NIGHT → SMALL/BIG |
| 1910-08 | Sửa PI đổi kiểu đóng gói → đổi kiểu đơn (R-8 review 0810-34) |
| 1810-09 | Ngày gộp Rolling (cần schema, migration duyệt riêng) |
| 1910-10 | Báo dời ngày bắt đầu |
| 0810-22d, 0810-20 | BACKLOG còn ghi "chờ Claude review", nhưng Codex làm xong 13/10 trước release PR #7/#8 (parser Đóng gói đổi trong commit `9f4f482` 13/10). Nhiều khả năng đã nằm trong `main` [CHƯA KIỂM chi tiết] — cần dọn dòng BACKLOG |

## P4 — dọn dẹp
- Xoá nhánh remote `chore/vercel-probe` (cần `XAC_NHAN_GITHUB`).
- Thư mục chính `sny-planner-tool` đang ở nhánh cũ `0710`: `git checkout develop && git pull`, rồi bỏ worktree `sny-planner-tool-fb-1910` **sau khi chép 83 file test local**.
- `REPORT/BACKLOG.md` dài, nhiều dòng lỗi thời (danh sách đề xuất dọn: `REPORT/19102026/CLAUDE/TONG_HOP_PENDING_19102026.md` mục 5).
- Push/PR dùng tài khoản GitHub có quyền write vào `TESOSOFTWARE/sny-planner-tool` (hỏi anh Trí).
