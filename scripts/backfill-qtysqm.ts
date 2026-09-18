#!/usr/bin/env tsx
// scripts/backfill-qtysqm.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-time backfill: tính qtySqm + totalWeightKgs cho các đơn hàng cũ.
//
// AUDIT TRAIL: Script này được giữ lại trong repo sau khi chạy — không xoá.
// Mục đích: truy vết nếu có sai sót sau này.
//
// Sử dụng:
//   npx tsx scripts/backfill-qtysqm.ts --dry-run   ← xem trước, KHÔNG ghi DB
//   npx tsx scripts/backfill-qtysqm.ts --run        ← ghi thật (cần --run rõ ràng)
//
// Trước khi chạy --run, export CSV backup:
//   npx tsx scripts/backfill-qtysqm.ts --export-csv
//
// Yêu cầu: chạy từ thư mục gốc project (sny-planner/).
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient, Prisma } from '@prisma/client'
import { calculateOrderWeight } from '../src/lib/calculations/orderWeight'
import { writeFileSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 2 })
}

function toDecimal(v: Prisma.Decimal | null): number | null {
  return v === null ? null : Number(v)
}

// ── Export CSV backup ─────────────────────────────────────────────────────────

async function exportCsv() {
  const orders = await prisma.productionOrder.findMany({
    orderBy: [{ piNumber: 'asc' }, { subLineIndex: 'asc' }],
  })

  const header = [
    'id', 'piNumber', 'subLineIndex', 'customer', 'orderDate',
    'orderType', 'widthM', 'lengthM', 'gsm', 'qty',
    'rollLength', 'pieceLength',
    'qtySqm_before', 'totalWeightKgs_before',
    'dataSource', 'status',
  ].join(',')

  const rows = orders.map((o) => [
    o.id,
    `"${o.piNumber}"`,
    o.subLineIndex,
    `"${o.customer}"`,
    o.orderDate.toISOString().slice(0, 10),
    o.orderType,
    o.widthM,
    o.lengthM,
    o.gsm,
    o.qty ?? '',
    o.rollLength?.toString() ?? '',
    o.pieceLength?.toString() ?? '',
    o.qtySqm?.toString() ?? 'NULL',
    o.totalWeightKgs?.toString() ?? 'NULL',
    o.dataSource,
    o.status,
  ].join(','))

  const csv = [header, ...rows].join('\n')
  const filename = join(
    process.cwd(),
    `backup-orders-before-backfill-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`
  )
  writeFileSync(filename, csv, 'utf-8')
  console.log(`✅ CSV exported: ${filename}`)
  console.log(`   Rows: ${orders.length}`)
}

// ── Main backfill ─────────────────────────────────────────────────────────────

async function backfill(dryRun: boolean) {
  // Chỉ lấy các order chưa có qtySqm
  const orders = await prisma.productionOrder.findMany({
    where: { qtySqm: null },
    orderBy: [{ piNumber: 'asc' }, { subLineIndex: 'asc' }],
  })

  console.log(`\n${'═'.repeat(70)}`)
  console.log(dryRun
    ? '  DRY RUN — Không ghi vào DB. Chạy với --run để ghi thật.'
    : '  LIVE RUN — Đang ghi vào DB.')
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Tổng số đơn cần backfill: ${orders.length}\n`)

  if (orders.length === 0) {
    console.log('✅ Không có đơn nào cần backfill. Tất cả đã có qtySqm.')
    return
  }

  let updated = 0
  let skipped = 0  // không đủ field để tính

  for (const o of orders) {
    const result = calculateOrderWeight({
      orderType:   o.orderType,
      widthM:      o.widthM,
      lengthM:     o.lengthM,
      gsm:         o.gsm,
      qty:         o.qty ?? null,
      rollLength:  toDecimal(o.rollLength),
      pieceLength: toDecimal(o.pieceLength),
    })

    // Bỏ qua nếu tính ra null hoặc 0 (thiếu field quan trọng)
    if (result.qtySqm == null || result.qtySqm <= 0 || result.totalWeightKgs == null || result.totalWeightKgs <= 0) {
      console.log(`  ⚠  SKIP  ${o.piNumber}[${o.subLineIndex}] — kết quả 0 (thiếu field)`)
      skipped++
      continue
    }

    console.log(
      `  ${dryRun ? '◌' : '✓'}  ${o.piNumber}[${o.subLineIndex}]` +
      `  ${o.orderType.padEnd(6)}` +
      `  w=${o.widthM}m  gsm=${o.gsm}` +
      `  → qtySqm: NULL → ${fmt(result.qtySqm)} m²` +
      `  | kg: NULL → ${fmt(result.totalWeightKgs)} kg`
    )

    if (!dryRun) {
      await prisma.productionOrder.update({
        where: { id: o.id },
        data: {
          qtySqm:        new Prisma.Decimal(result.qtySqm.toFixed(2)),
          totalWeightKgs: new Prisma.Decimal(result.totalWeightKgs.toFixed(2)),
        },
      })
    }

    updated++
  }

  console.log(`\n${'─'.repeat(70)}`)
  if (dryRun) {
    console.log(`  DRY RUN complete.`)
    console.log(`  Sẽ cập nhật: ${updated} đơn  |  Bỏ qua: ${skipped} đơn`)
    console.log(`  Chạy với --run để ghi thật.`)
  } else {
    console.log(`  ✅ Đã cập nhật: ${updated} đơn  |  Bỏ qua: ${skipped} đơn`)
  }
  console.log(`${'─'.repeat(70)}\n`)
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--export-csv')) {
    await exportCsv()
    await prisma.$disconnect()
    return
  }

  if (args.includes('--dry-run')) {
    await backfill(true)
    await prisma.$disconnect()
    return
  }

  if (args.includes('--run')) {
    // Safety gate: phải confirm trước khi ghi DB production
    console.log('\n⚠  LIVE RUN được chọn. Đang ghi vào Neon DB production.')
    console.log('   Nếu chưa export CSV backup, Ctrl+C ngay và chạy --export-csv trước.\n')
    await backfill(false)
    await prisma.$disconnect()
    return
  }

  // Không có flag → in hướng dẫn
  console.log(`
Usage:
  npx tsx scripts/backfill-qtysqm.ts --export-csv   Export CSV backup trước
  npx tsx scripts/backfill-qtysqm.ts --dry-run      Xem trước kết quả, KHÔNG ghi DB
  npx tsx scripts/backfill-qtysqm.ts --run          Ghi thật vào DB (sau khi review dry-run)

Quy trình khuyến nghị:
  1. --export-csv   → lưu file backup-orders-before-backfill-*.csv
  2. --dry-run      → review từng dòng output
  3. --run          → ghi DB
  4. Verify bằng cách chạy lại --dry-run → phải thấy "Không có đơn nào cần backfill"
`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('❌ Script failed:', e)
  await prisma.$disconnect()
  process.exit(1)
})
