'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useScheduleModalFocus } from './useModalFocus'
import ProductionDurationSummary from './ProductionDurationSummary'
import { useAssignmentDates } from './useAssignmentDates'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { toast } from 'sonner'
import { getUnassignedOrders } from '@/app/schedule/actions'
import { calcOrderStatus, type OrderStatus } from '@/lib/orderStatus'
import PiOrderPanel from './PiOrderPanel'
import TransferAssignmentModal from './TransferAssignmentModal'
import { lineLabel, orderQuantityLabel, hasUnusedOrderQuantity } from '@/lib/schedule/piDisplay'

export type AssignmentDetail = {
  id: string
  machineId: string
  startDate: string
  endDate: string
  allocatedMeters: string | null  // Decimal serialised as string by Prisma
  estimatedDailyOutput: string | null  // Decimal serialised as string by Prisma
  endDateSource?: 'MANUAL' | 'COMPUTED' | 'IMPORTED'
  isPlaceholder?: boolean
  order: {
    id: string
    piNumber: string
    subLineIndex?: number
    isPlaceholder?: boolean
    itemCode?: string | null
    customer: string
    isDraft?: boolean
    widthM: number
    lengthM: number
    gsm: number
    color: string
    mbCode: string | null
    qty: number | null
    orderType?: string | null
    rollLength?: number | string | null
    pieceLength?: number | string | null
    meshType: string | null
    description?: string | null
    needleCount: number | null
    hasEyelet: boolean
    eyeletColor: string | null
    totalWeightKgs: unknown  // Prisma Decimal — serialised as string over JSON
  }
}

type Order = { id: string; piNumber: string; customer: string; subLineIndex?: number; isPlaceholder?: boolean; widthM: number | null; color: string | null; gsm: number | null; calculatedStatus?: OrderStatus }

interface Props {
  isOpen: boolean
  onClose: () => void
  assignment: AssignmentDetail | null
  onSuccess: () => void
}

// Hằng số ở module scope: hook đưa setEndDate vào deps của effect, không được tạo hàm mới mỗi lần render.
const noopSetEndDate = () => {}

