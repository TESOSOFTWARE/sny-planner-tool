'use client'

import { useEffect, useRef, useState } from 'react'
import type { MaterialReportPayload, SerializedMaterial } from './EditMaterialModal'
import { reconcileStock, reconciliationRange, summarizeSourceReports } from '@/lib/materials/reconciliation'

export interface DailyMaterialReport { reportDate: string; payload: MaterialReportPayload }
const columns = [
  ['firstStock', 'Tồn đầu'], ['inQty', 'Nhập'], ['outBroken', 'Broken'],
  ['outTape', 'Tape'], ['outReject', 'Reject'], ['outUsing', 'Out Useing'], ['lastStock', 'Tồn cuối'],
] as const

/** [MoM §3.1] Opening/closing are boundaries; only movements are summed. */
export function summarizeReports(reports: DailyMaterialReport[]): MaterialReportPayload {
  return summarizeSourceReports(reports)
}

export function reportPeriodLabel(date: string, period: { sourceDateLabel?: string; reportPeriodEnd?: string }): string {
  if (period.sourceDateLabel) return period.sourceDateLabel
  const start = date.split('-').reverse().join('/')
  return period.reportPeriodEnd && period.reportPeriodEnd !== date ? `${start} – ${period.reportPeriodEnd.split('-').reverse().join('/')}` : start
}

function number(value?: number) { return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('vi-VN') }

export default function MaterialReportsModal({ material, initialMonth, onClose }: { material: SerializedMaterial; initialMonth: string; onClose: () => void }) {
  const [month, setMonth] = useState(initialMonth || new Date().toISOString().slice(0, 7))
  const [reports, setReports] = useState<DailyMaterialReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButton.current?.focus()
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const focusable = closeButton.current?.closest('section')?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')
        if (!focusable?.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', listener)
    return () => { document.removeEventListener('keydown', listener); previous?.focus() }
  }, [onClose])
  useEffect(() => {
    let ignore = false
    setLoading(true); setError(''); setReports([])
    async function load() {
      try {
        const response = await fetch(`/api/materials/${encodeURIComponent(material.id)}/reports?month=${encodeURIComponent(month)}`)
        const data = await response.json() as { success: boolean; reports?: DailyMaterialReport[]; error?: string }
        if (!response.ok || !data.success) throw new Error(data.error ?? 'Không thể tải báo cáo.')
        if (!ignore) setReports(data.reports ?? [])
      } catch (cause) { if (!ignore) setError(cause instanceof Error ? cause.message : 'Lỗi kết nối.') }
      finally { if (!ignore) setLoading(false) }
    }
    if (month) void load(); else setLoading(false)
    return () => { ignore = true }
  }, [material.id, month])
  const summary = summarizeReports(reports)
  const reconciliation = reconcileStock(summary, material)
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="material-reports-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-surface rounded shadow-xl p-5 space-y-4" onClick={event => event.stopPropagation()}>
      <div className="flex justify-between items-start gap-3">
        <h2 id="material-reports-title" className="font-semibold text-primary">Báo cáo theo kỳ nguồn — {material.name}</h2>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Đóng báo cáo" className="border border-outline rounded px-3 py-1 focus-visible:ring-2 focus-visible:ring-primary">Đóng</button>
      </div>
      <label className="block text-sm">Tháng báo cáo <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="ml-2 border border-outline rounded px-3 py-2 bg-surface" /></label>
      <p className="text-xs text-secondary">Tổng chỉ tính các kỳ có báo cáo. Kỳ gộp ngày giữ nguyên số liệu nguồn, gắn ngày đầu kỳ và không chia thành từng ngày. Tồn đầu/cuối lấy báo cáo đầu/cuối; không cộng tồn. Ngày thiếu báo cáo không được coi là không phát sinh.</p>
      {loading ? <p role="status">Đang tải báo cáo…</p> : error ? <p role="alert" className="text-error">{error}</p> : !reports.length ? <p>Chưa có báo cáo trong tháng này.</p> : <div className="overflow-x-auto border border-outline-variant rounded">
        <p className="p-3 text-xs text-secondary">{reconciliationRange(reports)}. Đối chiếu từ các kỳ báo cáo đã nhập; không tự điều chỉnh tồn kho.</p>
        <table className="w-full min-w-[850px] text-sm"><thead className="bg-surface-container"><tr><th className="p-3 text-left">Ngày/kỳ nguồn</th>{columns.map(([key, label]) => <th key={key} className="p-3 text-right whitespace-nowrap">{label}</th>)}</tr></thead>
          <tbody>{reports.map(report => <tr key={report.reportDate} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap">{reportPeriodLabel(report.reportDate, report.payload)}</td>{columns.map(([key]) => <td key={key} className="p-3 text-right tabular-nums">{number(report.payload[key])}</td>)}</tr>)}</tbody>
          <tfoot className="bg-surface-container font-semibold"><tr><td className="p-3">Tổng {reports.length} kỳ có báo cáo</td>{columns.map(([key]) => <td key={key} className="p-3 text-right tabular-nums">{number(summary[key])}</td>)}</tr></tfoot>
        </table>
        <dl aria-label="Đối chiếu tồn" className="flex flex-wrap gap-5 p-3 text-sm">
          <div><dt>AC — Tồn tính theo phát sinh</dt><dd>{number(reconciliation.ac)}</dd></div>
          <div><dt>AD — Tồn cuối kỳ cuối</dt><dd>{number(reconciliation.ad)}</dd></div>
          <div className={reconciliation.warning ? 'text-error font-semibold' : ''}><dt>check — AC − AD</dt><dd>{number(reconciliation.check)}</dd></div>
        </dl>
        {reconciliation.reason && <p className="px-3 pb-3 text-xs text-secondary">{reconciliation.reason}</p>}
      </div>}
    </section>
  </div>
}
