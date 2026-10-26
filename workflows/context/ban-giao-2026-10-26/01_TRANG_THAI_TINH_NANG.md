# 01 — Trạng thái tính năng (26/10/2026, theo code `main` @ `0f8ff9c`)

**Chưa mục nào được khách nghiệm thu (UAT).** "Đã có" dưới đây = đã ở `main` và đã deploy; mức kiểm ghi ở cột Bằng chứng (ký hiệu xem `00`).

Trạng thái: ✅ đã có · 🟡 một phần · ⏸ hoãn có chủ ý · ❌ chưa làm.

## 1. Đơn hàng (Production Orders) — trang `/orders`, `/orders/new-multi`, `/orders/pi/[piNumber]`, `/orders/[id]`, `/orders/bulk`, `/orders/summary`
| Tính năng | TT | Nguồn yêu cầu | Code chính | Bằng chứng |
|---|---|---|---|---|
| Tạo PI nhiều dòng (mét / cuộn / tấm), đóng gói BALE/CARTON/HEMMED, Item Code, màu + MB, công thức màu snapshot khi duyệt | ✅ | SRS, FB 30/09 (V4.1) | `components/orders/MultiLineOrderForm.tsx`, `api/orders/multi-line`, `lib/orders/recipeSnapshot.ts` | [KIỂM PROD] retest 06/10 (`REPORT/06102026/BAO_CAO_RETEST_PRODUCTION_ORDERS_LAN_2_06102026.md`) |
| Tính m², kg hợp đồng, **nhu cầu sợi = m² × (GSM sản xuất ?? GSM) ÷ 1000 × 1,05**; GSM kép cho hàng tráng màng | ✅ | SRS §3.4–3.5 | `lib/calculations/orderWeight.ts:31-33` | [KIỂM PROD] 06/10 (5.000 m → 1.365 kg sợi) |
| Sửa cả PI (master-detail) | ✅ | V4.1 | `components/orders/PiMasterDetailEditor.tsx`, `api/orders/pi/[piNumber]` | [KIỂM PROD] |
| Vòng đời DRAFT → RESERVED (giữ chỗ) → APPROVED; nút **"Chốt đơn chính thức"** | ✅ | FB 22/10 chị Nguyên | `PiMasterDetailEditor.tsx:912-913`, `api/orders/pi/[piNumber]/approve` | [KIỂM LOCAL] TEST-2210 22/10 |
| Import ORDER LIST từ Excel (preview → confirm) | ✅ | V4.1, 0810-33/34 | `api/orders/import`, `lib/excel/parseOrderList.ts` | [KIỂM PROD] 13/10 nạp 3.004 dòng. **Khách đã xoá gần hết sau đó** (xem 03) |
| GSM thập phân | ✅ | FB 12/10 #5 (1210-02) | migration `prisma/sql/20261012_gsm_double_precision.sql` | [KIỂM PROD] 13/10 (GSM 50.8 lưu đúng) |
| Chọn nhiều + xoá hàng loạt đơn (kèm gỡ lịch) | ✅ | FB 15/10 #1 | `api/orders/bulk-delete`, `OrderTable.tsx` | [TEST] + dùng thật 22/10, 26/10 |
| Bảng tổng PO, hành trình sản xuất | ✅ | — | `/orders/summary`, `POSummaryTable.tsx`, `api/orders/journey-summary` | [ĐỌC CODE] |
| Tiến độ sản xuất theo đơn (đã dệt / còn lại) | 🟡 | SRS HLR-025 | `OrderDetail.tsx:204-221`, `api/knitting/progress/[orderId]` | [KIỂM PROD] 26/10 chia sản lượng đúng. Chỉ ra số khi đơn có lịch máy **và** máy có sản lượng ngày; suy ra từ lịch, không ghi nhận trực tiếp |
| Nhật ký xoá đơn | ⏸ | FB 15/10 (1910-09) | — | Hoãn đến trước go-live (anh Trí 19/10) |
| Công thức **số sợi / beam, kg / beam theo denier** (`Formular.xlsx`) | ❌ | Khách nhắc 26/10, **không có trong MoM 07/10** | — | Cột `needleCount`, `beamCount` có trong schema nhưng không dùng. Chờ khách xác nhận (03) |

