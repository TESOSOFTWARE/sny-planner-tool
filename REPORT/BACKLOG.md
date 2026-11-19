# Backlog

## Active

- [ ] **M30-05-UI-01 — Đưa Sản lượng vào thanh trạng thái Production Orders.** Ref: [MoM 30/10 §2] + yêu cầu vị trí UI 12/11. Task card: [production-orders-output-view-tab](2026-11-12/CLAUDE/production-orders-output-view-tab.md). Status: inline view local, typecheck/build PASS; browser role/viewport QA pending.
- [ ] **M30-05-UI-02 — Tra cứu hành trình và bàn giao sản xuất theo PI.** Ref: MoM 30/10 §2, §4 + feedback khách 12/11. Plan: [production-stage-journey-plan](2026-11-16/CLAUDE/production-stage-journey-plan.md). Bàn giao WIP nằm ở mục navbar riêng; browser flow đã chạy trên DB test cô lập; 225 test pass. Chưa chạy migration production. Còn chờ file đóng gói SNY có PI/item để đối soát actual.

## Planned

## G. File locks

| Task | Owner | Locked files | Status |
|---|---|---|---|
| M30-05-UI-01 | Codex | `src/app/orders/page.tsx`, `src/components/orders/OrderTable.tsx` | In progress |
