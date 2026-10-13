// [MoM §3.1 / Q-17] Manual issue slips only, grouped at PI level.
export const issueTypes = ['out_using', 'out_tape', 'out_reject', 'out_broken'] as const
type IssueType = typeof issueTypes[number]
export interface IssueTransaction {
  materialId: string
  material: { name: string }
  orderId: string | null
  reportSnapshotId: string | null
  txType: string
  quantityKg: string | number
  txDate: string
}
export interface PiMaterialIssue {
  materialId: string
  materialName: string
  out_using: number
  out_tape: number
  out_reject: number
  out_broken: number
  latestDate: string
}
export function summarizePiIssues(transactions: readonly IssueTransaction[], piNumber: string): PiMaterialIssue[] {
  const grouped = new Map<string, PiMaterialIssue>()
  for (const tx of transactions) {
    if (tx.reportSnapshotId !== null || tx.orderId?.trim().toLowerCase() !== piNumber.trim().toLowerCase() || !issueTypes.includes(tx.txType as IssueType)) continue
    const quantity = Number(tx.quantityKg)
    if (!Number.isFinite(quantity)) continue
    const row = grouped.get(tx.materialId) ?? { materialId: tx.materialId, materialName: tx.material.name, out_using: 0, out_tape: 0, out_reject: 0, out_broken: 0, latestDate: tx.txDate.slice(0, 10) }
    const type = tx.txType as IssueType
    row[type] = (Math.round(row[type] * 100) + Math.round(quantity * 100)) / 100
    row.latestDate = row.latestDate > tx.txDate.slice(0, 10) ? row.latestDate : tx.txDate.slice(0, 10)
    grouped.set(tx.materialId, row)
  }
  return Array.from(grouped.values()).sort((a, b) => a.materialName.localeCompare(b.materialName, 'vi'))
}
