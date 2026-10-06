/**
 * Tách thư mục build của dev khỏi production.
 *
 * Lý do: mặc định CẢ `next dev` và `next build` đều ghi vào `.next`.
 * Khi chạy `npm run build` trong lúc dev server đang phục vụ, dev compiler
 * dọn chunk cũ đi nhưng `webpack-runtime.js` vẫn giữ tên file đã bị xoá
 * → `Cannot find module './<chunkId>.js'` (MODULE_NOT_FOUND), mọi trang trả 500.
 *
 * - `next dev`   → NODE_ENV=development → `.next-dev` (thư mục tự huỷ, xoá thoải mái)
 * - `next build` → NODE_ENV=production  → `.next` (giữ nguyên output cho start/deploy)
 *
 * Hai lệnh giờ không bao giờ đụng cùng một thư mục.
 */
const isProduction = process.env.NODE_ENV === 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || (isProduction ? '.next' : '.next-dev'),
}

export default nextConfig
