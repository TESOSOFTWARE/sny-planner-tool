---
name: sny-qa
description: Gate verify SNY trước khi báo done — chọn gate theo loại task (doc/harness, lib, API/data, UI) và report bằng chứng thực. Load trước khi báo hoàn thành bất kỳ thay đổi nào.
version: 2.0.0
---

# SNY QA Gate

## Gate theo loại task (thiếu 1 bước = chưa done)
| Loại | Gate tối thiểu |
|---|---|
| Doc / harness | `node scripts/harness-lint.mjs`; sửa hook thì thêm `node --test .agents/scripts/guard.test.mjs` |
| Lib / logic | `lsp`/IDE diagnostics sạch trên file đã chạm + `npm run typecheck` + `npm run test` file đích |
| API / data / import | Lib gate + `npm run build`; không DB thật, không import/confirm production |
| UI | API gate + browser thật bên dưới |

## UI browser check
1. Route đã sửa ở 1280 + 768, chụp ảnh. Grid: scroll ngang/dọc; modal open/close/Esc; import preview→confirm với data test cô lập.
2. Checklist: label 100% Việt, Tab tới mọi ô/nút, focus thấy rõ, loading/skeleton, error/empty đúng, số `vi-VN`, ngày `dd/MM/yyyy`, màu PI inline không vỡ prod.

## Không làm
- Không xoá test fail để pass, không suppress type (`as any`, `@ts-ignore`).
- Lỗi lint/DB có sẵn trước: ghi riêng, không fix ké khi chưa duyệt.

## Report format
- **Đã đổi**: file + ý chính.
- **Đã verify**: lệnh + kết quả thực (pass/fail, số test, ảnh).
- **Chưa test** + rủi ro còn lại.
