# SNY Planner Tool — 2-Week Timeline (Phương án Z)

> Module 1 functional + Module 2/3 mock → Enduser test 6/6
> Owner: Tung (freelance dev for TESO)
> Created: 23 May 2026

---

## ⚠️ Disclaimer bắt buộc (đọc trước)

Phương án này build **Module 1 chạy thật** và **Module 2 + 3 dạng mock (UI click-through, CHƯA có logic tính)**. Mục đích: cho enduser SNY xem toàn cảnh luồng 3 module và góp ý sớm — không phải bàn giao 3 module hoàn chỉnh.

**M2 và M3 phải hiển thị nhãn rõ trên màn hình:** `BẢN MOCK — CHƯA CÓ LOGIC TÍNH`. Nếu thiếu nhãn này, enduser sẽ hiểu nhầm hệ thống đã xong → kỳ vọng sai → rủi ro mất niềm tin khi build thật.

---

## Đối chiếu với TESO milestone

| Module | TESO commit (Project brief) | Phương án Z này |
|---|---|---|
| M1 — Production Order | 15/5 → 29/5 functional | ✅ Tuần 1 (23–30/5) functional |
| M2 — Machine Schedule | 1/6 → 15/6 functional | 🟡 Tuần 2 mock trước, functional vẫn theo TESO 1–15/6 |
| M3 — Material | 16/6 → 30/6 functional | 🟡 Tuần 2 mock trước, functional vẫn theo TESO 16–30/6 |
| Demo round 1 (TESO) | 1–2/7 | — |

**Điểm cần TESO xác nhận:** Enduser test 6/6 là **test luồng UI sớm** (early feedback), KHÔNG thay thế Demo Round 1 chính thức của TESO (1–2/7). M2/M3 functional vẫn build theo đúng timeline TESO sau ngày 6/6.

---

## Tuần 1 (23 – 30/5) — Module 1 Functional

Theo plan 6 sprint đã có (xem `ROADMAP.md`). Tóm tắt:

| Sprint | Việc | Done = |
|---|---|---|
| S0 | Setup Next.js + Prisma + Postgres + NextAuth, implementation plan | App chạy, login admin |
| S1 | PO CRUD 29 fields, list/filter/search, auto-compute SQM + weight | Case A pass (270×4×50, GSM 165 → 8,910 kg) |
| S2 | Công thức Work Order: sợi/beam, mét/beam, kg chỉ/beam | Case B/C/D pass (142 sợi; 8,482m; 38.08kg) |
| S3 | Excel import 100 PO + export Work Order | Import thật 0 lỗi |
| S4+S5 | Audit log, permission, harden, demo prep | 12 test case pass |

**Kết tuần 1:** M1 functional, nhập PO thật → tính ra Work Order thật.

---

## Tuần 2 (31/5 – 5/6) — Module 2 + 3 Mock + Integration

### M2 — Lịch máy (MOCK)

**Làm:**
- Grid 40 máy (rows) × ngày trong tháng (cols)
- Click cell → chọn 1 PO từ M1 (data thật) → gán vào → cell hiện mã PO + GSM/Width
- Nhãn `BẢN MOCK` rõ trên đầu màn hình

**KHÔNG làm (để build thật sau, theo TESO 1–15/6):**
- ❌ Revision logic (lưu nhiều phiên bản lịch)
- ❌ Conflict detection (2 PO trùng máy)
- ❌ Tính năng suất máy thật
- ❌ Compare revisions

**Mục đích:** Enduser thấy "lịch máy sẽ trông và thao tác thế này", góp ý layout + luồng trước khi build logic thật.

### M3 — Nguyên liệu (MOCK)

**Làm:**
- Form nhập tồn kho nguyên liệu (HDPE, Masterbatch, FR...)
- Bảng hiển thị: nhu cầu (số giả lập) vs tồn kho → cảnh báo "thiếu X kg" dạng tĩnh
- Nhãn `BẢN MOCK` rõ

**KHÔNG làm (build thật sau, theo TESO 16–30/6):**
- ❌ Tính nhu cầu thật từ đơn hàng + công thức nhựa
- ❌ Logic 5 loại nhựa MF/UV/FR/IR
- ❌ Liên kết tồn kho thật với PO

**Mục đích:** Enduser thấy "cảnh báo nguyên liệu sẽ trông thế này", confirm thông tin cần hiển thị.

### Integration (4–5/6)