## 2. Khách hàng — trang `/customers`
| Tính năng | TT | Code | Bằng chứng |
|---|---|---|---|
| CRUD khách, tìm kiếm, màu mẫu theo khách | ✅ | `api/customers*`, `ColorPreset` | [KIỂM PROD] 06/10. Đã gộp 17 khách trùng 13/10 |

## 3. Lịch máy dệt — trang `/schedule`
| Tính năng | TT | Nguồn | Code chính | Bằng chứng |
|---|---|---|---|---|
| Lưới 40 máy × ngày trong tháng; Xếp máy; Chi tiết; kiểm trùng lịch 409 | ✅ | SRS | `app/schedule/page.tsx`, `AssignModal.tsx`, `DetailModal.tsx`, `api/assignments` | [KIỂM PROD] |
| Tự tính số ngày + ngày kết thúc (làm tròn lên, bỏ ngày nghỉ), hiện công thức + tổng ngày | ✅ | MoM §2.1 | `lib/schedule/productionDuration.ts`, `assignmentDates.ts`, `ProductionDurationSummary.tsx` | [KIỂM PROD] |
| Lịch nghỉ nhà máy theo tháng + ngày lễ VN; tô màu | ✅ | MoM §2.2 | `lib/schedule/factoryCalendar.ts`, `vnHolidays.ts`, `api/calendar*` | [KIỂM PROD]. Lịch nghỉ đã có tới 02/11/2026 |
| Chuyển máy, đảo lịch (swap), **máy hư** (tách lịch đang chạy) | ✅ | MoM §2.3 | `TransferAssignmentModal.tsx`, `api/assignments/{swap,split,[id]}` | [KIỂM PROD] |
| Chi tiết hiện đủ các dòng của PI | ✅ | MoM §2.4 | `DetailModal.tsx` | [KIỂM PROD] |
| Đơn đang chạy trên máy nào, bao nhiêu máy | ✅ | MoM §2.5 | `OrderMachines` | [ĐỌC CODE] |
| Ẩn đơn đã xong khỏi danh sách chọn ("xong" = hết lịch) | ✅ | MoM §2.6 | `getUnassignedOrders(includeFinished)` | [KIỂM PROD] |
| Import lịch tháng từ Excel (gắn dòng đầu PI, tạo đơn nháp cho PI chưa có) | ✅ | MoM §2.2/2.4, 0810-27C | `api/schedule/import*`, `lib/schedule/importPlan.ts` | [KIỂM PROD] 13/10 nạp T1/2026. Khách đã xoá lịch T1 sau đó |
| Chọn nhiều lịch (tick trên lưới, tab Danh sách), sửa hàng loạt: chuyển máy giữ ngày, dời ngày (lịch chưa chạy), gỡ lịch | ✅ | FB 15/10 #2 (GĐ1) | `BulkEditModal`, `AssignmentListView`, `api/assignments/bulk-edit*`, `bulk-delete` | [KIỂM LOCAL] |
| Sửa hàng loạt GĐ2–3 (điền mét/năng suất, nối tiếp, đẩy lịch, hoàn tác) | ❌ | FB 15/10 #2 | — | Chờ khách trả lời câu 2, 3, 4, 6 (`REPORT/16102026/CLAUDE/PLAN_GIAI_PHAP_SUA_NHIEU_LICH_16102026.md`) |
| "Chọn lịch → chọn tất cả trong tháng"; nút **Xoá đơn** từ lịch | ✅ | FB 15/10 (1910-11) | `schedule/page.tsx:367,413` | [KIỂM LOCAL] 22/10 |
| Ô chọn đơn **gõ để tìm** (nhiều từ, bỏ dấu); nhóm Chưa lên lịch / Đã lên lịch; dùng chung ở Xếp máy và Chi tiết | ✅ | FB 22/10 chị Dung ý 1–2 | `lib/schedule/orderChoiceSearch.ts`, `OrderChoicePicker.tsx` | [KIỂM LOCAL] 22/10 |
| **Xếp chung** nhiều dòng cùng quy cách (PI + khổ + GSM + màu + loại lưới) cùng máy, cùng ngày → 1 thanh "PI · N dòng · X m"; dời/chuyển cả nhóm | ✅ | FB 22/10 chị Dung ý 3 (HSIA 642 m) | `lib/schedule/specGroup.ts`, `api/assignments/route.ts:110-215`, `assignmentLock.ts` | [KIỂM LOCAL] 22/10 + [KIỂM PROD] 26/10 |
| Máy hư khi **nhóm** đang chạy: tính đã dệt / còn lại cấp nhóm, chia từng dòng, chuyển cả nhóm 1 transaction | ✅ | Review 26/10 (R-8) | `lib/schedule/groupSplit.ts`, `api/assignments/split/route.ts` | [KIỂM PROD] 26/10 (642 → 500 + 142) |
| Chia sản lượng dệt khi nhiều dòng chung máy/ngày (theo mét) | ✅ | FB 22/10 + R-1 | `lib/schedule/outputShare.ts`, `api/knitting/progress` | [KIỂM PROD] 26/10 |
| Lịch cũ đã lưu **không tự gộp** thành nhóm | ⏸ chủ ý | Chốt 22/10 | — | HSIA 26HSIA1001 trên M-014 vẫn 3 ô; chị Dung gỡ rồi xếp lại |
| Thanh giữ chỗ dạng nhóm ghi "N dòng · X m" (U-1); điền sẵn mét khi xếp 1 dòng (U-2); 409 nói trùng PI/ngày nào (U-3) | ❌ | Backlog UX | — | 03 |

