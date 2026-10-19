'use client'

import { useState, useMemo } from 'react'
import { reportPeriodLabel } from './MaterialReportsModal'
import type { SerializedMaterial, MaterialReportPayload } from './EditMaterialModal'
import { reconcileStock, reconciliationRange, totalReconciliation } from '@/lib/materials/reconciliation'
import MaterialActionsMenu from './MaterialActionsMenu'

interface Props {
  materials: SerializedMaterial[] // HDPE + MB, selected common date
  reportDate: string | null
  reportDates: string[]
  onReportDateChange: (date: string) => void
  onReports: (material: SerializedMaterial) => void
  onEdit: (material: SerializedMaterial) => void
  onDelete: (material: SerializedMaterial) => void
  onHistory: (material: SerializedMaterial) => void
  onRowClick: (material: SerializedMaterial) => void
  onImport: () => void
  onImportHistory: () => void
}

/**
 * MoM §3.1 — 7 cột đúng theo bảng khách đang dùng trong file nguồn.
 * Giữ nguyên lỗi chính tả gốc ở nhãn (FISRT/OUT USEING) để khách đối chiếu được.
 */
const REPORT_COLUMNS = [
  { key: 'firstStock', label: 'First Stock', sublabel: 'Tồn đầu' },
  { key: 'inQty', label: 'In', sublabel: 'Nhập' },
  { key: 'outBroken', label: 'HDPE Broken', sublabel: 'HDPE lỗi' },
  { key: 'outTape', label: 'Xuất Tape', sublabel: 'Xuất cho Tape' },
  { key: 'outReject', label: 'Reject', sublabel: 'Loại' },
  { key: 'outUsing', label: 'Out Useing', sublabel: 'Sử dụng' },
  { key: 'lastStock', label: 'Last Stock', sublabel: 'Tồn cuối' },
] as const

type ReportKey = (typeof REPORT_COLUMNS)[number]['key']

/**
 * MoM §3.2 — ba khối đúng thứ tự file nguồn. Nguyên sinh và tái chế có
 * CÔNG THỨC TỒN KHÁC NHAU (tái chế trừ REJECT) nên không được gộp.
 */
const SECTIONS = [
  { id: 'NGUYEN_SINH', title: 'HDPE nguyên sinh' },
  { id: 'TAI_CHE', title: 'HDPE tái chế (Recycled)' },
  { id: 'MB', title: 'Hạt màu (Masterbatch)' },
  { id: 'CHUA_PHAN_LOAI', title: 'Chưa phân loại' },
] as const

