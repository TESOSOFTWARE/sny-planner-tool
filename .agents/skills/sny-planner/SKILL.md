---
name: sny-planner
description: Vai phân tích + lên giải pháp, KHÔNG sửa code — đối chiếu source/workbook, chốt phương án, viết task card giao bên thực thi, khoá file, review kết quả theo acceptance. Dùng khi được giao vai senior/plan, hoặc khi một agent khác đang thực thi cùng phạm vi.
---

# SNY Planner

Luật cứng và truy vết yêu cầu ở `AGENTS.md`. Skill này thay bước Execute của `sny-orchestrator` bằng giao việc + review.

## Ranh giới vai
- KHÔNG Edit/Write vào `src/**`, `prisma/**`, config, auth. Cần đổi code → viết task card.
- Được: đọc code, grep, chạy test/typecheck/lint chỉ-đọc, đọc workbook bằng parser có sẵn — để lấy bằng chứng.
- Đầu ra nằm ngoài repo: REPORT/<ngày>/CLAUDE/*.md và dòng trong REPORT/BACKLOG.md. Không sinh báo cáo khi chỉ cần sửa một dòng backlog.

## Quy trình
1. **Intake:** gắn nguồn `[MoM §x.y]` / `[NỢ KỸ THUẬT]`. Đọc backlog (cả phần cập nhật cuối file) + handoff. Báo cáo cũ là lời kể, không phải bằng chứng.
2. **Kiểm hiện trạng:** mỗi claim cần thiết → `file:line`, hoặc lệnh + kết quả. Gắn nhãn `static-source` / `test` / `runtime` / `not-run`. Claim không kiểm được thì ghi là chưa kiểm.
3. **Phân tích:** tách 3 loại: (a) làm được ngay, (b) chờ khách (câu hỏi có phương án + đề xuất), (c) chờ quyết định nội bộ (memo). Không biến tự động hoá mới thành câu hỏi chặn phần đã bàn giao (`workflows/context/business-logic-open-questions.md`).
4. **Plan:** nạp skill theo bảng định tuyến cho vùng sẽ chạm (`sny-api-data`, `sny-import-integrity`, `sny-schedule-ui`) để viết ràng buộc đúng. High-risk (schema/DB/auth/prod/xoá) → plan có rủi ro + rollback, dừng chờ duyệt.
5. **Task card:** mẫu gọn ở `.agents/skills/sny-orchestrator/references/task-card.md`; bản đầy đủ ở REPORT/TEMPLATE_TASK_CARD.md. Bắt buộc có: hiện trạng đã kiểm, quyết định đã chốt, Scope, file khoá, Out of scope, không được chạy, Acceptance đo được, lệnh Verify + kết quả mong đợi, điểm bên thực thi phải DỪNG hỏi lại.
6. **Khoá file:** trước khi giao, ghi vào backlog mục G (task, người làm, file khoá). Kiểm `git status` trên các file đó: đang có thay đổi chưa rõ chủ → hỏi user trước khi giao.
7. **Review:** đọc diff theo Acceptance từng dòng; chạy lại gate của `sny-qa` ở chế độ chỉ-đọc. Lệch → trả card kèm `file:line`, không tự sửa. Đạt → sửa dòng backlog, xoá dòng mục G.

## Bẫy đã gặp
- Hai agent cùng sửa một file → code trùng, build gãy. Luôn kiểm mục G và `git status` trước khi giao.
- Test trong thư mục `[id]` có thể bị glob của `npm test` bỏ sót → card phải ghi lệnh chạy riêng từng file.
- `grep` trong Git Bash ở máy này là alias của `rg`: không dùng `--include`, `-E`; dùng công cụ Grep.
- Prisma trả mọi cột theo schema: cột mới chưa migrate làm hỏng cả query không dùng cột đó.

## Report
- **Đã phân tích / đã viết:** file + kết luận chính.
- **Bằng chứng:** nhãn + lệnh/`file:line`.
- **Chờ ai:** khách / người chốt nội bộ / bên thực thi — kèm việc cụ thể.
