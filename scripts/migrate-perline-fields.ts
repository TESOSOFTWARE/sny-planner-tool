// scripts/migrate-perline-fields.ts
// Backfill script for per-line fields migration.
//
// WHAT IT DOES:
//   meshType, needleCount, beamCount were previously shared per PI Number.
//   After migration they are stored per sub-line.
//   Existing rows already HAVE these values in the DB (they were written per-row
//   by the old form even though the UI showed them as "shared").
//   → No data backfill needed for those fields.
//
//   eyeletLines, eyeletSpec are NEW fields → always null for existing rows.
//   → No backfill needed (null is the correct default for existing data).
//
// WHAT IT VALIDATES (--dry-run mode):
//   Checks that all existing rows have gsm > 0 (required after migration).
//   Prints a summary of how many rows have meshType / needleCount / beamCount set.
//
// HOW TO RUN:
//   # Dry run (safe, read-only):
//   npx tsx scripts/migrate-perline-fields.ts --dry-run
//
//   # (No actual write step needed — the schema migration is additive only)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const isDryRun = process.argv.includes('--dry-run')

async function main() {
  console.log('='.repeat(60))
  console.log('Per-Line Fields Migration Audit')
  console.log(isDryRun ? '  MODE: dry-run (read-only)' : '  MODE: live (no writes needed for this migration)')
  console.log('='.repeat(60))

  // ── 1. Count all orders ────────────────────────────────────────────────────
  const total = await prisma.productionOrder.count()
  console.log(`\nTotal production_orders rows: ${total}`)

  // ── 2. Validate gsm > 0 ───────────────────────────────────────────────────
  const badGsm = await prisma.productionOrder.count({
    where: { gsm: { lte: 0 } }
  })
  if (badGsm > 0) {
    console.error(`\n⚠  ${badGsm} rows have gsm <= 0 — these will fail validation after migration!`)
    const examples = await prisma.productionOrder.findMany({
      where: { gsm: { lte: 0 } },
      select: { id: true, piNumber: true, subLineIndex: true, gsm: true },
      take: 5,
    })
    console.table(examples)
  } else {
    console.log('✔  All rows have gsm > 0')
  }

  // ── 3. Summarise per-line tech spec coverage ──────────────────────────────
  const hasMeshType    = await prisma.productionOrder.count({ where: { meshType:    { not: null } } })
  const hasNeedleCount = await prisma.productionOrder.count({ where: { needleCount: { not: null } } })
  const hasBeamCount   = await prisma.productionOrder.count({ where: { beamCount:   { not: null } } })
  const hasEyelet      = await prisma.productionOrder.count({ where: { hasEyelet:   true } })
  const hasEyeletLines = await prisma.productionOrder.count({ where: { eyeletLines: { not: null } } })
  const hasEyeletSpec  = await prisma.productionOrder.count({ where: { eyeletSpec:  { not: null } } })

  console.log('\nPer-line field coverage (existing data):')
  console.table([
    { field: 'meshType',    rows_with_value: hasMeshType,    pct: pct(hasMeshType, total) },
    { field: 'needleCount', rows_with_value: hasNeedleCount, pct: pct(hasNeedleCount, total) },
    { field: 'beamCount',   rows_with_value: hasBeamCount,   pct: pct(hasBeamCount, total) },
    { field: 'hasEyelet',   rows_with_value: hasEyelet,      pct: pct(hasEyelet, total) },
    { field: 'eyeletLines', rows_with_value: hasEyeletLines, pct: pct(hasEyeletLines, total) },
    { field: 'eyeletSpec',  rows_with_value: hasEyeletSpec,  pct: pct(hasEyeletSpec, total) },
  ])

  // ── 4. Verify new schema columns exist ────────────────────────────────────
  // If eyeletLines/eyeletSpec columns exist in DB, this query will succeed.
  try {
    const sample = await prisma.productionOrder.findFirst({
      select: { id: true, eyeletLines: true, eyeletSpec: true },
    })
    console.log('\n✔  eyeletLines + eyeletSpec columns exist in DB')
    if (sample) {
      console.log(`   Sample row ${sample.id}: eyeletLines=${sample.eyeletLines}, eyeletSpec=${sample.eyeletSpec}`)
    }
  } catch (e) {
    console.error('\n✗  eyeletLines/eyeletSpec columns NOT found in DB — run: npx prisma db push')
    console.error(e)
  }

  console.log('\n' + '='.repeat(60))
  console.log('Migration audit complete. No write operations needed.')
  console.log('Next step: npx prisma db push (if not already done)')
  console.log('='.repeat(60))
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%'
  return `${((n / total) * 100).toFixed(1)}%`
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
