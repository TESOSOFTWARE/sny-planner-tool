# SNY DESIGN.md — contract vibecode (Antigravity)

Nguồn thật: `tailwind.config.ts` + `src/app/globals.css` + `src/app/layout.tsx`. Mọi màu/font/spacing trong code phải trace về token dưới đây.

## 1. Tokens
- `primary #002444`, `primary-container #1b3a5c`, `on-primary #ffffff`
- `background/surface #fbf9f8`, `surface-lowest #ffffff`, `low #f6f3f2`, `container #f0eded`, `high #eae8e7`
- `on-surface #1b1c1c`, `on-variant #43474e`, `outline #73777f`, `outline-variant #c3c6cf`
- `error #ba1a1a`, `error-container #ffdad6`
- Radius 2/4/8/16px. Spacing xs4/sm8/md16/lg24/xl40, gutter16, container-margin32.
- Type: Inter (UI) + Noto Sans KR (tiếng Việt phụ), scale display32/headline24-20/body16-14/label13-12/mono13. Icon duy nhất Material Symbols Outlined.

## 2. Primitives (copy-nearby, không thêm lib phase này)
- Button primary/outline/danger `h-9 px-4 rounded-md text-sm`, icon 18px đi kèm.
- Table dense `text-xs`, header uppercase label-sm, zebra `surface-lowest/low`, sticky col đầu + thead.
- Modal `max-w-md/4xl rounded-xl border outline-variant shadow-lg`, header sticky + backdrop `black/40 blur-sm`, Esc đóng, focus trap.
- Badge: status + `📌 Nháp dashed amber` cho placeholder. Màu PI: inline `style` từ `getPiColorStyle()`, không class động.
- Input `h-10 rounded-lg border-outline`, focus `border-primary ring-1`, số `font-mono tabular-nums vi-VN`, ngày `dd/MM/yyyy`.

## 3. States + a11y
- Loading: skeleton grid/table, không chữ pulse trơ. Error: banner `error-container` + message Việt + retry. Empty: icon + CTA tạo/import.
- Mọi ô/nút focus được bằng Tab, ô grid `role=gridcell` + Enter/Space, modal Esc + trả focus về trigger.
- Không emoji-icon. Motion chỉ `transform/opacity`, có nghĩa mới animate.