- 1 navigation chung cho 3 module
- Login chung (role từ M1)
- Seed demo data: 20–30 PO mẫu, vài máy có lịch, vài cảnh báo nguyên liệu giả
- Kịch bản test cho enduser

---

## Mốc 6/6 — Enduser Test

**Format đề xuất:** 1–1.5h, tại xưởng SNY hoặc Google Meet.

**Luồng test:**
1. Enduser login (role Planner)
2. **M1 (thật):** nhập 1 PO mới → xem hệ thống tính ra Work Order → so với cách tính tay
3. **M2 (mock):** xem grid lịch máy, thử gán 1 PO vào máy → góp ý thao tác
4. **M3 (mock):** xem cảnh báo nguyên liệu → confirm thông tin cần thiết

**Tiêu chí "test thành công":**
- M1: kết quả tính khớp Excel của planner (sai số ≤ ngưỡng SNY chấp nhận)
- M2/M3: enduser hiểu được luồng, đưa ra ≥ 3 góp ý cụ thể về layout/thông tin

---

## Bộ câu hỏi cho buổi enduser test 6/6

### Trước buổi test — hỏi SNY/TESO

| # | Câu hỏi | Cần ai |
|---|---|---|
| 1 | Ai sẽ là enduser test? (planner nào, tổ trưởng, hay quản lý?) Cần đúng người đang làm thật | SNY |
| 2 | Test tại xưởng hay online? Enduser dùng máy tính hay tablet? | SNY |
| 3 | Enduser có mang theo 1–2 đơn hàng thật để nhập thử M1 không? | SNY |
| 4 | TESO có tham gia buổi test không, hay chỉ Tung + SNY? | TESO |

### Trong buổi — hỏi enduser về M1 (functional)

| # | Câu hỏi |
|---|---|
| 5 | Nhập PO trên hệ thống so với điền Excel — nhanh/chậm hơn? Chỗ nào vướng? |
| 6 | Work Order hệ thống tính ra có khớp cách anh/chị tính tay không? Sai chỗ nào? |
| 7 | Thiếu trường thông tin nào mà file Excel cũ có không? |
| 8 | Filter/search có tìm được PO cần không? Thiếu bộ lọc nào? |

### Trong buổi — hỏi enduser về M2/M3 (mock)

| # | Câu hỏi |
|---|---|
| 9 | Grid lịch máy này có giống cách anh/chị đang xếp lịch trên Excel không? Khác chỗ nào? |
| 10 | Khi gán đơn vào máy, anh/chị cần thấy thông tin gì trên ô lịch? (mã đơn, GSM, deadline...?) |
| 11 | Cảnh báo nguyên liệu cần hiển thị gì để anh/chị quyết định đặt hàng? |
| 12 | Nếu xây thật, anh/chị muốn M2 hay M3 ưu tiên trước? |

### Sau buổi — Tung tự đánh giá

| # | Câu hỏi |
|---|---|
| 13 | M1 có lỗi tính toán nào lộ ra khi enduser nhập đơn thật không? |
| 14 | Góp ý nào cần đưa vào trước khi build M2/M3 functional (theo TESO 1–30/6)? |
| 15 | Có scope creep tiềm ẩn nào enduser đề xuất không? Ghi vào backlog, đừng nhận ngay. |

---

## Risks phương án Z

| Risk | Mitigation |
|---|---|
| Enduser tưởng M2/M3 đã xong | Nhãn `BẢN MOCK` cứng trên màn hình + nói rõ đầu buổi test |
| Enduser test 6/6 thấy lỗi → mất niềm tin | M1 phải verify 4 case A/B/C/D trước, không demo khi chưa pass |
| Mock M2/M3 ngốn thời gian → M1 chưa harden | M1 ưu tiên tuyệt đối tuần 1; mock chỉ làm khi M1 đã pass test |
| TESO không biết kế hoạch test 6/6 | Email TESO xác nhận trước, có văn bản |

---

## Dependency hard — chưa giải quyết

> **2 câu hỏi TESO Tung CHƯA xác nhận (từ turn trước):**
> 1. TESO có approve nén lịch + cho enduser test sớm 6/6 không?
> 2. Rủi ro reputation nếu enduser test thấy lỗi thuộc về ai (Tung freelance hay TESO vendor)?
>
> **Phải giải quyết trước khi bắt đầu tuần 2.** Không có ack TESO = đi mù.

---

*Tung — 23 May 2026 — Phương án Z*
