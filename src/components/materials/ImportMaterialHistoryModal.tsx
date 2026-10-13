'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useScheduleModalFocus } from '@/components/schedule/useModalFocus'
import type { HistoryImportPreview, HistoryRowStatus } from '@/lib/materials/reportHistoryImport'
import { reportPeriodLabel } from './MaterialReportsModal'

interface Props { onImported: () => void; onClose: () => void }
const statusLabels: Record<HistoryRowStatus, string> = {
  invalid: 'Thiếu hoặc không hợp lệ', unknown_material: 'Vật tư chưa có', ambiguous: 'Tên vật tư trùng',
  newer_than_stock: 'Kỳ mới hơn ngày tồn hiện tại', identical: 'Giống hệt', conflict_existing: 'Khác báo cáo đã lưu', new: 'Sẽ ghi',
}
const button = 'border border-outline rounded px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed'
const number = (value: number) => value.toLocaleString('vi-VN')

/** [MoM §3.1 / D1=B] Historical snapshots never change current stock or transactions. */
export default function ImportMaterialHistoryModal({ onImported, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<HistoryImportPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<number | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const closing = useRef(onClose)
  const loading = useRef(false)
  useEffect(() => { closing.current = onClose; loading.current = busy }, [onClose, busy])
  const closeWhenIdle = useCallback(() => { if (!loading.current) closing.current() }, [])
  useScheduleModalFocus(true, closeWhenIdle, dialog)

  const request = async (confirm: boolean) => {
    if (!file || (confirm && (!preview || preview.counts.new === 0))) return
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      if (confirm && preview) body.append('expectedSnapshot', preview.expectedSnapshot)
      const response = await fetch(`/api/materials/import-history${confirm ? '/confirm' : ''}`, { method: 'POST', body })
      const data = await response.json() as HistoryImportPreview & { created?: number; error?: string }
      if (!response.ok || !data.success) {
        if (!confirm) setPreview(null)
        if (response.status === 409) {
          setPreview(null)
          setError(`${data.error ?? 'Dữ liệu đã thay đổi.'} Vui lòng xem trước lại file đã chọn.`)
        } else setError(data.error ?? 'Không thể nhập lịch sử báo cáo.')
        return
      }
      if (confirm) {
        if (typeof data.created !== 'number' || !Number.isFinite(data.created) || data.created < 0) throw new Error('Invalid confirmation')
        setCreated(data.created); onImported()
      } else {
        if (typeof data.expectedSnapshot !== 'string' || !data.expectedSnapshot || !Array.isArray(data.periods) || !Array.isArray(data.skippedRows) || !data.counts || !Number.isFinite(data.counts.new) || data.counts.new < 0 || data.periods.some(period => !period.counts || typeof period.reportDate !== 'string') || data.skippedRows.some(row => !Array.isArray(row.reasons))) throw new Error('Invalid preview')
        setPreview(data)
      }
    } catch { if (!confirm) setPreview(null); setError('Lỗi kết nối hoặc phản hồi không hợp lệ. Vui lòng thử lại.') }
    finally { setBusy(false) }
  }
  const skipped = preview?.skippedRows.filter(row => row.status !== 'identical') ?? []
  return <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="history-import-title" aria-busy={busy} className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-surface rounded shadow-xl" onClick={event => event.stopPropagation()}>
      <header className="p-5 border-b border-outline-variant flex items-center justify-between gap-3">
        <h2 id="history-import-title" className="font-semibold text-primary">Nhập lịch sử báo cáo HDPE</h2>
        <button type="button" className={button} disabled={busy} onClick={onClose}>Đóng</button>
      </header>
      <div className="p-5 overflow-y-auto space-y-4">
        <p className="text-sm text-primary">Lịch sử chỉ để xem lại theo kỳ — không đổi tồn hiện tại, không tạo giao dịch.</p>
        {error && <p role="alert" className="text-sm text-error border border-error rounded p-3">{error}</p>}
        {busy && <p role="status" className="text-sm">{preview ? 'Đang ghi lịch sử…' : 'Đang xem trước…'}</p>}
        {created !== null ? <div role="status" className="space-y-2"><p>Đã ghi {number(created)} bản ghi lịch sử. Tồn hiện tại không thay đổi.</p><p className="text-sm text-secondary">Mở báo cáo theo kỳ nguồn của vật tư trong tab HDPE để xem lịch sử vừa nhập.</p></div> : <>
          <label className="block text-sm space-y-2">File Excel (.xlsx, tối đa 10 MB)
            <input ref={fileInput} type="file" accept=".xlsx" disabled={busy} tabIndex={-1} className="sr-only" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError('') }} />
            <button type="button" disabled={busy} className={`${button} block bg-primary text-on-primary`} onClick={() => fileInput.current?.click()}>Chọn file</button>
          </label>
          {file && <p className="text-xs text-secondary break-all">File đã chọn: {file.name}</p>}
          {preview && <>
            <p className="text-sm">{number(preview.totalRows)} dòng trong {number(preview.periods.length)} kỳ nguồn. Kỳ gộp giữ nguyên, không chia số liệu thành từng ngày.</p>
            <div className="overflow-x-auto border border-outline-variant rounded">
              <table className="w-full min-w-[480px] text-sm"><thead className="bg-surface-container"><tr>{['Kỳ nguồn', 'Sẽ ghi', 'Giống hệt', 'Bỏ qua'].map(label => <th key={label} className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead>
                <tbody>{preview.periods.map(period => <tr key={period.reportDate} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap">{reportPeriodLabel(period.reportDate, period)}</td><td className="p-3">{number(period.counts.new)}</td><td className="p-3">{number(period.counts.identical)}</td><td className="p-3">{number(period.totalRows - period.counts.new - period.counts.identical)}</td></tr>)}</tbody>
              </table>
            </div>
            {skipped.length > 0 && <details className="border border-outline-variant rounded p-3">
              <summary tabIndex={0} className="cursor-pointer text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Không ghi — {number(skipped.length)} dòng bị bỏ qua</summary>
              {(Object.keys(statusLabels) as HistoryRowStatus[]).filter(status => status !== 'new' && status !== 'identical' && skipped.some(row => row.status === status)).map(status => <section key={status} className="mt-3 space-y-2"><h3 className="text-sm font-semibold">{statusLabels[status]}</h3><ul className="space-y-2 text-xs">{skipped.filter(row => row.status === status).map(row => <li key={row.rowIndex} className="break-words">{reportPeriodLabel(row.reportDate, row)} — {row.group === 'MB' ? 'Hạt màu' : 'HDPE'} — {row.materialName} (dòng {number(row.sourceRow)}): {row.reasons.join('; ')}{row.differences?.map(diff => <span key={diff.field} className="block">{diff.field === 'firstStock' ? 'Tồn đầu' : diff.field === 'lastStock' ? 'Tồn cuối' : 'Số liệu khác'}: đã lưu {typeof diff.stored === 'number' ? number(diff.stored) : String(diff.stored ?? '—')}, file {typeof diff.incoming === 'number' ? number(diff.incoming) : String(diff.incoming ?? '—')}</span>)}</li>)}</ul></section>)}
              <p className="mt-3 text-xs text-secondary">Vật tư chưa có: thêm vật tư rồi xem trước lại. Kỳ mới hơn tồn hoặc khác báo cáo đã lưu: dùng Import báo cáo HDPE một ngày để cập nhật.</p>
            </details>}
            {preview.counts.new === 0 && <p role="status" className="text-sm">Không có kỳ mới để ghi.</p>}
          </>}
        </>}
      </div>
      <footer className="p-5 border-t border-outline-variant flex flex-wrap justify-end gap-2">
        {created === null && <><button type="button" disabled={busy || !file} className={button} onClick={() => { void request(false) }}>{preview ? 'Xem trước lại' : 'Xem trước'}</button>{preview && <button type="button" disabled={busy || preview.counts.new === 0} className={`${button} bg-primary text-on-primary`} onClick={() => { void request(true) }}>Ghi {number(preview.counts.new)} bản ghi</button>}</>}
      </footer>
    </div>
  </div>
}
