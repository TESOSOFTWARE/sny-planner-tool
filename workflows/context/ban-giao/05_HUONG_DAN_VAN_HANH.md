# 05 — Hướng dẫn vận hành: chạy, test, kiểm thật, deploy

⚠️ Mọi lệnh có `--env-file` đều nối vào **DB production**. Đọc `00` mục 3–4 trước.

## 1. Chạy local
```bash
cd D:/TESO/BACKEND/DEV/SNY/sny-planner-tool-fb-1910      # nhánh mới nhất
npm install                                              # nếu chưa có node_modules
# Dev (nặng RAM):
node --env-file=../sny-planner-tool/.env node_modules/next/dist/bin/next dev -p 3001
# Hoặc build + start (nhẹ hơn, giống prod):
NEXT_DIST_DIR=.next-claude-verify NEXT_FONT_GOOGLE_MOCKED_RESPONSES=D:/TESO/BACKEND/DEV/SNY/sny-planner-tool/test-results/1810-04/next-font-mocks.cjs \
  node --env-file=../sny-planner-tool/.env node_modules/next/dist/bin/next build
git checkout -- tsconfig.json                            # build tự sửa file này
NEXT_DIST_DIR=.next-claude-verify node --env-file=../sny-planner-tool/.env node_modules/next/dist/bin/next start -p 3001
```
- `.env` nằm ở thư mục `sny-planner-tool` (thư mục chính), không có trong git, không đọc/in nội dung.
- Thư mục chính `sny-planner-tool` hiện đang ở nhánh cũ; `npm run dev` ở đó ra **code cũ**.
- Build xong phải `prisma generate` nếu đổi schema (script `build` đã có).

## 2. Test
| Lệnh | Dùng khi |
|---|---|
| `npx tsx --test src/lib/schedule/specGroup.test.ts …` | Test file thường |
| `npx tsx "src/app/api/knitting/progress/[orderId]/route.test.ts"` | **File trong thư mục `[...]`** (đừng dùng `--test`, sẽ báo 0 test) |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Typecheck |
| `npm test` | Toàn bộ, nhưng **bỏ sót file trong `[...]`** |
| `node scripts/harness-lint.mjs` + `node --test .agents/scripts/guard.test.mjs` | Khi sửa luật/skill AI |

Bộ test route chính (local, untracked): `src/app/api/assignments/{route,split/route,swap/route,bulk-edit/route}.test.ts`, `src/app/api/knitting/progress/[orderId]/route.test.ts`. Bộ hồi quy đã commit: `*.regression.test.ts`, `src/lib/schedule/{specGroup,outputShare,orderChoiceSearch,groupSplit}.test.ts`.

## 3. Kiểm thật có ghi DB (chỉ khi anh Trí duyệt)
1. **Backup trước:** `pg_dump` bản 18 (skill `/pg-backup .env <tên> -OutDir ../REPORT/<ddMMyyyy>/CLAUDE/backup-db`). Neon là PG 18.6.
2. **Chụp mốc chỉ đọc:** số đơn, số lịch, danh sách id + `updatedAt` của lịch thật.
3. **Chỉ tạo dữ liệu PI `TEST-xxxx`** qua API của app (`POST /api/orders/multi-line`, `POST /api/assignments`).
4. **Chạy Playwright có chặn ghi:** mọi request không phải GET chỉ cho qua khi mọi id trong body thuộc data TEST; còn lại trả 418 và ghi vào danh sách vi phạm. Mẫu: `sny-planner-tool-fb-1910/test-results/claude-review/test-2610-live.cjs` (biến `BASE` để chạy local hoặc prod), `test-r1-prod.cjs`.
5. **Dọn:** `POST /api/orders/bulk-delete` với `ids` + `expectedAssignments` (id + `updatedAt`); dữ liệu ghi thẳng (ví dụ dòng sản lượng giả) xoá theo id.
6. **Hậu kiểm:** đếm lại = mốc; lịch thật không đổi `updatedAt`; 0 vi phạm; 0 lỗi console.
7. Ghi báo cáo vào `REPORT/<ngày>/CLAUDE/`. Lưu ý: route xoá/sửa hàng loạt để lại dòng `schedule_import_logs` (log hoàn tác), không ảnh hưởng dữ liệu.

