---
name: sny-handover
description: Viết hoặc cập nhật báo cáo bàn giao phiên làm việc SNY theo template cố định, ngắn gọn. Dùng khi kết thúc phiên dài, trước khi đổi nhánh/PR, hoặc khi user yêu cầu handover.
---

# SNY Handover

Mục tiêu: phiên sau đọc ≤ 2 phút là tiếp tục được. Tối đa ~60 dòng; chi tiết dẫn link file, không chép code.

## Thu thập (lệnh thật, không viết theo trí nhớ)
```powershell
git branch --show-current
git log --oneline develop..HEAD
git diff --cached --stat | Select-Object -Last 1
git status --short
```

## Template — `workflows/context/handover-YYYY-MM-DD.md`
```markdown
# Handover YYYY-MM-DD — <nhánh>
## Trạng thái
- Nhánh / base / commits (hash + 1 dòng) / staged N file / unstaged N file
## Đã xong (kèm bằng chứng)
- <yêu cầu/mã> — <file chính> — verify: <lệnh + kết quả>
## Đang dở
- <việc> — <file> — bước tiếp theo cụ thể
## Quyết định đã chốt
- <quyết định> — nguồn (MOM/chat/plan mục …)
## Rủi ro & chưa test
- …
## Việc tiếp theo (theo thứ tự)
1. …
```

## Quy tắc
- Chỉ ghi "Hoàn thành" khi có bằng chứng verify; còn lại ghi "Đã code, chưa verify".
- Không ghi secret, connection string, dữ liệu khách nhạy cảm.
- Cập nhật file cùng ngày thay vì tạo file mới; handover cũ giữ nguyên làm lịch sử.