export default function DetailModal({ isOpen, onClose, assignment, onSuccess }: Props) {
  const [piLineCount, setPiLineCount] = useState<{ piNumber: string; count: number | null } | null>(null)
  const handlePiLineCount = useCallback((piNumber: string, count: number | null) => setPiLineCount({ piNumber, count }), [])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false)
  const [transferOpen,setTransferOpen] = useState(false)
  const transferOpenRef = useRef(false)
  transferOpenRef.current = transferOpen
  const handleDetailClose = useCallback(()=>{if(!transferOpenRef.current)onClose()},[onClose])
  const closeTransfer = useCallback(()=>setTransferOpen(false),[])
  const modalRef = useRef<HTMLDivElement>(null)
  useScheduleModalFocus(isOpen, handleDetailClose, modalRef)

  // Edit state
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [editMachineId, setEditMachineId] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editAllocatedMeters, setEditAllocatedMeters] = useState('')
  const [editEstimatedDailyOutput, setEditEstimatedDailyOutput] = useState('')
  const [includeFinished, setIncludeFinished] = useState(false)
  const [hiddenCount, setHiddenCount] = useState(0)
  const [loadingOrders, setLoadingOrders] = useState(false)

  useEffect(() => {
    if (isOpen && assignment) {
      setIsEditing(false)
      setTransferOpen(false)
      setIncludeFinished(false)
      setIsConfirmingRemoval(false)
      setError('')
      setSelectedOrderId(assignment.order.id)
      setEditMachineId(assignment.machineId)
      setEditStartDate(scheduleDay(assignment.startDate))
      setEditEndDate(scheduleDay(assignment.endDate))
      setEditAllocatedMeters(assignment.allocatedMeters ?? '')
      setEditEstimatedDailyOutput(assignment.estimatedDailyOutput ?? '')
    }
  }, [isOpen, assignment])

  // Sửa phân công: đổi số mét / năng suất / ngày bắt đầu thì tự tính lại (0810-25 S1).
  const dates = useAssignmentDates({
    enabled: isOpen && isEditing, startDate: editStartDate, endDate: editEndDate,
    allocatedMeters: editAllocatedMeters, estimatedDailyOutput: editEstimatedDailyOutput,
    setEndDate: setEditEndDate, originalStartDate: assignment ? scheduleDay(assignment.startDate) : '',
    autoOnFormulaChange: true,
  })
  // Chế độ xem: đo lịch đang lưu so với công thức, không ghi gì (0810-25 C4).
  const viewDates = useAssignmentDates({
    enabled: isOpen && !isEditing && !!assignment, startDate: assignment ? scheduleDay(assignment.startDate) : '',
    endDate: assignment ? scheduleDay(assignment.endDate) : '', allocatedMeters: assignment?.allocatedMeters ?? '',
    estimatedDailyOutput: assignment?.estimatedDailyOutput ?? '', setEndDate: noopSetEndDate,
    originalStartDate: assignment ? scheduleDay(assignment.startDate) : '',
  })

  const loadOrderOptions = async (include: boolean) => {
    if (!assignment) return
    setLoadingOrders(true)
    try {
      const data = await getUnassignedOrders(include)
      const currentOrder = { ...assignment.order, calculatedStatus: data.orders.find(o => o.id === assignment.order.id)?.calculatedStatus ?? calcOrderStatus([assignment]) }
      const allOptions = [
        currentOrder,
        ...data.orders.filter(o => o.id !== currentOrder.id)
      ]
      setOrders(allOptions)
      setSelectedOrderId(current => allOptions.some(o => o.id === current) ? current : currentOrder.id)
      setHiddenCount(Math.max(0, data.hiddenCount - (!include && !data.orders.some(o => o.id === currentOrder.id) ? 1 : 0)))
    } catch (err) {
      setError('Không tải được danh sách dòng hàng')
    } finally { setLoadingOrders(false) }
  }
  const handleEditClick = async () => {
    setIsEditing(true)
    await loadOrderOptions(includeFinished)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignment) return
    if (dates.loading || dates.error) { setError(dates.error || 'Đang tính lịch, vui lòng đợi.'); return }
    setError('')
    setIsLoading(true)

    try {
      const parsedStart = new Date(editStartDate)
      const parsedEnd = new Date(editEndDate)

      if (parsedEnd < parsedStart) {
        setError('Ngày kết thúc không được trước ngày bắt đầu')
        setIsLoading(false)
        return
      }

      const startISO = new Date(`${editStartDate}T00:00:00+07:00`).toISOString()
      const endISO = new Date(`${editEndDate}T00:00:00+07:00`).toISOString()

      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: editMachineId,
          orderId: selectedOrderId,
          startDate: startISO,
          endDate: endISO,
          endDateSource: dates.endDateSource,
          allocatedMeters: editAllocatedMeters === '' ? null : Number(editAllocatedMeters),
          estimatedDailyOutput: editEstimatedDailyOutput === '' ? null : Number(editEstimatedDailyOutput),
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Không thể cập nhật phân công')
      }
      if (data.warnings?.length) toast.warning(data.warnings.join(' '))
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnassign = async () => {
    if (!assignment) return
    if (!isConfirmingRemoval) return
    
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Không thể gỡ phân công')
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !assignment) return null

  const MACHINES = Array.from({ length: 40 }, (_, i) => `M-${String(i + 1).padStart(3, '0')}`)

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef} role="dialog" aria-modal="true" aria-label="Chi tiết phân công"
        className="bg-surface rounded-xl shadow-lg w-full max-w-md lg:max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-md py-sm border-b-[0.5px] border-outline-variant flex justify-between items-center">
          <h3 className="text-headline-sm font-inter font-semibold text-on-surface">
            {isConfirmingRemoval ? 'Xác nhận gỡ phân công' : isEditing ? 'Sửa phân công' : 'Chi tiết phân công'}
          </h3>
          <button aria-label="Đóng" onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        
        {isConfirmingRemoval ? (
          <div className="p-md space-y-md">
            <p>Gỡ phân công {assignment.order.piNumber} trên máy {assignment.machineId}?</p>
            {error && <p className="text-error">{error}</p>}
            <div className="flex justify-end gap-sm">
              <button type="button" disabled={isLoading} onClick={() => setIsConfirmingRemoval(false)}
                className="h-9 px-4 rounded-md border border-outline">Hủy</button>
              <button type="button" disabled={isLoading} onClick={handleUnassign}
                className="h-9 px-4 rounded-md bg-error text-white">{isLoading ? 'Đang gỡ...' : 'Xác nhận gỡ'}</button>
            </div>
          </div>
        ) : isEditing ? (
          <form onSubmit={handleEditSubmit} className="p-md">
            {error && (
              <div className="mb-md p-sm rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-label-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-md">
              <div>
                <label htmlFor="detail-machine" className="block text-label-sm font-medium text-secondary mb-xs">Máy</label>
                <select id="detail-machine"
                  required
                  value={editMachineId}
                  onChange={e => setEditMachineId(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md font-mono text-type-mono"
                >
                  {MACHINES.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="detail-order" className="block text-label-sm font-medium text-secondary mb-xs">Đơn hàng</label>
                <select id="detail-order"
                  required
                  disabled={loadingOrders}
                  value={selectedOrderId}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
                >
                  <option value="">Chọn đơn hàng...</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.piNumber} · Dòng {lineLabel(o)} — {o.widthM ?? '—'} m · {o.color || '—'} · {o.gsm ?? '—'} GSM{o.calculatedStatus === 'DONE' ? ' · Hoàn thành' : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-secondary">
                  {loadingOrders ? 'Đang tải dòng hàng…' : includeFinished ? 'Đang hiện cả dòng đã kết thúc lịch' : `Đang ẩn ${hiddenCount} dòng đã kết thúc lịch`}
                  {' · '}
                  <button type="button" disabled={loadingOrders} onClick={() => { const next = !includeFinished; setIncludeFinished(next); void loadOrderOptions(next) }} className="text-primary underline disabled:opacity-50">{includeFinished ? 'Ẩn' : 'Hiện'}</button>
                </p>
              </div>

              <div className="flex gap-sm">
                <div className="flex-1">
                  <label htmlFor="detail-start-date" className="block text-label-sm font-medium text-secondary mb-xs">Bắt đầu</label>
                  <input id="detail-start-date" 
                    type="date" 
                    required
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none" 
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="detail-end-date" className="block text-label-sm font-medium text-secondary mb-xs">Kết thúc</label>
                  <input id="detail-end-date" 
                    type="date" 
                    required
                    min={editStartDate}
                    value={editEndDate}
                    onChange={e => dates.setManualEndDate(e.target.value)}
                    className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none" 
                  />
                </div>
              </div>
            </div>

            <div className="mt-md space-y-md">
              <div>
                <label htmlFor="edit-allocated-meters" className="block text-label-sm font-medium text-secondary mb-xs">Số mét phân công</label>
                <input id="edit-allocated-meters" type="number" min="0.01" step="0.01"
                  value={editAllocatedMeters} onChange={e => setEditAllocatedMeters(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono" />
              </div>
              <div>
                <label htmlFor="edit-daily-output" className="block text-label-sm font-medium text-secondary mb-xs">Năng suất (m/ngày)</label>
                <input id="edit-daily-output" type="number" min="0.01" step="0.01"
                  value={editEstimatedDailyOutput} onChange={e => setEditEstimatedDailyOutput(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none font-mono" />
              </div>
              <ProductionDurationSummary allocatedMeters={editAllocatedMeters} estimatedDailyOutput={editEstimatedDailyOutput}
                machineId={editMachineId} startDate={editStartDate} plan={dates.plan} loading={dates.loading} error={dates.error}
                mode={dates.mode} onUseComputed={dates.useComputedDates} recalculated={dates.recalculatedFromManual} />
            </div>

            <div className="mt-xl flex justify-end gap-sm">
              <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                Hủy
              </button>
              <button type="submit" disabled={isLoading || dates.loading || !!dates.error} className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {isLoading ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-md space-y-md">
            {error && (
              <div className="p-sm rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-label-sm">
                {error}
              </div>
            )}

            <div>
              <p className="text-label-sm font-medium text-secondary mb-1">Đơn hàng</p>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-body-lg font-semibold text-on-surface">{assignment.order.piNumber}</p>
                {(assignment.isPlaceholder || assignment.order?.isDraft) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-warning-container/80 text-warning-900 border border-warning/50">
                    <span className="material-symbols-outlined text-[14px] text-warning-700">push_pin</span>
                    Đơn nháp (Giữ chỗ tạm)
                  </span>
                )}
              </div>
              <p className="text-body-sm text-on-surface-variant mt-0.5">{assignment.order.customer}</p>
            </div>

            <div>
              <p className="text-label-sm font-medium text-secondary mb-1">Phân công này</p>
              {assignment.endDateSource === 'IMPORTED' && !assignment.allocatedMeters && (
                <p className="text-xs text-secondary mb-2">Thiếu số mét — nhập để tính ngày</p>
              )}
              <ProductionDurationSummary allocatedMeters={assignment.allocatedMeters ?? ''} estimatedDailyOutput={assignment.estimatedDailyOutput ?? ''}
                machineId={assignment.machineId} startDate={scheduleDay(assignment.startDate)} plan={viewDates.plan} loading={viewDates.loading}
                error={viewDates.error} mode={viewDates.mode} />
            </div>

            <div>
              <p className="text-label-sm font-medium text-secondary mb-1">Đơn hàng</p>
              {piLineCount?.piNumber === assignment.order.piNumber && (piLineCount.count ?? 0) >= 2 && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">PI có {piLineCount.count} dòng — kiểm tra phân công đã gắn đúng dòng chưa (Chỉnh sửa để đổi dòng)</p>}
              <PiOrderPanel piNumber={assignment.order.piNumber} selectedOrderId={assignment.order.id} onLineCount={handlePiLineCount} />
            </div>

            {/* Các trường đã có trong bảng PI không lặp lại; phần còn lại thu gọn (0810-25 C2) */}
            <details className="border-t-[0.5px] border-outline-variant pt-md">
              <summary className="cursor-pointer text-label-sm font-inter font-semibold text-secondary uppercase tracking-widest mb-sm">
                Thêm thông tin dòng
              </summary>
              <dl className="grid grid-cols-2 gap-x-md gap-y-sm mt-sm">
                {assignment.order.qty != null && (
                  <div>
                    <dt className="text-label-sm font-inter text-secondary">Số lượng</dt>
                    <dd className="text-body-md font-mono text-on-surface" suppressHydrationWarning>{orderQuantityLabel(assignment.order)}</dd>
                    {hasUnusedOrderQuantity(assignment.order) && <p role="status" className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">Kiểu đơn có thể sai — kiểm lại</p>}
                  </div>
                )}
                <div><dt className="text-label-sm font-inter text-secondary">Tên sản phẩm</dt><dd className="text-body-md font-noto text-on-surface">{assignment.order.description?.trim() || '—'}</dd></div>
                {assignment.order.meshType && (
                  <div>
                    <dt className="text-label-sm font-inter text-secondary">Loại lưới</dt>
                    <dd className="text-body-md font-noto text-on-surface">{assignment.order.meshType}</dd>
                  </div>
                )}
                {assignment.order.needleCount != null && (
                  <div>
                    <dt className="text-label-sm font-inter text-secondary">Số kim</dt>
                    <dd className="text-body-md font-mono text-on-surface">{assignment.order.needleCount}</dd>
                  </div>
                )}
                {assignment.order.hasEyelet && (
                  <>
                    <div>
                      <dt className="text-label-sm font-inter text-secondary">Eyelet</dt>
                      <dd className="text-body-md font-noto text-on-surface">Có</dd>
                    </div>
                    {assignment.order.eyeletColor && (
                      <div>
                        <dt className="text-label-sm font-inter text-secondary">Màu eyelet</dt>
                        <dd className="text-body-md font-noto text-on-surface">{assignment.order.eyeletColor}</dd>
                      </div>
                    )}
                  </>
                )}
                {assignment.order.totalWeightKgs != null && (
                  <div className="col-span-2">
                    <dt className="text-label-sm font-inter text-secondary">Trọng lượng (kg)</dt>
                    <dd className="text-body-md font-mono text-on-surface">
                      {Number(assignment.order.totalWeightKgs).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg
                    </dd>
                  </div>
                )}
              </dl>
            </details>

            {calcOrderStatus([assignment])!=='DONE'&&<button type="button" disabled={isLoading} onClick={()=>setTransferOpen(true)} className="rounded border border-primary px-4 py-2 text-sm text-primary">Chuyển máy…</button>}
            <div className="pt-sm flex gap-sm">
              <button 
                onClick={handleEditClick}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-primary text-primary bg-transparent hover:bg-surface-container text-sm font-medium px-4 py-2 h-9 rounded-md disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Chỉnh sửa
              </button>
              <button 
                onClick={() => setIsConfirmingRemoval(true)}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-[#ba1a1a] text-[#ba1a1a] bg-transparent hover:bg-[#ba1a1a]/10 text-sm font-medium px-4 py-2 h-9 rounded-md disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Gỡ phân công
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    {transferOpen&&<TransferAssignmentModal assignment={assignment} onClose={closeTransfer} onSuccess={()=>{onSuccess();onClose()}}/>}
    </>
  )
}
