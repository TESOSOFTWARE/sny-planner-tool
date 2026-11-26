'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { StagePlanProfile } from '@/lib/excel/parseStagePlanWorkbook'
import { prepareStagePlanFiles } from '@/lib/excel/prepareStagePlanFiles'

type Stage = 'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing'
type PlanRow = { id?: string; sourceKey: string; sourceSheet: string; sourceRow: number; planDate: string | null; machineLabel: string | null; orderRef: string | null; displayData: Record<string, unknown>; warnings: string[] }
type Preview = { success: boolean; error?: string; stage: string; profile: StagePlanProfile; scopeKey: string; fileName: string; sourceSheets: string[]; skippedSheets?: string[]; availableSheets: string[]; rows: PlanRow[]; totalRows?: number; datedCount?: number; undatedCount?: number; previewTruncated?: boolean; warnings: string[]; expectedSnapshot?: string; needsSheetSelection?: boolean }
type SavedBatch = { id: string; fileName: string; createdAt: string; rowCount: number; summary: unknown }
type RecordsResponse = { success: boolean; error?: string; batch: { fileName: string } | null; rows: PlanRow[]; total: number; page: number; limit: number; history: SavedBatch[] }
type AvailableProfilesResponse = { success: boolean; profiles: Array<{ profile: StagePlanProfile; scopeKey: string; confirmedAt: string }> }
type PendingImport = { file: File; expectedSnapshot: string; profile: StagePlanProfile }

const profileOptions: Record<Stage, Array<{ id: StagePlanProfile; label: string; accept: string }>> = {
  extruder: [
    { id: 'extruder-machine', label: 'Lịch máy EXTRUDER', accept: '.xlsx' },
    { id: 'fiber-demand-matrix', label: 'Kế hoạch chỉ kéo sợi theo ngày', accept: '.xlsx' },
  ],
  warping: [{ id: 'warping-work-order', label: 'Work order WARPING (CC2018)', accept: '.xlsb,.xlsx' }],
  knitting: [],
  rolling: [],
  packing: [{ id: 'pallet-dated', label: 'Kế hoạch đóng pallet', accept: '.xlsx' }],
}

const stageLabel: Record<Stage, string> = { extruder: 'Kéo sợi', warping: 'Mắc sợi', knitting: 'Dệt', rolling: 'Cuộn', packing: 'Đóng pallet' }
const profileLabel: Record<StagePlanProfile, string> = {
  'extruder-machine': 'Lịch máy EXTRUDER',
  'fiber-demand-matrix': 'Kế hoạch chỉ kéo sợi theo ngày',
  'warping-work-order': 'Work order WARPING',
  'pallet-dated': 'Kế hoạch đóng pallet',
}
const control = 'rounded border border-outline px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const button = 'rounded border border-outline-variant px-3 py-2 text-sm text-primary hover:bg-surface-container disabled:opacity-50'
const number = (value: unknown) => typeof value === 'number' ? value.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : String(value ?? '—')
const displayDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : value ?? 'Chưa xếp ngày'
const isoMonth = (value: string) => /^\d{4}-\d{2}$/.test(value) ? value : ''