## 4. Nguyên liệu / Sản lượng — trang `/materials` (5 tab)
| Tính năng | TT | Nguồn | Code chính | Bằng chứng |
|---|---|---|---|---|
| 5 tab HDPE / Extruder / Warping / Knitting / Rolling (gộp Đóng gói); ẩn tab Korea & Khác | ✅ | MoM §3.3 | `app/materials/page.tsx:126,217` | [KIỂM PROD] |
| Bảng HDPE giống Excel (First / In / Broken / Xuất Tape / Reject / Out Useing / Last / AD / check), xem theo ngày, lịch sử nhiều kỳ | 🟡 | MoM §3.1 | `HDPETab.tsx`, `api/materials*`, `lib/excel/parseMaterialReport*.ts` | [KIỂM PROD] dữ liệu thật T4+T5 nạp 19/10. Cột THỰC TẾ không làm |
| Phân loại nguyên sinh / tái chế / hạt màu; MB có màu, ITEM, hãng, độ bền màu | 🟡 | MoM §3.2 | `subGroup`, `lightFastness` (migration 08/10) | ITEM/tên màu còn trong JSON snapshot, chưa tách cột |
| Import sản lượng Extruder, Warping, Knitting tổng, Knitting Detail, Rolling, Đóng gói | ✅ | MoM §3.3 | `Import*Modal.tsx`, `api/{extruder,warping,knitting}/*`, `api/materials/{rolling,packing}/*` | [KIỂM PROD] TESO nạp thử T4/T5. **Khách chưa nhập dữ liệu tháng 10** |
| Vật tư xuất theo PI | ✅ | MoM §3.4 (O04 = ghi PI trên phiếu xuất) | 0810-16 | [ĐỌC CODE] |
| **Tổng hợp sản lượng các công đoạn theo PI** | ⏸ | MoM §3.4 (H1) | — | File khách không có cột PI (0/1.590 dòng Knitting Detail gắn được PI). Anh Trí chốt hoãn 09/10 |
| UI đồng bộ design system, phân trang, số kiểu VN | ✅ | Nợ kỹ thuật 1810-01/02a/05 | — | [KIỂM LOCAL] 19/10 |

## 5. Chung
| Việc | TT | Ghi chú |
|---|---|---|
| Đăng nhập / phân quyền | ⏸ | Quyết định D2 09/10: chưa làm trong Phase 1 |
| Báo cáo (Reports), Cài đặt (Settings) | ❌ | Menu ghi "Phase 2" (`components/layout/SideNav.tsx:28-29`) |
| Responsive 768 px, focus/keyboard modal | 🟡 | Đã làm nhiều đợt (29A, 1810-02a); Orders ở 768 còn tràn ngang (card 1810-02b) |