/** Số chưa có thì để trống — không hiển thị 0 để khỏi nhầm "đã đo được = 0". */
function Num({ value }: { value: number | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="italic text-outline">—</span>
  return <>{value.toLocaleString('vi-VN')}</>
}

function sumBy(rows: SerializedMaterial[], key: ReportKey): number | undefined {
  const periods = rows.map(row => row.latestReport ? `${row.latestReport.reportDate}|${row.latestReport.payload.reportPeriodEnd ?? row.latestReport.reportDate}` : '')
  if (periods.some(period => !period || period !== periods[0])) return undefined
  const values = rows
    .map(r => (r.latestReport?.payload as MaterialReportPayload | undefined)?.[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return values.length === rows.length && values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined
}

export default function HDPETab({ materials, onEdit, onDelete, onHistory, onRowClick, onImport, onImportHistory, reportDate, reportDates, onReportDateChange, onReports }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sameDate = materials.map(material => ({ ...material, latestReport: material.latestReport?.reportDate.slice(0, 10) === reportDate ? material.latestReport : null }))
    if (!q) return sameDate
    return sameDate.filter(m => `${m.name} ${m.color ?? ''} ${m.colorName ?? ''} ${m.itemCode ?? ''} ${m.brand ?? ''} ${m.latestReport?.payload.colorName ?? ''} ${m.latestReport?.payload.itemCode ?? ''}`.toLowerCase().includes(q))
  }, [materials, query, reportDate])

  const sections = useMemo(
    () =>
      SECTIONS.map(section => ({
        ...section,
        rows: filtered.filter(m =>
          section.id === 'MB' ? m.group === 'MB' : m.group === 'HDPE' && (section.id === 'CHUA_PHAN_LOAI' ? !m.subGroup : m.subGroup === section.id),
        ),
      })).filter(section => section.rows.length > 0),
    [filtered],
  )

  const colCount = 2 + REPORT_COLUMNS.length + 1 + 3

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-outline">
              <span className="material-symbols-outlined text-[18px]">search</span>
            </span>
            <input
              type="search"
              aria-label="Tìm nguyên liệu" placeholder="Tìm kiếm nhựa, hạt màu..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-surface-container-lowest border-[0.5px] border-outline-variant rounded pl-9 pr-4 py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <label className="text-xs text-secondary">Ngày báo cáo
            <select aria-label="Ngày báo cáo HDPE" value={reportDate ?? ''} onChange={e => onReportDateChange(e.target.value)} className="ml-2 border border-outline-variant rounded p-2 bg-surface text-on-surface">
              {!reportDate && <option value="">Chưa có báo cáo</option>}
              {reportDates.map(date => <option key={date} value={date}>{date.split('-').reverse().join('/')}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onImportHistory} className="inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-md text-sm font-medium hover:bg-surface-container focus-visible:ring-2 focus-visible:ring-primary">Nhập lịch sử báo cáo</button>
          <a
            href="/api/materials/template/hdpe"
            className="inline-flex items-center gap-2 px-4 py-2 border border-outline text-on-surface-variant hover:bg-surface-container-lowest rounded-md text-sm font-medium transition-colors"
            download
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải mẫu HDPE
          </a>
          <button
            onClick={onImport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary hover:bg-primary/90 rounded-md text-sm font-medium transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">upload</span>
            Import báo cáo HDPE
          </button>
        </div>
      </div>

      <p className="text-sm font-medium text-primary">{reportDate ? `Báo cáo ngày ${reportDate.split('-').reverse().join('/')}` : 'Chưa có báo cáo HDPE'}</p>
      <details className="text-xs text-secondary rounded border border-outline-variant px-3 py-2">
        <summary className="cursor-pointer font-medium text-on-surface">Giải thích số liệu và đối chiếu</summary>
        <div className="mt-2 space-y-1">
          <p>Bảng chỉ hiển thị báo cáo của ngày đã chọn, khác với tồn hiện tại trong sổ kho. Dấu — là thiếu chỉ số trong báo cáo. TOTAL để trống nếu có dòng thiếu hoặc khác khoảng ngày nguồn.</p>
          <p>Đối chiếu chuẩn hoá: AC = Tồn đầu + Nhập − Out Useing − Xuất Tape; nhựa tái chế trừ thêm Reject. Broken giữ theo nguồn, không trừ vào AC. AD lấy tồn cuối nguồn; check chỉ cảnh báo, không tự sửa tồn.</p>
          <p>Thiếu số liệu nguồn để tính AC; ô trống không được coi là 0. Dấu — trong cột đối chiếu có chú thích lý do.</p>
        </div>
      </details>
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
              <th className="sticky left-0 z-30 min-w-[180px] max-w-[200px] bg-surface-container px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                Tên NVL
              </th>
              {REPORT_COLUMNS.map(col => (
                <th
                  key={col.key}
                  className="px-3 py-3 text-right text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap"
                >
                  <span className="block">{col.label}</span><span className="block normal-case tracking-normal text-[11px] font-normal text-outline">{col.sublabel}</span>
                </th>
              ))}
              {[['AC', 'Tồn tính lại'], ['AD', 'Tồn cuối báo cáo'], ['CHECK', 'Chênh lệch']].map(([label, sublabel]) => <th key={label} className="px-3 py-3 text-right text-xs font-medium text-secondary whitespace-nowrap"><span className="block">{label}</span><span className="block normal-case text-[11px] font-normal text-outline">{sublabel}</span></th>)}
              <th className="px-3 py-3 text-right text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                Ngưỡng TT
              </th>
              <th className="px-4 py-3 text-left text-xs font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap">
                Thao tác
              </th>
            </tr>
          </thead>

          {sections.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-secondary">
                  Không tìm thấy nguyên liệu nào.
                </td>
              </tr>
            </tbody>
          ) : (
            sections.map(section => (
              <tbody key={section.id} className="border-t-4 border-surface divide-y divide-outline-variant/50">
                <tr className="bg-surface-container-low">
                  <td
                    colSpan={colCount}
                    className="px-4 py-2 text-xs font-inter font-semibold text-on-surface-variant uppercase tracking-widest"
                  >
                    <span className="sticky left-4">{section.title}
                    <span className="ml-2 font-normal normal-case tracking-normal text-outline">
                      {section.rows.length} mã
                    </span></span>
                  </td>
                </tr>

                {section.rows.map((mat, index) => {
                  const payload = mat.latestReport?.payload as MaterialReportPayload | undefined
                  const threshold = mat.minThreshold != null ? parseFloat(mat.minThreshold) : null
                  const last = payload?.lastStock
                  const below = threshold !== null && typeof last === 'number' && last < threshold
                  const reconciliation = reconcileStock(payload, mat)

                  return (
                    <tr
                      key={mat.id}
                      onClick={() => onRowClick(mat)}
                      className={`group hover:bg-[#f0eded] cursor-pointer transition-colors duration-150 ${index % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low'}`}
                    >
                      <td className={`sticky left-0 z-10 min-w-[180px] max-w-[200px] px-4 py-3 text-sm font-semibold text-on-surface group-hover:bg-[#f0eded] ${index % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low'}`}>
                        <button type="button" title={mat.name} onClick={e => { e.stopPropagation(); onReports(mat) }} className="max-w-full truncate text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{mat.name}</button>
                        {mat.latestReport && <div className="text-xs font-normal text-secondary mt-1">Kỳ nguồn: {reportPeriodLabel(mat.latestReport.reportDate, mat.latestReport.payload)}</div>}
                        {mat.latestReport && <div className="text-xs font-normal text-secondary mt-1">{reconciliationRange([mat.latestReport])}</div>}
                        {mat.group === 'MB' && <div className="text-xs font-normal text-secondary mt-1">{[['Item Code', payload?.itemCode ?? mat.itemCode], ['Mã màu', payload?.color ?? mat.color], ['Tên màu', payload?.colorName ?? mat.colorName], ['Hãng', payload?.brand ?? mat.brand], ['Độ bền màu', payload?.lightFastness ?? mat.lightFastness]].filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(' · ')}</div>}
                      </td>
                      {!mat.latestReport ? <td colSpan={REPORT_COLUMNS.length + 3} className="px-3 py-3 text-sm text-secondary">Chưa có báo cáo HDPE{reportDate ? ` ngày ${reportDate.split('-').reverse().join('/')}` : ''}</td> : <>
                      {REPORT_COLUMNS.map(col => (
                        <td
                          key={col.key}
                          className={`px-3 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap ${
                            col.key === 'lastStock' && below ? 'text-error font-semibold' : 'text-on-surface'
                          }`}
                        >
                          <Num value={payload?.[col.key]} />
                        </td>
                      ))}
                      {(['ac', 'ad', 'check'] as const).map(key => <td key={key} title={reconciliation.reason} className={`px-3 py-3 text-right font-mono text-sm tabular-nums whitespace-nowrap ${key === 'check' && reconciliation.warning ? 'text-error font-semibold' : 'text-on-surface'}`}><Num value={reconciliation[key]} /></td>)}
                      </>}
                      <td className="px-3 py-3 text-right font-mono text-sm text-on-surface-variant tabular-nums whitespace-nowrap">
                        {threshold != null ? threshold.toLocaleString('vi-VN') : <span className="italic text-outline">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => onHistory(mat)} aria-label={`Xem lịch sử ${mat.name}`} title="Lịch sử" className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-outline-variant text-secondary bg-transparent hover:bg-surface-container">
                            <span className="material-symbols-outlined text-[16px]">history</span>
                          </button>
                          <MaterialActionsMenu materialName={mat.name} onEdit={() => onEdit(mat)} onDelete={() => onDelete(mat)} />
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {section.rows.length > 1 && <tr className="bg-surface-container/60 font-semibold">
                  <td className="sticky left-0 z-10 bg-surface-container px-4 py-2 text-sm text-on-surface-variant whitespace-nowrap">Tổng</td>
                  {REPORT_COLUMNS.map(col => (
                    <td key={col.key} className="px-3 py-2 text-right font-mono text-sm tabular-nums text-on-surface whitespace-nowrap">
                      <Num value={sumBy(section.rows, col.key)} />
                    </td>
                  ))}
                  {(['ac', 'ad', 'check'] as const).map(key => {
                    const total = totalReconciliation(section.rows)
                    return <td key={key} title={total.reason} className={`px-3 py-2 text-right font-mono text-sm tabular-nums whitespace-nowrap ${key === 'check' && total.warning ? 'text-error' : 'text-on-surface'}`}><Num value={total[key]} /></td>
                  })}
                  <td colSpan={2} />
                </tr>}
              </tbody>
            ))
          )}
        </table>
      </div>
    </div>
  )
}
