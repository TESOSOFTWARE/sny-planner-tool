// scripts/clear-knitting.ts
// One-shot script: xóa toàn bộ KnittingDailyOutput table.
// Chạy: npx tsx scripts/clear-knitting.ts
// Mục đích: clear data test sai trước khi import lại sau khi fix parser.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const before = await prisma.knittingDailyOutput.count()
  console.log(`[clear-knitting] Records hiện có: ${before}`)

  if (before === 0) {
    console.log('[clear-knitting] Table đã rỗng, không cần xóa.')
    return
  }

  const result = await prisma.knittingDailyOutput.deleteMany({})
  console.log(`[clear-knitting] Đã xóa: ${result.count} records ✓`)

  const after = await prisma.knittingDailyOutput.count()
  console.log(`[clear-knitting] Records còn lại: ${after}`)
}

main()
  .catch((e) => { console.error('[clear-knitting] ERROR:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
