---
name: sny-schedule-ui
description: Audit/fix UI /schedule SNY cho planner Excel — grid 40x31 memo + sticky + keyboard, overlap PI rõ ràng, Assign search, Detail đồng bộ Việt, import UTC-safe. Dùng khi chạm app/schedule, components/schedule, lib/colors, api/assignments.
version: 1.0.0
---

# SNY Schedule UI — Antigravity

Đọc `../sny-context/SKILL.md` + `../../references/DESIGN.md` + `../../references/PATTERNS.md` trước khi sửa.

## Trigger
- Chạm `src/app/schedule/*`, `src/components/schedule/*`, `src/lib/colors.ts`, `src/app/api/assignments/*`, `src/app/api/schedule/*`.

## Must do
1. Grid `page.tsx`: memo map `machineId|date → assignments` (O(N+1240), không O(1240×N)), không `new Date` trong loop, sticky `thead` + frozen cột Machine, skeleton khi load, ô là `button role=gridcell` focus được + Enter/Space, giữ inline PI color.
2. Overlap: badge `+N` click-through ra list, 409 kèm `PI chiếm + khoảng ngày`. Giữ boundary inclusive + TZ `+07:00`.
3. AssignModal: search PI/khách/màu/khổ trong select, giữ label giàu `PI·Dòng·width·màu·gsm` + panel chi tiết, hint mét còn lại, check khổ máy vs khổ vải, gợi ý end-date, Esc đóng.
4. DetailModal: full tiếng Việt, dropdown giàu như Assign, cho sửa `allocatedMeters/estimatedDailyOutput`, bỏ `confirm()` native → modal hệ thống, fix class `warning-*` không tồn tại, `MACHINES` ra const.
5. ImportScheduleModal: bỏ default sheet cứng `20.7.2026`, parse date qua `serialToDate()` UTC-safe, hiện `skippedInvalid`, báo rõ `.xlsb`, hiện `protectedCount` ở success. Preview không write; confirm revalidate + snapshot `ScheduleImportLog`.

## Must not do
- Không đổi token Korean minimal, font, radius. Không chuyển PI color sang class động.
- Không gộp `KnittingDailyOutput/Detail`. Không đoán SMALL/BIG Rolling. Không xóa assignment cũ đã có `dailyMeters > 0`.
- Không thêm dep (TanStack/cmdk/sonner) ở phase này. Không `as any`/supress type để pass.

## File map
- Grid: `src/app/schedule/page.tsx`
- Modals: `src/components/schedule/AssignModal.tsx`, `DetailModal.tsx`, `ImportScheduleModal.tsx`, `AssignFromOrderModal.tsx`
- Logic: `src/lib/colors.ts`, `src/app/schedule/actions.ts`, `src/app/api/assignments/route.ts`, `src/app/api/schedule/import*/route.ts`