## 3b. Nhập báo cáo tháng của khách (STATISTICAL REPORT) — đã làm T10 ngày 27/10
1. **Dry-run offline** trước: chạy đúng các parser của app trên file khách, không DB — `test-results/claude-review/dryrun-stat-report.ts "<file.xlsx>"`. Khách hay đổi bố cục (dòng tên công ty thành `%`, gộp ngày cuối tuần); bắt lỗi ở đây trước khi chạm DB.
2. **Xem trước trên DB (chỉ đọc)** từng phần qua route `.../import`; so số với dry-run.
3. **Backup** (`/pg-backup`) + **mốc chỉ đọc** (id + `updatedAt` các bảng đích).
4. **Xác nhận** qua route `.../import/confirm` — gọi **đúng kiểu như modal**: Knitting tổng / Rolling / HDPE gửi **file multipart** (Rolling kèm `month`, `year`, `expectedSnapshot`; HDPE kèm `resolutions`, `expectedSnapshot`); Extruder / Warping gửi **JSON `{ rows: preview.rows }`**. Script phải **cắt sheet** như trình duyệt (`prepareReportUpload`), gửi file nguyên > 4,4 MB sẽ bị Vercel trả 413. Mẫu: `import-ext-warp-t10.ts`, `import-ext-roll-warp-t10.ts`.
5. **Hậu kiểm**: dòng tháng cũ không đổi (so id), tổng tháng mới = tổng file.
6. **HDPE**: chỉ nhập sau khi khách xác nhận tên vật tư mới/đổi tên; khách bấm Ghi trên màn hình, TESO kèm. Màn xem trước báo "N vật tư sẽ cập nhật tồn"; vật tư tạo tay hoặc có phiếu tay sẽ **giữ tồn**.

## 4. Quy trình phát hành
1. Codex commit local trên `feature/fb-1910` (1 card / 1 commit), dừng.
2. Claude review: đọc diff, **tự chạy lại test + tsc (+ build nếu đụng UI)**, ghi `REPORT/<ngày>/CLAUDE/REVIEW_CODEX_<card>_<ngày>.md`.
3. Nếu thay đổi có rủi ro dữ liệu: kiểm thật bằng TEST-xxxx (mục 3).
4. Anh Trí gửi `XAC_NHAN_GITHUB` → push `feature/fb-1910` → PR vào `develop` → merge → PR `develop` → `main`.
5. **Anh Trí bấm Merge PR vào `main` trên web GitHub.** Không dùng `gh pr merge` cho `main`.
6. Kiểm: `gh api repos/TESOSOFTWARE/sny-planner-tool/commits/<sha>/status` ra `Vercel success`; `vercel ls sny-planner --prod` có bản mới; alias `sny-planner.vercel.app` trỏ bản mới; grep bundle trang liên quan có tên trường mới; đếm DB không đổi.
7. Không có deploy production sau 2 phút → `vercel promote <url bản preview cùng code>`.
8. Gửi khách hướng dẫn: trả lời **đúng câu khách hỏi**, câu hoàn chỉnh, không liệt kê tính năng khách không hỏi.

## 5. Rollback
- Code: Vercel → Deployments → Instant Rollback, hoặc revert merge trên `main` (merge bằng web). Tag mốc ở `02` mục 4.
- DB: chỉ khi có schema/dữ liệu sai; khôi phục từ dump `pg_dump` (cần anh Trí duyệt). Migration SQL từ 08/10 có file `rollback_*` tương ứng trong `prisma/sql/` (2 file tháng 9 không có).

## 6. Công cụ cần có
| Công cụ | Ghi chú |
|---|---|
| `gh` | Tài khoản có quyền write vào repo |
| `vercel` CLI | Đăng nhập tài khoản quản lý project `sny-planner` (hỏi anh Trí) |
| `pg_dump` 18 | Neon là PG 18.6; bản 17 không dùng được |
| Playwright (Node) | Có trong `node_modules` |
