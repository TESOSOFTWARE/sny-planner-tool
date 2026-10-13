'use client'

import { useEffect, useState } from 'react'
import type { PiMaterialIssue } from '@/lib/materials/piIssues'

export default function PiMaterialIssues({ piNumber }: { piNumber: string }) {
  const [rows, setRows] = useState<PiMaterialIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let ignore = false
    setLoading(true); setError(''); setRows([])
    async function load() {
      try {
        const response = await fetch(`/api/materials/pi/${encodeURIComponent(piNumber)}`)
        const data = await response.json() as { success: boolean; rows?: PiMaterialIssue[]; error?: string }
        if (!response.ok || !data.success) throw new Error(data.error ?? 'Không thể tải vật tư đã xuất.')
        if (!ignore) setRows(data.rows ?? [])
      } catch (cause) { if (!ignore) setError(cause instanceof Error ? cause.message : 'Lỗi kết nối.') }
      finally { if (!ignore) setLoading(false) }
    }
    void load()
    return () => { ignore = true }
  }, [piNumber])
  return <section aria-labelledby="pi-material-issues-title" className="border border-outline-variant bg-surface rounded p-5 space-y-3">
    <h2 id="pi-material-issues-title" className="font-semibold text-primary">Vật tư đã xuất — {piNumber}</h2>
    {loading ? <p role="status">Đang tải vật tư đã xuất…</p> : error ? <p role="alert" className="text-error">{error}</p> : !rows.length ? <p>Chưa có phiếu xuất ghi mã PI này</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm"><thead><tr>{['Vật tư', 'Out Useing (kg)', 'Xuất Tape (kg)', 'Reject (kg)', 'Broken (kg)', 'Ngày gần nhất'].map(label => <th key={label} className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.materialId} className="border-t border-outline-variant"><td className="p-3">{row.materialName}</td>{(['out_using', 'out_tape', 'out_reject', 'out_broken'] as const).map(type => <td key={type} className="p-3 tabular-nums">{row[type].toLocaleString('vi-VN')}</td>)}<td className="p-3 whitespace-nowrap">{row.latestDate.split('-').reverse().join('/')}</td></tr>)}</tbody>
      </table>
    </div>}
    <p className="text-xs text-secondary">Chỉ gồm phiếu xuất có ghi mã PI; không gồm số OUT USEING từ báo cáo ngày.</p>
  </section>
}
