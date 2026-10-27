import type { Prisma } from '@prisma/client'

export async function loadMonthlyHistoryState(client: Prisma.TransactionClient) {
  const materials = await client.material.findMany({
    where: { group: { in: ['HDPE', 'MB'] } },
    select: { id: true, name: true, group: true, currentStock: true, stockReportDate: true, stockReportDirty: true },
  })
  const ids = materials.map(material => material.id)
  const snapshots = await client.materialReportSnapshot.findMany({
    where: { materialId: { in: ids } },
    select: { materialId: true, reportDate: true, payload: true },
  })
  const manualTransactions = await client.materialTransaction.findMany({
    where: { materialId: { in: ids }, reportSnapshotId: null },
    select: { id: true, materialId: true, txDate: true },
  })
  return { materials, snapshots, manualTransactions }
}
