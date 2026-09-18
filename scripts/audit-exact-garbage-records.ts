import { prisma } from '../src/lib/db'

async function auditExactGarbage() {
  console.log('=== EXACT DRY-RUN AUDIT OF FOOTER GARBAGE RECORDS ===\n')

  const garbageRecords = await prisma.rollingDailyMetric.findMany({
    where: {
      OR: [
        { orderRef: null },
        { orderRef: '' },
        { orderRef: '%' },
        { orderRef: 'SCRAP' },
        { orderRef: 'TOTAL' },
        { orderRef: 'TOTAL ALL' },
        { orderRef: 'CỘNG' },
        { orderRef: 'TỶ LỆ' },
        { orderRef: 'PHẦN TRĂM' },
      ],
    },
    select: {
      id: true,
      date: true,
      orderRef: true,
      color: true,
      widthM: true,
      lengthM: true,
      metricLabel: true,
      metricValue: true,
      dataSource: true,
    },
  })

  console.log(`Exact Footer Garbage Records Found in DB: ${garbageRecords.length}`)

  const breakdown: Record<string, Record<string, number>> = {}
  for (const r of garbageRecords) {
    const src = r.dataSource || 'Unknown'
    const ref = r.orderRef || 'NULL/EMPTY'
    if (!breakdown[src]) breakdown[src] = {}
    breakdown[src][ref] = (breakdown[src][ref] || 0) + 1
  }

  console.log('\n--- GARBAGE RECORDS BREAKDOWN BY FILE & FOOTER KEYWORD ---')
  console.table(breakdown)

  if (garbageRecords.length > 0) {
    console.log('\n--- ALL DETECTED GARBAGE RECORDS TO BE DELETED ---')
    console.table(
      garbageRecords.map((r) => ({
        Id: r.id,
        Date: r.date.toISOString().slice(0, 10),
        OrderRef: r.orderRef,
        MetricLabel: r.metricLabel,
        MetricValue: r.metricValue?.toString(),
        File: r.dataSource,
      }))
    )
  }

  const totalInDb = await prisma.rollingDailyMetric.count()
  const cleanRemaining = totalInDb - garbageRecords.length

  console.log(`\n================================================================================`)
  console.log(`CURRENT TOTAL RECORDS IN DB : ${totalInDb}`)
  console.log(`GARBAGE RECORDS TO DELETE   : ${garbageRecords.length}`)
  console.log(`CLEAN ORDER RECORDS REMAINING: ${cleanRemaining}`)
  console.log(`================================================================================`)
}

auditExactGarbage()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
