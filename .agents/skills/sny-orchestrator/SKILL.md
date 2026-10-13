---
name: sny-orchestrator
description: Điều phối mọi task trong sny-planner-tool — phân loại rủi ro, nạp đúng skill/context theo bảng định tuyến AGENTS.md, lập plan, verify qua sny-qa và report. Dùng ở đầu mọi task không phải typo hoặc chỉ đọc code.
---

# SNY Orchestrator

Luật cứng và bảng định tuyến ở `AGENTS.md`. Skill này chỉ là quy trình; không lặp luật.

## 1. Intake (≤5 dòng, nêu trong chat với task Normal trở lên)
- **Goal** · **Scope** (file/route) · **Acceptance** (đo được) · **Tier** · **Thiếu gì**.
- Tier: *Tiny* (1 file, typo, comment) · *Normal* (route/service/logic/dep) · *High-risk* (schema, DB, auth, prod, xoá, Git remote).
- Thiếu acceptance, hoặc chạm DB/schema/prod → hỏi trước, không đoán. Prompt mơ hồ → gợi ý user dùng [task-card](references/task-card.md).

## 2. Route
1. Tra bảng định tuyến trong `AGENTS.md` theo path sẽ chạm → nạp `sny-context` + skill tương ứng.
2. Domain sâu: mở đúng mục trong `.agents/references/RULES-DETAIL.md` hoặc `workflows/context/*`; không đọc cả thư mục.
3. Ghi 1 dòng: "Đã nạp: …" để user thấy context đang dùng.

## 3. Plan
- Tiny: làm luôn.
- Normal: plan 3–7 bước trong chat (file + verify từng bước).
- High-risk: artifact plan (rủi ro, file/bảng đổi, rollback) → **dừng chờ duyệt**.

## 4. Execute
- Đọc trước khi sửa (`grep_search` → `view_file` theo dòng). Diff nhỏ nhất, không refactor ngoài scope.
- Mỗi khối sửa → typecheck/test đích ngay; lỗi có sẵn trước đó ghi riêng, không fix ké.
- Log terminal > 100 dòng: lọc (`Select-String`, `Select-Object -Last 40`) trước khi đưa vào context.

## 5. Fan-out policy
- `browser_subagent`: QA UI (1280/768, keyboard, modal, import preview). Giao task kèm route, dữ liệu test, tiêu chí pass, yêu cầu ảnh.
- Subagent read-only: chỉ khi khảo sát > ~10 file độc lập song song được. Không dùng subagent để tự verify kết quả của mình.

## 6. Verify
Nạp `sny-qa`, chạy đúng gate theo loại task. Hook `.agents/hooks.json` chặn lệnh nguy hiểm — bị `deny` thì báo user, không tìm cách lách.

## 7. Report
- **Đã đổi**: file + ý chính · **Đã verify**: lệnh + kết quả thực · **Chưa test / rủi ro**.
- Phiên dài, đổi nhánh, hoặc user yêu cầu → `sny-handover`.