function periodForSheet(sheet: string, profile: StagePlanProfile, year: number): string | null {
  if (profile === 'fiber-demand-matrix') {
    const month = ({ JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' } as Record<string, string>)[sheet.trim().toUpperCase()]
    return month ? `${year}-${month}` : null
  }
  const match = sheet.trim().match(/^(0?\d|1[0-2])[./_-](20\d{2})$/)
  return match ? `${match[2]}-${String(Number(match[1])).padStart(2, '0')}` : null
}

function isMonthly(profile: StagePlanProfile) { return profile === 'extruder-machine' || profile === 'fiber-demand-matrix' }

function inferProfile(fileName: string, stage: Stage, fallback: StagePlanProfile | ''): StagePlanProfile | '' {
  if (stage !== 'extruder') return fallback
  const name = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (name.includes('keo soi') || name.includes('fiber')) return 'fiber-demand-matrix'
  if (name.includes('extruder')) return 'extruder-machine'
  return fallback
}

function renderPayloadCell(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') return number(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function StagePlanImportWorkspace({ selectedStage, yearMonth, refreshToken = 0, onImportSaved, onScopeDetected }: { selectedStage: Stage; yearMonth: string; refreshToken?: number; onImportSaved?: (scopeKey: string, profile: StagePlanProfile) => void; onScopeDetected?: (scopeKey: string) => void }) {
  const profiles = profileOptions[selectedStage]
  const [profile, setProfile] = useState<StagePlanProfile | ''>(profiles[0]?.id ?? '')
  const [importOpen, setImportOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const requestGeneration = useRef(0)
  const recordsGeneration = useRef(0)
  const calendarGeneration = useRef(0)
  const availabilityGeneration = useRef(0)
  const lastScheduleMonth = useRef(yearMonth)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [availableSheets, setAvailableSheets] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rows, setRows] = useState<PlanRow[]>([])
  const [calendarRows, setCalendarRows] = useState<PlanRow[]>([])
  const [history, setHistory] = useState<SavedBatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [previewPage, setPreviewPage] = useState(1)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingRows, setLoadingRows] = useState(false)
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [viewProfile, setViewProfile] = useState<StagePlanProfile | ''>(profiles[0]?.id ?? '')
  const pageSize = 50
  const previewPageCount = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / pageSize))
  const previewRows = (preview?.rows ?? []).slice((previewPage - 1) * pageSize, previewPage * pageSize)
  const currentScope = useMemo(() => viewProfile && (isMonthly(viewProfile) || viewProfile === 'pallet-dated') ? isoMonth(yearMonth) : 'all', [viewProfile, yearMonth])

  useEffect(() => {
    requestGeneration.current += 1
    recordsGeneration.current += 1
    calendarGeneration.current += 1
    availabilityGeneration.current += 1
    let nextProfile = profileOptions[selectedStage][0]?.id ?? ''
    try {
      const savedProfile = window.localStorage.getItem(`sny-schedule-plan-profile:${selectedStage}`) ?? ''
      if (profileOptions[selectedStage].some(option => option.id === savedProfile)) nextProfile = savedProfile as StagePlanProfile
    } catch { /* Local storage may be unavailable. */ }
    setProfile(nextProfile); setViewProfile(nextProfile); setFile(null); setUploadFiles([]); setPendingImports([]); setPreview(null); setAvailableSheets([]); setRows([]); setCalendarRows([]); setHistory([]); setError(''); setMessage(''); setLoadingPreview(false); setLoadingRows(false); setLoadingCalendar(false); setSaving(false); setImportOpen(false)
  }, [selectedStage])

  useEffect(() => {
    const generation = availabilityGeneration.current
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/schedule/plan-import/available?stage=${encodeURIComponent(selectedStage)}`, { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json() as AvailableProfilesResponse
        if (generation !== availabilityGeneration.current || !data.success || !data.profiles.length) return
        let savedProfile = ''
        try { savedProfile = window.localStorage.getItem(`sny-schedule-plan-profile:${selectedStage}`) ?? '' } catch { /* Local storage may be unavailable. */ }
        const preferred = data.profiles.find(item => item.profile === savedProfile) ?? data.profiles[0]
        setProfile(preferred.profile); setViewProfile(preferred.profile)
        try { window.localStorage.setItem(`sny-schedule-plan-profile:${selectedStage}`, preferred.profile) } catch { /* Local storage may be unavailable. */ }
        onScopeDetected?.(preferred.scopeKey)
      } catch { /* The normal records request shows any database/schema error. */ }
    })()
    return () => controller.abort()
  }, [selectedStage])

  useEffect(() => {
    if (lastScheduleMonth.current === yearMonth) return
    lastScheduleMonth.current = yearMonth
    availabilityGeneration.current += 1
    if (!file || !profile || (!isMonthly(profile) && profile !== 'pallet-dated')) return
    if (saving) {
      requestGeneration.current += 1
      setSaving(false); setFile(null); setUploadFiles([]); setPendingImports([]); setPreview(null); setAvailableSheets([]); setSelectedSheet('')
      setMessage('Kỳ đã đổi trong lúc nhập; phần đang chờ phản hồi có thể đã lưu. Hãy chọn lại file để phân tích theo kỳ mới.')
      return
    }
    void chooseFile(file)
  }, [yearMonth])

  async function loadRows(activeProfile = viewProfile, scopeKey = currentScope, activePage = page, activeQuery = query) {
    const generation = ++recordsGeneration.current
    if (!activeProfile || !scopeKey) { setRows([]); setHistory([]); setTotal(0); return }
    setLoadingRows(true); setError('')
    try {
      const params = new URLSearchParams({ stage: selectedStage, profile: activeProfile, scopeKey, page: String(activePage), limit: '500' })
      if (activeQuery.trim()) params.set('q', activeQuery.trim())
      if (activeProfile === 'pallet-dated' && isoMonth(yearMonth)) {
        const [year, month] = yearMonth.split('-').map(Number), last = new Date(Date.UTC(year, month, 0)).getUTCDate()
        params.set('from', `${yearMonth}-01`); params.set('to', `${yearMonth}-${String(last).padStart(2, '0')}`)
      }
      const response = await fetch(`/api/schedule/plan-import/records?${params}`)
      const data = await response.json() as RecordsResponse
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được kế hoạch đã nhập.')
      if (generation !== recordsGeneration.current) return
      setRows(data.rows ?? []); setTotal(data.total ?? 0); setHistory(data.history ?? [])
    } catch (problem) { if (generation === recordsGeneration.current) setError(problem instanceof Error ? problem.message : 'Không tải được kế hoạch đã nhập.') }
    finally { if (generation === recordsGeneration.current) setLoadingRows(false) }
  }

  useEffect(() => { void loadRows(viewProfile, currentScope, page, query) }, [viewProfile, currentScope, yearMonth, selectedStage, page, refreshToken, query])

  useEffect(() => {
    const generation = ++calendarGeneration.current
    const needsCalendar = viewProfile === 'fiber-demand-matrix' || viewProfile === 'extruder-machine' || viewProfile === 'pallet-dated'
    if (!viewProfile || !currentScope || !needsCalendar) { setCalendarRows([]); setLoadingCalendar(false); return }
    const controller = new AbortController()
    setCalendarRows([]); setLoadingCalendar(true)
    void (async () => {
      try {
        const allRows: PlanRow[] = []
        const pageLimit = 500
        const pageCount = async (pageNumber: number) => {
          const params = new URLSearchParams({ stage: selectedStage, profile: viewProfile, scopeKey: currentScope, page: String(pageNumber), limit: String(pageLimit) })
          if (viewProfile === 'pallet-dated') {
            const [year, month] = yearMonth.split('-').map(Number), last = new Date(Date.UTC(year, month, 0)).getUTCDate()
            params.set('from', `${yearMonth}-01`); params.set('to', `${yearMonth}-${String(last).padStart(2, '0')}`)
          }
          const response = await fetch(`/api/schedule/plan-import/records?${params}`, { signal: controller.signal })
          const data = await response.json() as RecordsResponse
          if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được lịch kế hoạch Excel.')
          return data
        }
        const first = await pageCount(1)
        allRows.push(...(first.rows ?? []))
        for (let pageNumber = 2; pageNumber <= Math.ceil(first.total / pageLimit); pageNumber++) {
          if (generation !== calendarGeneration.current) return
          const next = await pageCount(pageNumber)
          allRows.push(...(next.rows ?? []))
        }
        if (generation === calendarGeneration.current) setCalendarRows(allRows)
      } catch (problem) {
        if (generation === calendarGeneration.current && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Không tải được lịch kế hoạch Excel.')
      } finally { if (generation === calendarGeneration.current) setLoadingCalendar(false) }
    })()
    return () => { controller.abort(); calendarGeneration.current += 1 }
  }, [viewProfile, currentScope, selectedStage, yearMonth, refreshToken])

  async function requestPreview(source: File, selectedProfile: StagePlanProfile, sheet?: string, parts: File[] = uploadFiles.length ? uploadFiles : [source], generation = requestGeneration.current) {
    if (generation !== requestGeneration.current) return
    setLoadingPreview(true); setError(''); setMessage(''); setPreview(null)
    try {
      const parsedParts: Array<{ data: Preview; file: File }> = []
      for (const [index, part] of Array.from(parts.entries())) {
        if (generation !== requestGeneration.current) return
        if (parts.length > 1) setMessage(`Đang phân tích phần ${index + 1}/${parts.length}…`)
        const body = new FormData(); body.append('file', part); body.append('profile', selectedProfile)
        if (sheet) body.append('sheet', sheet)
        if (selectedProfile === 'fiber-demand-matrix') body.append('year', yearMonth.split('-')[0])
        if (selectedProfile === 'pallet-dated') body.append('period', yearMonth)
        const response = await fetch('/api/schedule/plan-import', { method: 'POST', body })
        if (generation !== requestGeneration.current) return
        const data = await response.json() as Preview
        if (generation !== requestGeneration.current) return
        if (!response.ok || !data.success) throw new Error(data.error ?? `Không phân tích được phần file ${part.name}.`)
        parsedParts.push({ data, file: part })
      }
      const first = parsedParts[0]?.data
      if (!first) throw new Error('File không có phần dữ liệu để phân tích.')
      setAvailableSheets(first.availableSheets ?? [])
      if (first.needsSheetSelection) {
        const suggested = (first.availableSheets ?? []).find(name => periodForSheet(name, selectedProfile, Number(yearMonth.slice(0, 4))) === yearMonth)
        if (suggested) {
          setSelectedSheet(suggested)
          await requestPreview(source, selectedProfile, suggested, parts, generation)
          return
        }
        setPreview(first); setPreviewPage(1)
        return
      }
      const combined: Preview = {
        ...first,
        rows: parsedParts.flatMap(part => part.data.rows).slice(0, 200),
        totalRows: parsedParts.reduce((sum, part) => sum + (part.data.totalRows ?? part.data.rows.length), 0),
        datedCount: parsedParts.reduce((sum, part) => sum + (part.data.datedCount ?? part.data.rows.filter(row => row.planDate).length), 0),
        undatedCount: parsedParts.reduce((sum, part) => sum + (part.data.undatedCount ?? part.data.rows.filter(row => !row.planDate).length), 0),
        sourceSheets: Array.from(new Set(parsedParts.flatMap(part => part.data.sourceSheets))),
        skippedSheets: Array.from(new Set(parsedParts.flatMap(part => part.data.skippedSheets ?? []))),
        warnings: parsedParts.flatMap(part => part.data.warnings),
        expectedSnapshot: 'multi-part-preview',
        previewTruncated: parsedParts.length > 1 || parsedParts.some(part => part.data.previewTruncated),
      }
      if (generation !== requestGeneration.current) return
      setPendingImports(parsedParts.map(part => ({ file: part.file, profile: selectedProfile, expectedSnapshot: part.data.expectedSnapshot ?? '' })))
      setMessage(''); setPreview(combined); setPreviewPage(1)
    } catch (problem) { if (generation === requestGeneration.current) { setError(problem instanceof Error ? problem.message : 'Không phân tích được file kế hoạch.'); setImportOpen(true) } }
    finally { if (generation === requestGeneration.current) setLoadingPreview(false) }
  }

  async function confirmImport() {
    if (!file || !preview?.expectedSnapshot || !pendingImports.length || saving) return
    const generation = requestGeneration.current
    setSaving(true); setError(''); setMessage('')
    try {
      let confirmedParts = 0, newlySavedRows = 0, allExisting = true
      for (const [index, part] of Array.from(pendingImports.entries())) {
        if (generation !== requestGeneration.current) throw new Error(`Import đã dừng sau ${confirmedParts}/${pendingImports.length} phần vì công đoạn hoặc tháng đã thay đổi. Có thể xác nhận lại an toàn.`)
        if (pendingImports.length > 1) setMessage(`Đang lưu phần ${index + 1}/${pendingImports.length}…`)
        const body = new FormData(); body.append('file', part.file); body.append('profile', part.profile); body.append('expectedSnapshot', part.expectedSnapshot)
        if (selectedSheet) body.append('sheet', selectedSheet)
        if (part.profile === 'fiber-demand-matrix') body.append('year', yearMonth.split('-')[0])
        if (part.profile === 'pallet-dated') body.append('period', preview.scopeKey)
        const response = await fetch('/api/schedule/plan-import/confirm', { method: 'POST', body })
        if (generation !== requestGeneration.current) return
        const data = await response.json() as { success?: boolean; existing?: boolean; batch?: { rowCount?: number; fileName?: string }; error?: string }
        if (generation !== requestGeneration.current) return
        if (!response.ok || !data.success) throw new Error(`${data.error ?? `Không nhập được phần ${part.file.name}.`} Đã lưu ${confirmedParts}/${pendingImports.length} phần; có thể nhập lại an toàn.`)
        confirmedParts++; newlySavedRows += data.existing ? 0 : Number(data.batch?.rowCount ?? 0); allExisting = allExisting && Boolean(data.existing)
      }
      if (generation !== requestGeneration.current) return
      const resultProfile = preview.profile
      const resultScope = preview.scopeKey
      setViewProfile(resultProfile); setPage(1); setQuery('')
      try { window.localStorage.setItem(`sny-schedule-plan-profile:${selectedStage}`, resultProfile) } catch { /* Local storage may be unavailable. */ }
      setMessage(allExisting ? 'Các phần của file này đã nhập rồi; không tạo bản kế hoạch trùng.' : `Đã lưu ${newlySavedRows.toLocaleString('vi-VN')} dòng trong ${confirmedParts.toLocaleString('vi-VN')} phần file. Dòng chưa có ngày được giữ ở danh sách chưa xếp lịch.`)
      onImportSaved?.(resultScope, resultProfile)
      setFile(null); setUploadFiles([]); setPendingImports([]); setPreview(null); setAvailableSheets([]); setSelectedSheet(''); setImportOpen(false)
      await loadRows(resultProfile, resultScope, 1, '')
    } catch (problem) { if (generation === requestGeneration.current) setError(problem instanceof Error ? problem.message : 'Không nhập được kế hoạch.') }
    finally { if (generation === requestGeneration.current) setSaving(false) }
  }

  async function chooseFile(next: File | null) {
    if (!next || saving) return
    const selectedProfile = inferProfile(next.name, selectedStage, profile)
    if (!selectedProfile) return
    const extensions = selectedProfile === 'warping-work-order' ? ['.xlsb', '.xlsx'] : ['.xlsx']
    if (!extensions.some(extension => next.name.toLowerCase().endsWith(extension))) { setError(`Chọn file ${extensions.join(' hoặc ')} cho profile này.`); return }
    const generation = ++requestGeneration.current
    setProfile(selectedProfile); setViewProfile(selectedProfile)
    try { window.localStorage.setItem(`sny-schedule-plan-profile:${selectedStage}`, selectedProfile) } catch { /* Local storage may be unavailable. */ }
    setFile(next); setUploadFiles([]); setPendingImports([]); setSelectedSheet(''); setPreview(null); setError(''); setMessage('Đang chuẩn bị file kế hoạch…'); setLoadingPreview(true); setImportOpen(true)
    try {
      const parts = await prepareStagePlanFiles(next, selectedProfile)
      if (generation !== requestGeneration.current) return
      setUploadFiles(parts)
      if (parts.length > 1) setMessage(`File lớn được tách tự động thành ${parts.length} phần để tải an toàn; dữ liệu các sheet vẫn giữ nguyên.`)
      await requestPreview(next, selectedProfile, undefined, parts, generation)
    } catch (problem) { if (generation === requestGeneration.current) { setError(problem instanceof Error ? problem.message : 'Không chuẩn bị được file kế hoạch.'); setImportOpen(true) } }
    finally { if (generation === requestGeneration.current) setLoadingPreview(false) }
  }

  if (!profiles.length) return <section className="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm"><h2 className="font-semibold text-primary">Kế hoạch Excel — {stageLabel[selectedStage]}</h2><p className="mt-1 text-secondary">{selectedStage === 'knitting' ? 'Dệt đang dùng lưới lịch máy M-001…M-040 hiện có; chưa có file kế hoạch Dệt trong bộ mẫu này.' : 'Chưa có file kế hoạch Cuộn/Rolling trong bộ mẫu này.'}</p></section>

  const previewHeaders: Record<StagePlanProfile, string[]> = {
    'extruder-machine': ['Ngày', 'Máy', 'PI / đơn nguồn', 'Màu · Gauge · Denier', 'Giá trị trong ô lịch', 'Sheet / dòng nguồn', 'Cảnh báo'],
    'fiber-demand-matrix': ['Ngày', 'Nhóm sợi / quy cách / giá trị', 'Thông tin liên kết'],
    'warping-work-order': ['Ngày xếp lịch', 'PI / work order', 'Sản phẩm', 'Màu · Denier · Strand', 'Máy dệt liên quan', 'AMOUNT nguồn', 'BIM (số beam)', 'WEIGHT nguồn', 'Sheet / dòng nguồn', 'Cảnh báo'],
    'pallet-dated': ['Ngày kế hoạch', 'PI / đơn', 'Màu', 'Khổ × dài · trọng lượng', 'Số lượng', 'Pallet · cuộn/pallet', 'Kích thước pallet', 'Sheet / dòng nguồn', 'Cảnh báo'],
  }
  const renderRow = (row: PlanRow) => {
    if (row.displayData.products && Array.isArray(row.displayData.products)) {
      const products = row.displayData.products as Array<{ yarnGroup: string; specification: string; value: unknown; column: string }>
      return <tr key={row.id ?? row.sourceKey} className="border-t border-outline-variant"><td className="p-2 whitespace-nowrap">{displayDate(row.planDate)}</td><td className="p-2"><details><summary className="cursor-pointer">{products.length} quy cách sợi</summary><div className="mt-2 space-y-1">{products.map(item => <p key={`${item.column}:${item.yarnGroup}:${item.specification}`}>{item.yarnGroup} · {item.specification}: <strong>{renderPayloadCell(item.value)}</strong> <span className="text-secondary">(giá trị file · cột {item.column})</span></p>)}</div></details></td><td className="p-2 text-secondary">Không có PI/máy trong nguồn</td></tr>
    }
    const data = row.displayData
    if (row.machineLabel) return <tr key={row.id ?? row.sourceKey} className="border-t border-outline-variant"><td className="p-2 whitespace-nowrap">{displayDate(row.planDate)}</td><td className="p-2">{row.machineLabel}</td><td className="p-2">{row.orderRef ?? '—'}</td><td className="p-2">{String(data.color ?? '—')} · {String(data.gauge ?? '—')} · {String(data.denier ?? '—')}</td><td className="p-2 font-semibold">{renderPayloadCell(data.sourceValue)}</td><td className="p-2 text-secondary">{row.sourceSheet} · {row.sourceRow}</td><td className="p-2 text-error">{row.warnings.join(' · ') || '—'}</td></tr>
    if (row.displayData.fields && typeof row.displayData.fields === 'object') {
      const fields = row.displayData.fields as Record<string, unknown>
      return <tr key={row.id ?? row.sourceKey} className="border-t border-outline-variant"><td className="p-2">{displayDate(row.planDate)}</td><td className="p-2">{row.orderRef ?? '—'}</td><td className="p-2">{String(row.displayData.product ?? '—')}</td><td className="p-2">{String(fields.color ?? '—')} · {String(fields.denier ?? '—')}D · {String(fields.strand ?? '—')} sợi</td><td className="p-2">{String(fields.weavingMachineRef ?? '—')}</td><td className="p-2">{renderPayloadCell(fields.amount)}</td><td className="p-2">{renderPayloadCell(fields.beamCount)}</td><td className="p-2">{renderPayloadCell(fields.weightKgs)}</td><td className="p-2 text-secondary">{row.sourceSheet} · dòng {row.sourceRow}</td><td className="p-2 text-error">{row.warnings.join(' · ') || '—'}</td></tr>
    }
    return <tr key={row.id ?? row.sourceKey} className="border-t border-outline-variant"><td className="p-2">{displayDate(row.planDate)}</td><td className="p-2">{row.orderRef ?? String(data.orderRef ?? '—')}</td><td className="p-2">{String(data.color ?? '—')}</td><td className="p-2">{String(data.width ?? '—')} × {String(data.length ?? '—')} · {String(data.weight ?? '—')}</td><td className="p-2">{String(data.quantity ?? '—')}</td><td className="p-2">{String(data.pallets ?? '—')} pallet · {String(data.rollsPerPallet ?? '—')} cuộn/pallet</td><td className="p-2">{String(data.palletSize ?? '—')}</td><td className="p-2 text-secondary">{row.sourceSheet} · dòng {row.sourceRow}</td><td className="p-2 text-error">{row.warnings.join(' · ') || '—'}</td></tr>
  }

  const [calendarYear, calendarMonth] = yearMonth.split('-').map(Number)
  const calendarDayCount = Number.isFinite(calendarYear) && Number.isFinite(calendarMonth) ? new Date(Date.UTC(calendarYear, calendarMonth, 0)).getUTCDate() : 0
  const calendarDays = Array.from({ length: calendarDayCount }, (_, index) => index + 1)
  const fiberBySpec = new Map<string, { group: string; specification: string; column: string; values: Map<number, Array<{ key: string; value: unknown }>> }>()
  const extruderByMachine = new Map<string, Map<number, PlanRow[]>>()
  for (const row of calendarRows) {
    if (!row.planDate || row.planDate.slice(0, 7) !== yearMonth) continue
    const day = Number(row.planDate.slice(8, 10))
    if (!Number.isInteger(day) || day < 1 || day > calendarDayCount) continue
    if (viewProfile === 'fiber-demand-matrix' && Array.isArray(row.displayData.products)) {
      for (const product of row.displayData.products as Array<{ yarnGroup: string; specification: string; value: unknown; column: string }>) {
        const key = `${product.yarnGroup}|${product.specification}|${product.column}`
        const item = fiberBySpec.get(key) ?? { group: product.yarnGroup, specification: product.specification, column: product.column, values: new Map<number, Array<{ key: string; value: unknown }>>() }
        const values = item.values.get(day) ?? []
        values.push({ key: `${row.sourceKey}:${product.column}`, value: product.value })
        item.values.set(day, values); fiberBySpec.set(key, item)
      }
    }
    if (viewProfile === 'extruder-machine' && row.machineLabel) {
      const byDay = extruderByMachine.get(row.machineLabel) ?? new Map<number, PlanRow[]>()
      byDay.set(day, [...(byDay.get(day) ?? []), row]); extruderByMachine.set(row.machineLabel, byDay)
    }
  }
  const monthCaption = yearMonth.split('-').reverse().join('/')
  const hasDatedCalendar = viewProfile === 'fiber-demand-matrix' || viewProfile === 'extruder-machine' || viewProfile === 'pallet-dated'
  const visiblePlanCount = viewProfile === 'warping-work-order' ? total : calendarRows.length
  const showRawDetails = viewProfile === 'fiber-demand-matrix' || viewProfile === 'extruder-machine'
  const rawRecordsContent = <div className="space-y-3 border-t border-outline-variant pt-3">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold text-primary">{showRawDetails ? 'Dữ liệu nguồn' : `Kế hoạch đã nhập · ${monthCaption}`}</h3><p className="text-xs text-secondary">{loadingRows ? 'Đang tải…' : `${total.toLocaleString('vi-VN')} dòng trong profile này`}</p></div><label className="text-sm">Tìm PI / sheet<input className={`${control} ml-2`} value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} /></label></div>
    {error && !preview && <p role="alert" className="text-sm text-error">{error}</p>}
    {!loadingRows && !rows.length ? <p role="status" className="text-sm text-secondary">Chưa có kế hoạch Excel cho profile này trong kỳ đang xem.</p> : <div className="overflow-x-auto rounded border border-outline-variant"><table className="w-full min-w-max text-sm"><thead className="bg-surface-container"><tr>{viewProfile === 'fiber-demand-matrix' ? ['Ngày','Quy cách sợi / giá trị theo file','Thông tin PI/máy'] : (viewProfile === 'extruder-machine' ? ['Ngày','Máy','PI/đơn','Quy cách','Giá trị theo file','Nguồn','Cảnh báo'] : viewProfile === 'warping-work-order' ? ['Ngày xếp lịch','PI/work order','Sản phẩm','Màu / denier / strand','Máy dệt liên quan','AMOUNT nguồn','BIM (số beam)','WEIGHT nguồn','Nguồn','Cảnh báo'] : ['Ngày','Đơn','Màu','Khổ × dài / trọng lượng','Số lượng','Pallet / cuộn mỗi pallet','Kích thước pallet','Nguồn','Cảnh báo']).map(column=><th key={column} className="whitespace-nowrap p-2 text-left">{column}</th>)}</tr></thead><tbody>{rows.map(renderRow)}</tbody></table></div>}
    {total>500 && <div className="flex items-center gap-2 text-xs"><span>Trang {page}/{Math.ceil(total/500)}</span><button className={button} disabled={page<=1} onClick={()=>{setPage(value=>Math.max(1,value-1));void loadRows(viewProfile,currentScope,Math.max(1,page-1),query)}}>Trước</button><button className={button} disabled={page>=Math.ceil(total/500)} onClick={()=>{setPage(value=>Math.min(Math.ceil(total/500),page+1));void loadRows(viewProfile,currentScope,Math.min(Math.ceil(total/500),page+1),query)}}>Sau</button></div>}
    {history.length>1 && <details><summary className="cursor-pointer text-xs">Lịch sử import {history.length} phiên gần nhất</summary><ul className="mt-2 space-y-1 text-xs">{history.map(item=><li key={item.id}>{item.fileName} · {new Date(item.createdAt).toLocaleString('vi-VN')} · {item.rowCount.toLocaleString('vi-VN')} dòng</li>)}</ul></details>}
  </div>

  return <section aria-label={`Import kế hoạch ${stageLabel[selectedStage]}`} className="space-y-4 rounded border border-outline-variant bg-surface-container-lowest p-3 md:p-4">
    <header><h2 className="text-base font-semibold text-primary">Lịch kế hoạch Excel — {stageLabel[selectedStage]}</h2><p className="text-xs text-secondary">Tháng {monthCaption}. Chọn file để thêm hoặc cập nhật kế hoạch.</p></header>
    <details open={importOpen} onToggle={event => setImportOpen(event.currentTarget.open)} className="rounded border border-outline-variant bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-primary">Nhập / cập nhật file Excel</summary>
      <div className="space-y-3 border-t border-outline-variant p-3">
        {profiles.length > 1 && <label className="block max-w-md text-sm">Loại kế hoạch<select className={`${control} mt-1 w-full`} value={profile} disabled={saving} onChange={event => { requestGeneration.current += 1; recordsGeneration.current += 1; setLoadingPreview(false); setLoadingRows(false); const nextProfile = event.target.value as StagePlanProfile; setProfile(nextProfile); setViewProfile(nextProfile); try { window.localStorage.setItem(`sny-schedule-plan-profile:${selectedStage}`, nextProfile) } catch { /* Local storage may be unavailable. */ }; setPreview(null); setFile(null); setUploadFiles([]); setPendingImports([]); setAvailableSheets([]); setSelectedSheet('') }}>{profiles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
        <div onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0] ?? null) }} className={`rounded border border-dashed p-3 text-sm ${dragging ? 'border-primary bg-primary/5' : 'border-outline-variant'}`}>
          <label className="block cursor-pointer">Thả file vào đây hoặc bấm để chọn<input className="mt-2 block w-full text-xs" type="file" disabled={saving} accept={profiles.find(item => item.id === profile)?.accept} onChange={event => { chooseFile(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} /></label>
          <p className="mt-1 text-xs text-secondary">{file ? file.name : `Định dạng: ${profiles.find(item => item.id === profile)?.accept}`}</p>
        </div>
        {profile && isMonthly(profile) && availableSheets.length > 0 && <label className="block max-w-sm text-sm">Sheet tháng<select className={`${control} mt-1 w-full`} value={selectedSheet} onChange={event => { const sheet = event.target.value; setSelectedSheet(sheet); if (file && profile && sheet) void requestPreview(file, profile, sheet) }}><option value="">Chọn sheet tháng muốn xem</option>{availableSheets.map(name => <option key={name} value={name}>{name}{periodForSheet(name, profile, Number(yearMonth.slice(0, 4))) === yearMonth ? ' · tháng đang chọn' : ''}</option>)}</select></label>}
        {preview?.needsSheetSelection && <p className="text-sm text-secondary">File có nhiều sheet tháng. Chọn sheet để hiển thị kế hoạch.</p>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {preview && !preview.needsSheetSelection && <div className="space-y-3 rounded border border-outline-variant bg-surface-container-low p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">Xem trước {profileLabel[preview.profile]} · {preview.scopeKey || preview.sourceSheets.join(', ')}</p><p className="text-xs text-secondary">{(preview.totalRows ?? preview.rows.length).toLocaleString('vi-VN')} dòng · {(preview.datedCount ?? preview.rows.filter(row => row.planDate).length).toLocaleString('vi-VN')} có ngày · {(preview.undatedCount ?? preview.rows.filter(row => !row.planDate).length).toLocaleString('vi-VN')} chưa xếp ngày</p></div>{preview.expectedSnapshot && <button type="button" className="rounded bg-primary px-3 py-2 text-sm text-white disabled:opacity-50" disabled={saving} onClick={() => void confirmImport()}>{saving ? 'Đang lưu…' : 'Nhập kế hoạch'}</button>}</div>
      {uploadFiles.length > 1 && <p role="status" className="text-xs text-secondary">File lớn đã được tách tự động thành {uploadFiles.length} phần nhỏ. Khi nhập lại, các sheet giống nhau sẽ được nhận diện và không bị nhân đôi.</p>}
      {preview.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-error">{preview.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
      {preview.skippedSheets?.length ? <details><summary className="cursor-pointer text-sm">Sheet bị bỏ qua không đúng profile ({preview.skippedSheets.length})</summary><p className="mt-2 text-xs text-secondary">{preview.skippedSheets.slice(0,30).join(', ')}{preview.skippedSheets.length>30?'…':''}</p></details> : null}
      {preview.previewTruncated && <p className="text-xs text-secondary">Đang xem mẫu 200 dòng đầu; xác nhận nhập toàn bộ {preview.totalRows?.toLocaleString('vi-VN')} dòng.</p>}
      <div className="max-h-[32rem] overflow-auto rounded border border-outline-variant"><table className="w-full min-w-max text-sm"><thead className="sticky top-0 bg-surface-container"><tr>{previewHeaders[preview.profile].map(column => <th key={column} className="whitespace-nowrap p-2 text-left">{column}</th>)}</tr></thead><tbody>{previewRows.map(renderRow)}</tbody></table></div>
      {preview.rows.length > pageSize && <div className="flex items-center gap-2 text-xs"><span>Trang {previewPage}/{previewPageCount}</span><button className={button} disabled={previewPage<=1} onClick={()=>setPreviewPage(value=>Math.max(1,value-1))}>Trước</button><button className={button} disabled={previewPage>=previewPageCount} onClick={()=>setPreviewPage(value=>Math.min(previewPageCount,value+1))}>Sau</button></div>}
        </div>}
      </div>
    </details>
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    {error && !preview && !importOpen && <p role="alert" className="text-sm text-error">{error}</p>}

    <div className="space-y-3 border-t border-outline-variant pt-3">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-semibold text-primary">Lịch tháng {monthCaption}</h3><p className="text-xs text-secondary">{viewProfile === 'warping-work-order' ? `${total.toLocaleString('vi-VN')} work order chưa xếp ngày` : loadingCalendar ? 'Đang tải lịch…' : `${visiblePlanCount.toLocaleString('vi-VN')} dòng kế hoạch trong tháng`}</p></div></div>
      {hasDatedCalendar && !loadingCalendar && calendarRows.length === 0 && <p role="status" className="text-sm text-secondary">Tháng này chưa có kế hoạch Excel. Bấm “Nhập / cập nhật file Excel” để thêm file.</p>}
      {viewProfile === 'fiber-demand-matrix' && calendarRows.length > 0 && <section aria-label="Lịch kế hoạch kéo sợi theo ngày và quy cách" className="space-y-2 rounded border border-outline-variant bg-surface-container-low p-3">
        <div><h3 className="font-semibold text-primary">Lịch kế hoạch kéo sợi · {monthCaption}</h3><p className="text-xs text-secondary">Giá trị theo từng ngày và quy cách, giữ nguyên như file; nguồn không có thông tin PI hoặc máy.</p></div>
        <div className="max-h-[38rem] overflow-auto rounded border border-outline-variant bg-white"><table className="w-full min-w-max border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-surface-container"><tr><th className="sticky left-0 z-20 min-w-36 border-b border-r border-outline-variant bg-surface-container p-2 text-left">Nhóm sợi</th><th className="sticky left-36 z-20 min-w-44 border-b border-r border-outline-variant bg-surface-container p-2 text-left">Quy cách</th>{calendarDays.map(day=><th key={day} className="min-w-16 border-b border-r border-outline-variant p-2 text-center">{day}</th>)}</tr></thead><tbody>{Array.from(fiberBySpec, ([key, item])=><tr key={key} className="border-t border-outline-variant"><td className="sticky left-0 z-[1] border-r border-outline-variant bg-white p-2">{item.group || '—'}</td><td className="sticky left-36 z-[1] border-r border-outline-variant bg-white p-2">{item.specification || `Cột ${item.column}`}</td>{calendarDays.map(day=><td key={day} className="border-r border-outline-variant p-1 text-right tabular-nums">{(item.values.get(day) ?? []).map(value=><span key={value.key} className="block whitespace-nowrap">{renderPayloadCell(value.value)}</span>)}</td>)}</tr>)}</tbody></table></div>
      </section>}
      {viewProfile === 'extruder-machine' && calendarRows.length > 0 && <section aria-label="Lịch kế hoạch máy kéo sợi theo ngày" className="space-y-2 rounded border border-outline-variant bg-surface-container-low p-3">
        <div><h3 className="font-semibold text-primary">Lịch kế hoạch EXTRUDER · {monthCaption}</h3><p className="text-xs text-secondary">Máy theo hàng, ngày theo cột. PI và giá trị trong ô được giữ nguyên như workbook.</p></div>
        <div className="max-h-[38rem] overflow-auto rounded border border-outline-variant bg-white"><table className="w-full min-w-max border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-surface-container"><tr><th className="sticky left-0 z-20 min-w-24 border-b border-r border-outline-variant bg-surface-container p-2 text-left">Máy</th>{calendarDays.map(day=><th key={day} className="min-w-28 border-b border-r border-outline-variant p-2 text-center">{day}</th>)}</tr></thead><tbody>{Array.from(extruderByMachine, ([machine, byDay])=><tr key={machine} className="border-t border-outline-variant"><th className="sticky left-0 z-[1] border-r border-outline-variant bg-white p-2 text-left">{machine}</th>{calendarDays.map(day=><td key={day} className="border-r border-outline-variant p-1 align-top">{(byDay.get(day) ?? []).map(row=><div key={row.id ?? row.sourceKey} className="mb-1 rounded bg-primary/5 p-1"><span className="block font-medium">{row.orderRef ?? 'Chưa ghi mã'}</span><span className="block">{renderPayloadCell(row.displayData.sourceValue)}</span></div>)}</td>)}</tr>)}</tbody></table></div>
      </section>}
      {viewProfile === 'warping-work-order' && total > 0 && <p role="status" className="text-xs text-secondary">Work order chưa có ngày/ca; danh sách bên dưới chưa được xếp vào ngày.</p>}
      {!loadingRows && !rows.length && <p role="status" className="text-sm text-secondary">Chưa có kế hoạch cho công đoạn này trong tháng.</p>}
      {showRawDetails ? <details className="rounded border border-outline-variant bg-white"><summary className="cursor-pointer px-3 py-2 text-sm text-primary">Chi tiết dữ liệu nguồn · {total.toLocaleString('vi-VN')} dòng</summary>{rawRecordsContent}</details> : rawRecordsContent}
    </div>
  </section>
}
