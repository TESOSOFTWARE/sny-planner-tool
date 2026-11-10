// [MoM 30/10 §4] Local-only, additive demo seed. Never deletes records.
// Run: node --env-file=.env.local --import tsx scripts/seed-mom-3010-demo.ts --apply
import { PrismaClient } from '@prisma/client'

const PI = 'TEST-M30-001'
const CUSTOMER = 'TEST CUSTOMER - MOM 30/10'
const DATE = new Date('2026-11-09T00:00:00.000Z')
const ATTACHMENT_ID = 'test-m30-attachment-001'
const prisma = new PrismaClient()

function ensureLocalTarget() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  if (url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/sny_planner_local') {
    throw new Error('Seed bị từ chối: chỉ cho phép 127.0.0.1:55432/sny_planner_local.')
  }
  if (!process.argv.includes('--apply')) throw new Error('Seed bị từ chối: cần truyền --apply.')
}

async function main() {
  ensureLocalTarget()
  const expectedTables = await prisma.$queryRaw<Array<{ plans: string | null; entries: string | null; attachments: string | null }>>`
    SELECT to_regclass('public.production_output_plans')::text AS plans,
           to_regclass('public.manual_production_entries')::text AS entries,
           to_regclass('public.production_order_attachments')::text AS attachments
  `
  if (!expectedTables[0]?.plans || !expectedTables[0]?.entries || !expectedTables[0]?.attachments) {
    throw new Error('Chưa thấy đủ bảng migration MoM 30/10; dừng seed.')
  }

  const results = await prisma.$transaction(async tx => {
    const customer = await tx.customer.upsert({ where: { name: CUSTOMER }, update: {}, create: { name: CUSTOMER, country: 'TEST', note: 'Dữ liệu demo tổng hợp, không phải khách hàng thật.' } })
    const orderLines = [
      { subLineIndex: 0, color: 'TEST GREEN', itemCode: 'TEST-M30-A', widthM: 3, lengthM: 1000, gsm: 160, productionGsm: 150, qtySqm: 3000, totalWeightKgs: 480, requiredYarnKg: 504, hasEyelet: true, eyeletColor: 'TEST WHITE', eyeletLines: 2, eyeletSpec: 'TEST: 5 cm', onPallet: true, secondaryPackingType: 'WOOD_PALLET', palletDimensions: 'TEST 120 x 100 cm', itemsPerPallet: 20, packingNote: 'TEST only' },
      { subLineIndex: 1, color: 'TEST BLUE', itemCode: 'TEST-M30-B', widthM: 2, lengthM: 800, gsm: 180, productionGsm: 175, qtySqm: 1600, totalWeightKgs: 288, requiredYarnKg: 302.4, hasEyelet: false, onPallet: false, packingNote: 'TEST only' },
    ]
    const orders = []
    for (const line of orderLines) {
      const existing = await tx.productionOrder.findUnique({ where: { piNumber_subLineIndex: { piNumber: PI, subLineIndex: line.subLineIndex } }, select: { id: true, dataSource: true } })
      if (existing && existing.dataSource !== 'seed') throw new Error(`Seed dừng: PI ${PI} đã có dòng không phải demo.`)
      const order = await tx.productionOrder.upsert({
        where: { piNumber_subLineIndex: { piNumber: PI, subLineIndex: line.subLineIndex } },
        update: { ...line, customer: CUSTOMER, customerId: customer.id, dataSource: 'seed', status: 'IN_PRODUCTION' },
        create: {
          ...line, piNumber: PI, customer: CUSTOMER, customerId: customer.id,
          orderDate: DATE, deliveryDate: new Date('2026-12-09T00:00:00.000Z'),
          lifecycleStatus: 'APPROVED', status: 'IN_PRODUCTION', dataSource: 'seed',
          orderType: 'meters', primaryPackingType: 'ROLL', hasPaperCore: true,
          outerWrapping: 'POLYBAG', requiresPacking: true,
        },
      })
      orders.push(order)
    }

    const planRows = [
      { id: 'test-m30-plan-extruder-001', stage: 'extruder', machineId: 'TEST-EXT-01', orderId: orders[0].id, color: 'TEST GREEN', metricLabel: 'Kế hoạch kéo sợi', plannedValue: 1200, unit: 'kg' },
      { id: 'test-m30-plan-knitting-001', stage: 'knitting', machineId: 'TEST-M-001', orderId: orders[0].id, color: 'TEST GREEN', metricLabel: 'Kế hoạch dệt', plannedValue: 8000, unit: 'm' },
    ]
    for (const row of planRows) {
      const existing = await tx.productionOutputPlan.findUnique({ where: { id: row.id }, select: { orderRef: true } })
      if (existing && existing.orderRef !== PI) throw new Error(`Seed dừng: ID kế hoạch ${row.id} đang được dùng.`)
      await tx.productionOutputPlan.upsert({ where: { id: row.id }, update: { ...row, planDate: DATE, orderRef: PI, note: 'TEST seed — dữ liệu tổng hợp' }, create: { ...row, planDate: DATE, orderRef: PI, note: 'TEST seed — dữ liệu tổng hợp' } })
    }

    const manualRows = [
      { id: 'test-m30-manual-extruder-001', stage: 'extruder', machineId: 'TEST-EXT-01', shift: 'D', orderId: orders[0].id, color: 'TEST GREEN', metricLabel: 'Actual nhập tay', metricValue: 640, unit: 'kg' },
      { id: 'test-m30-manual-packing-001', stage: 'packing', machineId: null, shift: 'D', orderId: orders[1].id, color: 'TEST BLUE', metricLabel: 'Cuộn đã đóng gói', metricValue: 12, unit: 'cuộn' },
    ]
    for (const row of manualRows) {
      const existing = await tx.manualProductionEntry.findUnique({ where: { id: row.id }, select: { orderRef: true } })
      if (existing && existing.orderRef !== PI) throw new Error(`Seed dừng: ID actual ${row.id} đang được dùng.`)
      await tx.manualProductionEntry.upsert({ where: { id: row.id }, update: { ...row, reportDate: DATE, orderRef: PI, note: 'TEST seed — dữ liệu tổng hợp' }, create: { ...row, reportDate: DATE, orderRef: PI, note: 'TEST seed — dữ liệu tổng hợp' } })
    }

    const imported = await Promise.all([
      tx.extruderDailyOutput.upsert({ where: { id: 'test-m30-extruder-001' }, update: { orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-EXT-01', shift: 'D', color: 'TEST GREEN', denier: 600, weightKgs: 620, beamNote: 'TEST seed', dataSource: 'seed' }, create: { id: 'test-m30-extruder-001', orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-EXT-01', shift: 'D', color: 'TEST GREEN', denier: 600, weightKgs: 620, beamNote: 'TEST seed', dataSource: 'seed' } }),
      tx.warpingDailyOutput.upsert({ where: { id: 'test-m30-warping-001' }, update: { orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-WARP-01', shift: 'D', color: 'TEST GREEN', strand: 120, weightKgs: 580, dataSource: 'seed' }, create: { id: 'test-m30-warping-001', orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-WARP-01', shift: 'D', color: 'TEST GREEN', strand: 120, weightKgs: 580, dataSource: 'seed' } }),
      tx.knittingDailyDetail.upsert({ where: { id: 'test-m30-knitting-001' }, update: { orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-M-001', shift: 'D', color: 'TEST GREEN', width: 3, lengthM: 780, quantity: 20, weightKgs: 125, dataSource: 'seed' }, create: { id: 'test-m30-knitting-001', orderId: orders[0].id, orderRef: PI, reportDate: DATE, machineId: 'TEST-M-001', shift: 'D', color: 'TEST GREEN', width: 3, lengthM: 780, quantity: 20, weightKgs: 125, dataSource: 'seed' } }),
      tx.rollingDailyMetric.upsert({ where: { id: 'test-m30-rolling-001' }, update: { orderId: orders[0].id, orderRef: PI, date: DATE, color: 'TEST GREEN', metricLabel: 'QUANTITY SMALL', metricValue: 10, dataSource: 'seed' }, create: { id: 'test-m30-rolling-001', orderId: orders[0].id, orderRef: PI, date: DATE, color: 'TEST GREEN', metricLabel: 'QUANTITY SMALL', metricValue: 10, dataSource: 'seed' } }),
    ])

    const oldPacking = await tx.packingDailyOutput.findUnique({ where: { date: DATE }, select: { dataSource: true } })
    if (oldPacking && oldPacking.dataSource !== 'seed') throw new Error('Seed dừng: đã có báo cáo đóng gói không phải TEST vào ngày 09/11/2026.')
    await tx.packingDailyOutput.upsert({ where: { date: DATE }, update: { qtyDay: 12, totalMDay: 240, weightDay: 75, qtyNight: 8, totalMNight: 160, weightNight: 50, dataSource: 'seed' }, create: { id: 'test-m30-packing-20261109', date: DATE, qtyDay: 12, totalMDay: 240, weightDay: 75, qtyNight: 8, totalMNight: 160, weightNight: 50, dataSource: 'seed' } })

    const attachment = await tx.productionOrderAttachment.findUnique({ where: { id: ATTACHMENT_ID }, select: { orderId: true, fileName: true } })
    if (attachment && (attachment.orderId !== orders[0].id || attachment.fileName !== 'TEST-M30-sample.png')) throw new Error(`Seed dừng: attachment ${ATTACHMENT_ID} đang được dùng.`)
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=', 'base64')
    await tx.productionOrderAttachment.upsert({ where: { id: ATTACHMENT_ID }, update: { content: tinyPng, fileSize: tinyPng.length }, create: { id: ATTACHMENT_ID, orderId: orders[0].id, fileName: 'TEST-M30-sample.png', mimeType: 'image/png', fileSize: tinyPng.length, content: tinyPng } })

    return { orderLines: orders.length, plans: planRows.length, manualEntries: manualRows.length, importedStageRows: imported.length, packingDays: 1, attachments: 1 }
  }, { timeout: 30000 })

  console.log('Seed local TEST hoàn tất (idempotent, không xóa dữ liệu):', JSON.stringify(results))
}

main().catch(error => { console.error('Seed local thất bại:', error instanceof Error ? error.message : 'lỗi không xác định'); process.exitCode = 1 }).finally(async () => prisma.$disconnect())
