# SNY Planner

Web app thay 4 file Excel rời của nhà máy dệt lưới **SNY VINA**: **Đơn hàng → Lịch máy dệt (40 máy) → Nguyên liệu / Sản lượng 5 công đoạn** (HDPE, kéo sợi, mắc sợi, dệt, cuộn/đóng gói). Vendor: TESO. Production: https://sny-planner.vercel.app (khách đang dùng thật).

## Người mới: đọc theo thứ tự
1. **[`workflows/context/ban-giao/00_DOC_TRUOC.md`](workflows/context/ban-giao/00_DOC_TRUOC.md)** — dự án, nhánh, môi trường, luật bắt buộc. Rồi 01 → 05 trong cùng thư mục:
   - `01_TRANG_THAI_TINH_NANG.md` — tính năng nào đã có, mức kiểm.
   - `02_NHAT_KY_PHAT_HANH.md` — PR, commit, tag mốc quay lại.
   - `03_VIEC_DANG_MO.md` — việc tiếp theo, ai chặn.
   - `04_QUYET_DINH_VA_BAY.md` — quyết định đã chốt, bẫy kỹ thuật.
   - `05_HUONG_DAN_VAN_HANH.md` — chạy, test, nhập báo cáo khách, phát hành, rollback.
2. **[`AGENTS.md`](AGENTS.md)** — luật làm việc của repo (cho cả người và AI).
3. Nghiệp vụ sâu: [`workflows/context/README.md`](workflows/context/README.md); spec từng tính năng: `docs/specs/`.

## Cảnh báo trước khi chạy
- **Localhost dùng chung DB production.** Chạy app ở máy là thao tác thật trên dữ liệu khách. Mọi ghi DB cần lead duyệt và backup trước (`05_HUONG_DAN_VAN_HANH.md` mục 3).
- **Merge vào `main` bằng nút trên web GitHub.** Merge qua API (`gh pr merge`) không kích hoạt deploy production trên Vercel.
- `.env` không có trong repo; xin lead.

## Stack và lệnh
Next.js 14.2 (App Router) · TypeScript · Tailwind 3.4 · Prisma 5.22 · PostgreSQL 18.6 (Neon) · xlsx · zod.

```bash
npm install
npm run dev                 # http://localhost:3000 — DB production!
npm run build               # prisma generate + next build
npx tsx --test <file>       # test; file trong thư mục [id]/[orderId]: npx tsx "<file>"
npx tsc --noEmit            # typecheck
```
Migration là file SQL tay trong `prisma/sql/` (có `rollback_*`), không dùng `prisma migrate`.
