---
name: sny-context
description: Context SNY Planner cho Antigravity — Next 14 + Tailwind Korean minimal + Prisma 5.22. Load khi chạm bất kỳ file nào trong sny-planner-tool.
version: 1.0.0
---

# SNY Context — Antigravity

## Project
- Root: `sny-planner-tool/`. Stack: Next.js 14.2.35 App Router, React 18, TS5, Tailwind 3.4.1, Prisma 5.22 + Neon PG.
- Layout: `TopNav 64px + SideNav 280px`, main `pl-[280px] pt-[64px] bg-background`.
- Fonts: `Inter + Noto Sans KR` via `next/font`. Icons: `Material Symbols Outlined` duy nhất. Cấm emoji-icon.
- Tokens (`tailwind.config.ts`): `primary #002444`, `background/surface #fbf9f8`, surface-container `#ffffff/#f6f3f2/#f0eded/#eae8e7`, `outline #73777f`, `error #ba1a1a`. Radius 2-4px.

## Luật
- Luật cứng: `AGENTS.md`. Domain contracts (PI multi-line, m/kg/sợi, placeholder, Output vs Detail, Rolling): `../../references/RULES-DETAIL.md` — chỉ mở mục cần.
- Nhắc nhanh các bẫy hay gặp: màu PI hash ở `src/lib/colors.ts` render inline `style`; `qtySqm/totalWeightKgs` lưu cứng; `KnittingDailyOutput` ≠ `KnittingDailyDetail`.

## User
- Chị Dung / Chị Loan (planner Excel) + BGĐ. Ưu tiên table dày, search PI/khách/màu/GSM, import preview→confirm, tải mẫu, bulk paste.
- Trả lời concise tiếng Việt.
