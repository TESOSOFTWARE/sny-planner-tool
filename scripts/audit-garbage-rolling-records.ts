import { prisma } from '../src/lib/db'

async function auditGarbageRecords() {
  console.log('=== DRY-RUN AUDIT OF GARBAGE ROLLING RECORDS IN DB ===\n')

  // Find garbage orderRefs: %, TOTAL, SCRAP, or containing %, TOTAL, SCRAP
  const allGarbageRecords = await prisma.rollingDailyMetric.findMany({
    where: {
      OR: [
        { orderRef: null },
        { orderRef: '' },
        { orderRef: '%' },
        { orderRef: 'TOTAL' },
        { orderRef: 'SCRAP' },
        { orderRef: { contains: '%', mode: 'insensitive' } },
        { orderRef: { contains: 'TOTAL', mode: 'insensitive' } },
        { orderRef: { contains: 'SCRAP', mode: 'insensitive' } },
        { orderRef: { contains: 'CỘNG', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      date: true,
      orderRef: true,
      color: true,
      metricLabel: true,
      metricValue: true,
      dataSource: true,
    },
  })

  console.log(`Total Garbage Records Found in DB: ${allGarbageRecords.length}`)

  // Group by dataSource and orderRef
  const summary: Record<string, Record<string, number>> = {}

  for (const r of allGarbageRecords) {
    const src = r.dataSource || 'Unknown'
    const ref = r.orderRef || 'NULL/EMPTY'
    if (!summary[src]) summary[src] = {}
    summary[src][ref] = (summary[src][ref] || 0) + 1
  }

  console.log('\n--- GARBAGE RECORDS BREAKDOWN BY FILE & ORDERREF ---')
  console.table(summary)

  console.log('\n--- 15 SAMPLE GARBAGE RECORDS ---')
  console.table(
    allGarbageRecords.slice(0, 15).map((r) => ({
      Id: r.id,
      Date: r.date.toISOString().slice(0, 10),
      OrderRef: r.orderRef,
      MetricLabel: r.metricLabel,
      MetricValue: r.metricValue?.toString(),
      File: r.dataSource,
    }))
  )

  const totalRecordsInDb = await prisma.rollingDailyMetric.count()
  const cleanRecordsCount = totalRecordsInDb - allGarbageRecords.length

  console.log(`\n--------------------------------------------------------------------------------`)
  console.log(`CURRENT TOTAL IN DB: ${totalRecordsInDb}`)
  console.log(`GARBAGE TO BE DELETED : ${allGarbageRecords.length}`)
  console.log(`CLEAN REMAINING IN DB : ${cleanRecordsCount}`)
  console.log(`--------------------------------------------------------------------------------`)
}

auditGarbageRecords()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
