---
name: sny-api-data
description: Review và implement API, validation, Prisma và code truy cập DB của SNY. Dùng khi chạm src/app/api, actions, src/lib/validations, Prisma schema/query, transaction, status/error contract hoặc bất kỳ truy cập DB nào.
---

# SNY API and data

Luật cứng ở `AGENTS.md`; domain đầy đủ ở `.agents/references/RULES-DETAIL.md` mục "API, database and Excel changes". Không lặp lại ở đây.

## Required checks
1. Xác định route method, nguồn input, validation (Zod ở `src/lib/validations/**`), response shape, status codes và error handling.
2. Giữ đọc/ghi DB trong scope đã duyệt. Không chạy query DB thật, seed, backfill hay migration khi verify.
3. Với mutation: kiểm transaction boundary, concurrency/unique constraint, idempotency, retry. Nêu rõ lỗi giữa chừng có để lại ghi dở không.
4. Giữ quy tắc timezone/date, độ chính xác Decimal, validation server-side và contract lỗi tiếng Việt.
5. Thiếu auth/authorization/CSRF/rate limit: ghi rõ là ranh giới hiện tại; không tự bịa cơ chế bảo mật.
6. Trace consumer: UI component, parser, test nào dùng response này trước khi đổi shape.

## Verification
`npm run typecheck` → `npm run test` (file test đích) → `npm run build`. Báo riêng tool không có sẵn và lỗi đã tồn tại trước.
