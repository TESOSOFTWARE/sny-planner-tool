# Task card — mẫu giao việc cho agent

Dán và điền; bỏ dòng không cần. Càng rõ Acceptance, agent càng ít hỏi lại và ít làm thừa.

```text
Goal:        <kết quả mong muốn, 1 câu>
Tier:        Tiny | Normal | High-risk
Scope:       <file/route/màn hình>
Out of scope:<không được đụng>
Acceptance:  <tiêu chí đo được: UI hiển thị X, API trả 409 khi Y, test Z pass>
Data:        <fixture nào; cấm DB thật | được SELECT bảng …>
Output:      code | plan | report | handover
Ref:         <MOM/handover/plan mục …>
```

Ví dụ:
```text
Goal:       AssignModal tìm được PI theo màu
Tier:       Normal
Scope:      src/components/schedule/AssignModal.tsx
Acceptance: gõ "navy" lọc ra PI có màu navy; Esc đóng; build pass
Data:       cấm DB thật
Output:     code
```
