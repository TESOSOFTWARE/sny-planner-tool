# 02 — Nhật ký phát hành (toàn dự án)

Nguồn: `gh pr list` (22 PR), `git log origin/main`, tag, `REPORT/<ngày>/`. Ngày theo giờ VN.

## 1. Các giai đoạn
| Thời gian | Giai đoạn | Kết quả chính | Tài liệu chốt |
|---|---|---|---|
| 05/2026 | Mã nguồn gốc | 3 commit "Add files via upload" (bản dựng đầu, trước khi TESO tiếp nhận vào repo công ty) | — |
| 17–18/09 | Tiếp nhận vào repo công ty | Import source, cấu hình dev, gia cố import + thay lịch. PR #1, #2 | — |
| 22–25/09 | Khảo sát nghiệp vụ, chuẩn hoá yêu cầu | Tổng hợp 5 công đoạn, công thức, vòng đời đơn; kế hoạch V4 | `REPORT/23092026/TONG_HOP_YEU_CAU_KH_VA_DOI_CHIEU.md`, `REPORT/25092026/TONG_HOP_TOAN_DIEN_NGHIEP_VU_VA_LUONG_HE_THONG_SNY.md` |
| 26–30/09 | Phase 1 + feedback V4.1, demo 30/09 | Đóng gói đa tầng, GSM kép, PI master-detail, giữ chỗ, công thức màu, dung sai | `REPORT/28092026/BAO_CAO_TONG_HOP_TOAN_DIEN_VA_TAI_LIEU_NGHIEM_THU_SNY_V4_1.md` |
| 01–06/10 | Hoàn thiện Production Orders + Customer | Item Code, import lại, phân trang; PR #3, #4, #5 | `REPORT/06102026/BAO_CAO_FULL_PRODUCTION_ORDERS_06102026.md` |
| **07/10** | **Họp khách (MoM)** — chỉ Schedule + Materials | 10 mục §2.1–2.6, §3.1–3.4 | `REPORT/07102026/MOM_RECAP_MEETING_07102026.md` |
| 08–14/10 | Làm MoM + FB 12/10 | Lịch nghỉ, công thức ngày, chuyển/đảo/máy hư, 5 tab Materials, import lịch thật, ORDER LIST 3.004 dòng lên prod; PR #7–#12 | `REPORT/12102026/CLAUDE/DOI_CHIEU_MOM_07102026_12102026.md`, `REPORT/14102026/CLAUDE/BRIEF_BAN_GIAO_AI_14102026.md` |
| 15–19/10 | FB 15/10 + nợ kỹ thuật Materials | Chọn nhiều/sửa nhiều lịch, xoá hàng loạt đơn, UI Materials, Knitting TOTAL; PR #13–#16, release 19/10 | `REPORT/19102026/CLAUDE/KIEM_NGHIEM_CUOI_DOT_RELEASE_19102026.md` |
| 20–22/10 | FB 22/10 chị Dung + chị Nguyên | Tìm đơn, xếp chung nhóm, chốt đơn, xoá đơn từ lịch; test thật TEST-2210; PR #17–#19 | `REPORT/22102026/CLAUDE/REPORT_TEST_THAT_TEST-2210_22102026.md` |
| 26/10 | Review chéo + vá + điều tra Vercel | 2610-01 (R-1/2/4/5), 2610-02 (máy hư cho nhóm); tìm ra lỗi deploy Vercel; PR #20–#22; bộ bàn giao (PR #23–#26) | `REPORT/26102026/CLAUDE/REVIEW_CODEX_2610-02_26102026.md` |
| 27/10 | File STATISTICAL REPORT 10-2026 của khách | Warping theo khối (2710-01), HDPE kỳ gộp N ngày (2710-02), HDPE nhập theo tháng D1→B+ (2710-03a/b/c); PR #27–#29; nhập sản lượng T10 lên prod (Knitting, Extruder, Warping, Rolling) | `REPORT/27102026/CLAUDE/BAO_CAO_TONG_KET_27102026.md` |

## 2. Danh sách PR
| PR | Ngày merge | Nhánh | Nội dung |
|---|---|---|---|
| #1 | 18/09 | develop → main | Develop (khởi đầu) |
| #2 | 18/09 | develop → main | Hoàn thiện nhập liệu và lập lịch sản xuất |
| #3 | 06/10 | tribd-implement-sny-features → develop | Module Production Orders + Customer |
| #4, #5 | 06/10 | develop → main | Merge + sửa PI number, Item Code khi tạo |
| #6 | — (đóng) | 0710 → main | Bị thay bằng #7/#8 |
| #7 | 13/10 | 0710 → develop | Nâng cấp Schedule + Materials theo MoM và FB |
| #8 | 13/10 | develop → main | Release |
| #9 | 13/10 | 0710 → develop | Sửa tổng hàng đóng kiện (BALE) khi import ORDER LIST |
| #10 | 13/10 | develop → main | Release |
| #11 | 14/10 | 0710 → develop | Tiếp FB (timeout import, …) |
| #12 | 14/10 | develop → main | Release |
| #13 | 19/10 | 0710 → develop | FB 15/10–16/10: chọn/sửa/xoá nhiều, UI Materials |
| #14 | 19/10 | develop → main | Release 19/10 |
| #15 | 19/10 | fb-1910 → develop | Sửa sau release: nhập lịch sử HDPE, Knitting TOTAL, UI Materials |
| #16 | 19/10 | develop → main | Release (production `304c12d`) |
| #17 | 22/10 | fb-1910 → develop | FB 22/10: 2210-01…04, 1910-11 |
| #18 | 22/10 | develop → main | **Merge qua API — Vercel không deploy** |
| #19 | 22/10 | develop → main | Commit rỗng ép deploy — **vẫn không deploy** |
| #20 | 26/10 | chore/vercel-probe → main | Thử nghiệm: merge bằng nút web → **deploy ngay** |
| #21 | 26/10 | fb-1910 → develop | 2610-01 + 2610-02 |
| #22 | 26/10 | develop → main | Release 26/10 (`0f8ff9c`) |
| #23–#26 | 26/10 | fb-1910 ↔ develop ↔ main | Bộ tài liệu bàn giao (chỉ docs) |
| #27 | 27/10 | fb-1910 → develop | 2710-01, 2710-02, 2710-03a, 2710-03b |
| #28 | 27/10 | develop → main | Release 27/10 (production hiện tại `882665c`) |
| #29 | 27/10 | fb-1910 → develop | 2710-03c (vào `main` qua #28) |

