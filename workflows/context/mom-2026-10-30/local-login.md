# M30-09 — Đăng nhập local

Yêu cầu đã chốt ngày 09/11/2026: email + mật khẩu; chưa phân role. User đăng nhập có cùng quyền nghiệp vụ.

Đã áp **migration SQL** `prisma/sql/20261109_local_login.sql` lên `127.0.0.1:55432/sny_planner_local`, tạo `sny_users` và `sny_sessions`. Không chạy trên DB khách. File rollback nằm cùng thư mục SQL; rollback xóa tài khoản/phiên và chỉ dùng sau khi đã gỡ code auth.

Mật khẩu dùng scrypt + salt; cookie HttpOnly/SameSite=Lax, Secure khi production; phiên hết hạn sau 8 giờ và bị thu hồi khi đăng xuất. Sai mật khẩu 5 lần làm khóa tạm 15 phút theo tài khoản. Cần rate limiting phân tán ở hạ tầng trước khi mở dịch vụ rộng rãi; hiện chưa có reset mật khẩu hay quản trị user trên web.

## Tạo tài khoản của bạn

Chạy từ root repo trong terminal tương tác:

```bash
node --env-file=.env.local --import tsx scripts/create-local-user.ts
```

Nhập email và mật khẩu 12–128 ký tự; mật khẩu được nhập ẩn. Script chỉ chấp nhận database tên `sny_planner_local` ở localhost. Không có tài khoản/mật khẩu mặc định được commit. Mọi tài khoản test đã được dọn sau kiểm tra.

## Bằng chứng

- TypeScript đạt sau khi thêm auth.
- Test mật khẩu/phiên: salt khác nhau, mật khẩu sai, cookie hỏng/hết hạn, kiểm nguồn request.
- `scripts/check-local-login.ts`: tạo tài khoản random local, kiểm API không phiên, redirect trang, login, HttpOnly cookie, CSRF, logout revocation, lockout; dọn trong finally; PASS.
- Suite cuối: **209/209 PASS**, gồm các test trong thư mục `[id]` chạy bằng danh sách file tường minh. `npm test` qua CLI tsx bị sandbox chặn IPC, nên đã chạy `node --import tsx --test` trên mọi file `src/**/*.test.ts`.
- Kiểm cấu trúc AST: 71 route nghiệp vụ / 85 handler có guard đầu hàm. 9 server page và Server Action lịch máy kiểm phiên trước truy vấn; layout kiểm lại phiên cho các màn client.
- Browser thật: đăng nhập, Reports, màn sản lượng 768 px và đăng xuất đã đi qua; dữ liệu local rỗng. Ảnh trong `/private/tmp/sny-reports-1280.png` và `/private/tmp/sny-production-768.png`.
- Bản cuối: **209/209 test PASS**, typecheck PASS, `npm run build` exit 0. Next báo thiếu ESLint nên lint chưa chạy; doc gate chưa chạy được vì checkout thiếu `scripts/harness-lint.mjs`.
- Script tạo user đã thử qua terminal tương tác, mật khẩu không echo; dọn đúng user test sau kiểm tra. `prisma migrate diff` với local trả “No difference detected”.
- Dev server cuối đang dùng port 3000, nạp `.env.local` tường minh. Các user thật chưa được tạo; chạy CLI ở trên để đặt tài khoản của bạn.

Chưa deploy, chưa nghiệm thu SNY. Các SQL lịch sử khác của repo chưa được replay để dựng baseline; schema nghiệp vụ local trước đây được tạo bằng db push. Migration auth mới đã thực thi bằng SQL thật, không đại diện lịch sử đầy đủ của schema cũ.
