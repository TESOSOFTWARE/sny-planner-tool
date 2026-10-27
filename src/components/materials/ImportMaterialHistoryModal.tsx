'use client'
import { prepareReportUpload, ReportUploadError } from '@/lib/excel/uploadTrim'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useScheduleModalFocus } from '@/components/schedule/useModalFocus'
import type { HistoryImportPreview, HistoryRowStatus, Resolutions } from '@/lib/materials/reportHistoryImport'
import { reportPeriodLabel } from './MaterialReportsModal'

interface Props { onImported: () => void; onClose: () => void }
const statusLabels: Record<HistoryRowStatus, string> = {
  invalid: 'Thiếu hoặc không hợp lệ', unknown_material: 'Vật tư chưa có', ambiguous: 'Tên vật tư trùng',
  identical: 'Giống hệt', conflict_existing: 'Khác báo cáo đã lưu', new: 'Sẽ ghi',
}
const button = 'border border-outline rounded px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed'
const number = (value: number) => value.toLocaleString('vi-VN')

/** [MoM §3.1 / D1=B] Historical snapshots never change current stock or transactions. */
export default function ImportMaterialHistoryModal({ onImported, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<HistoryImportPreview | null>(null)
  const [resolutions, setResolutions] = useState<Resolutions>({})
  const [previewStale, setPreviewStale] = useState(false)
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
    if (!file || (confirm && (!preview || previewStale || preview.counts.new === 0))) return
    setBusy(true); setError('')
    try {
      const uploadFile = confirm ? file : await prepareReportUpload(file, 'HDPE')
      if (!confirm) setFile(uploadFile)
      const body = new FormData()
      body.append('file', uploadFile)
      body.append('resolutions', JSON.stringify(resolutions))
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
        setPreview(data); setPreviewStale(false)
      }
    } catch (error: unknown) { if (!confirm) setPreview(null); setError(error instanceof ReportUploadError ? error.message : 'Lỗi kết nối hoặc phản hồi không hợp lệ. Vui lòng thử lại.') }
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
        <p className="text-sm text-primary">Nhập ảnh chụp theo kỳ; tồn hiện tại có thể được cập nhật theo xem trước. Không tạo phiếu nhập/xuất.</p>
        {error && <p role="alert" className="text-sm text-error border border-error rounded p-3">{error}</p>}
        {busy && <p role="status" className="text-sm">{preview ? 'Đang ghi lịch sử…' : 'Đang xem trước…'}</p>}
        {created !== null ? <div role="status" className="space-y-2"><p>Đã ghi {number(created)} bản ghi lịch sử.</p><p className="text-sm text-secondary">Mở báo cáo theo kỳ nguồn của vật tư trong tab HDPE để xem lịch sử vừa nhập.</p></div> : <>
          <label className="block text-sm space-y-2">File Excel (.xlsx, tối đa 10 MB)
            <input ref={fileInput} type="file" accept=".xlsx" disabled={busy} tabIndex={-1} className="sr-only" onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResolutions({}); setPreviewStale(false); setError('') }} />
            <button type="button" disabled={busy} className={`${button} block bg-primary text-on-primary`} onClick={() => fileInput.current?.click()}>Chọn file</button>
          </label>
          {file && <p className="text-xs text-secondary break-all">File đã chọn: {file.name}</p>}
          {preview && <>
            {preview.unknownMaterials.length > 0 && <section className="border border-outline-variant rounded p-3 space-y-3">
              <h3 className="font-semibold">Vật tư chưa có trong hệ thống ({number(preview.unknownMaterials.length)})</h3>
              {preview.unknownMaterials.map(item => {
                const selected = resolutions[item.materialKey] ?? { action: 'skip' as const }
                const options = preview.materials.filter(material => material.group === item.group)
                const candidates = new Set(item.candidates.map(candidate => candidate.id))
                options.sort((a, b) => Number(candidates.has(b.id)) - Number(candidates.has(a.id)) || a.name.localeCompare(b.name))
                return <div key={item.materialKey} className="border-t pt-2 space-y-1">
                  <p className="text-sm">{item.name} · {item.group} · {item.periods} kỳ · tồn đầu {number(item.firstStock)} / cuối {number(item.lastStock)}</p>
                  <label className="text-sm">Xử lý
                    <select aria-label={`Xử lý ${item.name}`} value={selected.action === 'map' ? `map:${selected.materialId}` : selected.action} disabled={busy}
                      onChange={event => {
                        const value = event.target.value
                        setResolutions(current => ({ ...current, [item.materialKey]: value.startsWith('map:') ? { action: 'map', materialId: value.slice(4) } : { action: value === 'create' ? 'create' : 'skip' } }))
                        setPreviewStale(true)
                      }} className="ml-2 border rounded p-1">
                      <option value="skip">Bỏ qua</option><option value="create">Tạo mới</option>
                      {options.map(option => <option key={option.id} value={`map:${option.id}`}>Ánh xạ: {option.name}{candidates.has(option.id) ? ' (gợi ý)' : ''}</option>)}
                    </select>
                  </label>
                </div>
              })}
              {previewStale && <p role="status" className="text-sm">Lựa chọn đã thay đổi; cần xem trước lại trước khi xác nhận.</p>}
            </section>}
            <section className="border border-outline-variant rounded p-3 text-sm">
              <h3 className="font-semibold">Sau khi nhập</h3>
              <p>{number(preview.stockUpdates.length)} vật tư sẽ cập nhật tồn; {number(preview.stockKept.length)} vật tư giữ nguyên tồn. Không tạo phiếu nhập/xuất.</p>
              {preview.stockUpdates.slice(0, 5).map(item => <p key={item.materialId}>{item.name}: {item.from?.stock ?? 'mới'} → {number(item.to.stock)} kg ({item.to.date})</p>)}
              {preview.stockUpdates.length > 5 && <p>…</p>}
              {preview.stockKept.slice(0, 5).map(item => <p key={item.materialId}>{item.name}: giữ tồn ({item.reason === 'overlapping_period' ? 'kỳ chồng nhau' : item.reason === 'manual_tx' ? 'có phiếu tay' : item.reason === 'manual_stock_edit' ? 'đã sửa tồn' : item.reason === 'no_report_baseline' ? 'chưa có mốc báo cáo' : 'tồn hiện tại mới hơn'})</p>)}
              {preview.stockKept.length > 5 && <p>…</p>}
            </section>
            <p className="text-sm">{number(preview.totalRows)} dòng trong {number(preview.periods.length)} kỳ nguồn. Kỳ gộp giữ nguyên, không chia số liệu thành từng ngày.</p>
            <div className="overflow-x-auto border border-outline-variant rounded">
              <table className="w-full min-w-[480px] text-sm"><thead className="bg-surface-container"><tr>{['Kỳ nguồn', 'Sẽ ghi', 'Giống hệt', 'Bỏ qua'].map(label => <th key={label} className="p-3 text-left whitespace-nowrap">{label}</th>)}</tr></thead>
                <tbody>{preview.periods.map(period => <tr key={period.reportDate} className="border-t border-outline-variant"><td className="p-3 whitespace-nowrap">{reportPeriodLabel(period.reportDate, period)}</td><td className="p-3">{number(period.counts.new)}</td><td className="p-3">{number(period.counts.identical)}</td><td className="p-3">{number(period.totalRows - period.counts.new - period.counts.identical)}</td></tr>)}</tbody>
              </table>
            </div>
            {skipped.length > 0 && <details className="border border-outline-variant rounded p-3">
              <summary tabIndex={0} className="cursor-pointer text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Không ghi — {number(skipped.length)} dòng bị bỏ qua</summary>
              {(Object.keys(statusLabels) as HistoryRowStatus[]).filter(status => status !== 'new' && status !== 'identical' && skipped.some(row => row.status === status)).map(status => <section key={status} className="mt-3 space-y-2"><h3 className="text-sm font-semibold">{statusLabels[status]}</h3><ul className="space-y-2 text-xs">{skipped.filter(row => row.status === status).map(row => <li key={row.rowIndex} className="break-words">{reportPeriodLabel(row.reportDate, row)} — {row.group === 'MB' ? 'Hạt màu' : 'HDPE'} — {row.materialName} (dòng {number(row.sourceRow)}): {row.reasons.join('; ')}{row.differences?.map(diff => <span key={diff.field} className="block">{diff.field === 'firstStock' ? 'Tồn đầu' : diff.field === 'lastStock' ? 'Tồn cuối' : 'Số liệu khác'}: đã lưu {typeof diff.stored === 'number' ? number(diff.stored) : String(diff.stored ?? '—')}, file {typeof diff.incoming === 'number' ? number(diff.incoming) : String(diff.incoming ?? '—')}</span>)}</li>)}</ul></section>)}
              <p className="mt-3 text-xs text-secondary">Kiểm tra các dòng bị bỏ qua và kỳ chồng nhau trước khi xác nhận.</p>
            </details>}
            {preview.counts.new === 0 && <p role="status" className="text-sm">Không có kỳ mới để ghi.</p>}
          </>}
        </>}
      </div>
      <footer className="p-5 border-t border-outline-variant flex flex-wrap justify-end gap-2">
        {created === null && <><button type="button" disabled={busy || !file} className={button} onClick={() => { void request(false) }}>{preview ? 'Xem trước lại' : 'Xem trước'}</button>{preview && <button type="button" disabled={busy || previewStale || preview.counts.new === 0} className={`${button} bg-primary text-on-primary`} onClick={() => { void request(true) }}>Ghi {number(preview.counts.new)} bản ghi</button>}</>}
      </footer>
    </div>
  </div>
}