## 3. Commit tính năng gần nhất trên `main`
| Commit | Ngày | Card | Nội dung |
|---|---|---|---|
| `1c0e196` | 27/10 | 2710-03c | So sánh ảnh chụp theo vật tư đã xác định (không theo tên nguồn); cập nhật test đã track |
| `d3a019c` | 27/10 | 2710-03b | UI nhập lịch sử 3 lựa chọn + khối "Sau khi nhập"; sửa tên vật tư |
| `33570d9` | 27/10 | 2710-03a | Nhập HDPE theo tháng: nhận mọi kỳ, cập nhật tồn bảo thủ, kỳ chồng nhau, ánh xạ tên |
| `e776b1c` | 27/10 | 2710-02 | HDPE nhận kỳ gộp `dd+dd+dd/MM/yyyy` |
| `1d80172` | 27/10 | 2710-01 | Warping nhận khối theo tiêu đề `WARPING`; chặn khối thiếu ngày / trùng ngày |
| `9380d0f` | 26/10 | 2610-02 | Máy hư khi nhóm xếp chung đang chạy |
| `57fedb4` | 26/10 | 2610-01 | Làm tròn tổng mét nhóm, chặn dòng thiếu mét, biên ngày VN cho chia sản lượng và bạn nhóm |
| `f93421a` | 22/10 | 2210-05 | Test specGroup, outputShare, picker |
| `7cc8304` | 22/10 | 2210-02, 2210-04 | Xếp chung dòng cùng quy cách; picker dùng chung |
| `ca472a4` | 22/10 | 1910-11 | Chọn cả tháng, xoá đơn từ lịch |
| `11b68a9` | 22/10 | 2210-01 | Tìm đơn trong Xếp máy |
| `ea8fe3b` | 22/10 | 2210-03 | Nút chốt đơn chính thức |
| `1aef7cc`, `0e9f47c`, `77f12ac` | 19/10 | 1810-02a, 1810-08, 1910-02 | UI Materials, Knitting TOTAL, nhập lịch sử HDPE |
| `f07c860` | 17/10 | FB 15/10 | Chọn/xoá/sửa nhiều lịch và đơn |

## 4. Tag mốc quay lại
| Tag | Trỏ tới | Ý nghĩa |
|---|---|---|
| `sny-feedback-20261013` | `9f4f482` | Mốc 13/10 |
| `sny-prod-20261019-pre-fb1910` | `f877e1d` | Production trước đợt 19/10 |
| `sny-prod-20261022-pre-fb1910-2210` | `304c12d` | Production trước đợt 22/10 + 26/10 |

Production trước đợt 27/10 = `main` `530a10c` (chưa gắn tag). Backup DB 27/10 trong `REPORT/27102026/CLAUDE/backup-db/`.

Quay lại nhanh nhất: Vercel → Deployments → **Instant Rollback** về bản trước. Không đổi schema từ 19/10 nên rollback code không cần rollback DB.

## 5. Migration SQL đã chạy trên DB dùng chung
Dự án **không dùng `prisma migrate`**; migration là file SQL tay trong `prisma/sql/`, chạy bằng `prisma db execute` (hoặc psql) sau khi anh Trí duyệt. Từ 08/10 mỗi file có bản `rollback_*`; 2 file tháng 9 (`20260928`, `20260929`) **không có rollback**.
| File | Đã chạy prod | Nguồn |
|---|---|---|
| `20260919_material_report_snapshots.sql` | Có | 19/09 |
| `20260928_remove_fr_standard.sql`, `20260929_has_paper_core_default_false.sql` | **Không rõ** | Đã ghi "chưa rõ trạng thái" từ 12/10 (`REPORT/12102026/CLAUDE/TONG_QUAN_LUONG_THONG_TIN_12102026.md:71`). App chạy bình thường nên schema hiện tại tương thích; muốn chắc phải xem `information_schema` (cần duyệt DB) |
| `20261008_factory_calendar.sql`, `20261008_seed_vn_holidays_2027.sql` | Có | BACKLOG D |
| `20261008_material_subgroup.sql` | Có, 11/10 | BACKLOG D |
| `20261012_gsm_double_precision.sql` | Có (GSM 50.8 lưu đúng trên prod 13/10) | Brief 14/10 |
| `20261016_knitting_detail_mesh_type.sql` | Có, 16/10 14:00 | `REPORT/16102026/CODEX/1510-06.md:67` |
