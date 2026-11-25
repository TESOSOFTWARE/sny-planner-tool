# Backlog

## Active

- [ ] **M30-05-UI-01 — Đưa Sản lượng vào thanh trạng thái Production Orders.** Ref: [MoM 30/10 §2] + yêu cầu vị trí UI 12/11. Task card: [production-orders-output-view-tab](2026-11-12/CLAUDE/production-orders-output-view-tab.md). Status: inline view local, typecheck/build PASS; browser role/viewport QA pending.
- [ ] **M30-05-UI-02 — Tra cứu hành trình và bàn giao sản xuất theo PI.** Ref: MoM 30/10 §2, §4 + feedback khách 12/11. Plan: [production-stage-journey-plan](2026-11-16/CLAUDE/production-stage-journey-plan.md). Bàn giao WIP nằm ở mục navbar riêng; browser flow đã chạy trên DB test cô lập; 225 test pass. Chưa chạy migration production. Còn chờ file đóng gói SNY có PI/item để đối soát actual.
- [ ] **M30-IMP-01 — Tab import đơn hàng và báo cáo sản lượng.** Ref: [MoM 30/10 §4] + feedback 19/11/2026 + phản hồi UI 20/11/2026. OpenSpec: [production-report-import-workspace](../openspec/changes/production-report-import-workspace/). Tab import/preview/review, lịch sử phiên bản, import theo sheet và tiến độ theo PI cùng tháng đã triển khai local; bảng actual tách cột theo sheet/công đoạn và tổng trên mọi dòng lọc. Parser EXTRUDER giữ PI trong ô REMARK gộp, kể cả mã có `+`, đúng các dòng thuộc merge. Parser regression, typecheck và build pass; browser QA trên DB test vẫn chờ môi trường cô lập. Chưa query/import/migrate DB.

## Planned

## G. File locks

| Task | Owner | Locked files | Status |
|---|---|---|---|
| M30-05-UI-01 | Codex | `src/app/orders/page.tsx`, `src/components/orders/OrderTable.tsx` | In progress |
| M30-IMP-01 | Codex | `src/components/orders/ProductionRecordsWorkspace.tsx`, `src/components/orders/ProductionImportWorkspace.tsx`, `src/lib/production/importReview.ts`, `src/lib/production/importReview.test.ts`, `src/app/api/production-records/route.ts`, `src/app/api/production-records/route.test.ts`, `src/app/api/materials/import-history/route.ts`, `src/app/api/materials/rolling/import/route.ts`, `src/app/api/extruder/import/confirm/route.ts`, `src/app/api/warping/import/confirm/route.ts`, `src/app/api/knitting/detail/import/confirm/route.ts`, `src/app/api/materials/import-history/confirm.regression.test.ts`, `src/app/api/materials/rolling/rollingDateBlocks.test.ts` | In progress |
