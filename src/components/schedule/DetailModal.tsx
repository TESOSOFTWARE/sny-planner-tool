'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getUnassignedOrders } from '@/app/schedule/actions'

export type AssignmentDetail = {
  id: string
  machineId: string
  startDate: string
  endDate: string
  allocatedMeters: string | null  // Decimal serialised as string by Prisma
  estimatedDailyOutput: string | null  // Decimal serialised as string by Prisma
  isPlaceholder?: boolean
  order: {
    id: string
    piNumber: string
    customer: string
    isDraft?: boolean
    widthM: number
    lengthM: number
    gsm: number
    color: string
    mbCode: string | null
    qty: number | null
    meshType: string | null
    needleCount: number | null
    hasEyelet: boolean
    eyeletColor: string | null
    totalWeightKgs: unknown  // Prisma Decimal — serialised as string over JSON
  }
}

type Order = { id: string; piNumber: string; customer: string }

interface Props {
  isOpen: boolean
  onClose: () => void
  assignment: AssignmentDetail | null
  onSuccess: () => void
}

export default function DetailModal({ isOpen, onClose, assignment, onSuccess }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Edit state
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [editMachineId, setEditMachineId] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')

  useEffect(() => {
    if (isOpen && assignment) {
      setIsEditing(false)
      setError('')
      setSelectedOrderId(assignment.order.id)
      setEditMachineId(assignment.machineId)
      setEditStartDate(format(new Date(assignment.startDate), 'yyyy-MM-dd'))
      setEditEndDate(format(new Date(assignment.endDate), 'yyyy-MM-dd'))
    }
  }, [isOpen, assignment])

  const handleEditClick = async () => {
    setIsEditing(true)
    try {
      const unassigned = await getUnassignedOrders()
      const currentOrder = assignment!.order
      const allOptions = [
        currentOrder,
        ...unassigned.filter(o => o.id !== currentOrder.id)
      ]
      setOrders(allOptions)
    } catch (err) {
      console.error(err)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignment) return
    setError('')
    setIsLoading(true)

    try {
      const parsedStart = new Date(editStartDate)
      const parsedEnd = new Date(editEndDate)

      if (parsedEnd < parsedStart) {
        setError('End Date cannot be before Start Date')
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
          endDate: endISO
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update assignment')
      }
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
    if (!confirm('Are you sure you want to remove this assignment?')) return
    
    setIsLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to remove assignment')
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-lg w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-md py-sm border-b-[0.5px] border-outline-variant flex justify-between items-center">
          <h3 className="text-headline-sm font-inter font-semibold text-on-surface">
            {isEditing ? 'Edit Assignment' : 'Assignment Details'}
          </h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="p-md">
            {error && (
              <div className="mb-md p-sm rounded-lg bg-[#FFF8E7] border border-[#F59E0B] text-[#92400E] text-label-sm">
                {error}
              </div>
            )}
            
            <div className="space-y-md">
              <div>
                <label className="block text-label-sm font-medium text-secondary mb-xs">Machine</label>
                <select
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
                <label className="block text-label-sm font-medium text-secondary mb-xs">Order</label>
                <select 
                  required
                  value={selectedOrderId} 
                  onChange={e => setSelectedOrderId(e.target.value)}
                  className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
                >
                  <option value="">Select an order...</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.piNumber} ({o.customer})</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-sm">
                <div className="flex-1">
                  <label className="block text-label-sm font-medium text-secondary mb-xs">Start Date</label>
                  <input 
                    type="date" 
                    required
                    value={editStartDate}
                    onChange={e => setEditStartDate(e.target.value)}
                    className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none" 
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-label-sm font-medium text-secondary mb-xs">End Date</label>
                  <input 
                    type="date" 
                    required
                    min={editStartDate}
                    value={editEndDate}
                    onChange={e => setEditEndDate(e.target.value)}
                    className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary outline-none" 
                  />
                </div>
              </div>
            </div>

            <div className="mt-xl flex justify-end gap-sm">
              <button type="button" onClick={() => setIsEditing(false)} className="inline-flex items-center justify-center gap-sm border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isLoading} className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {isLoading ? 'Saving...' : 'Save'}
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
              <p className="text-label-sm font-medium text-secondary mb-1">Order</p>
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
              <p className="text-label-sm font-medium text-secondary mb-1">Machine</p>
              <p className="text-body-md font-mono text-type-mono text-on-surface">{assignment.machineId}</p>
            </div>

            <div>
              <p className="text-label-sm font-medium text-secondary mb-1">Duration</p>
              <p className="text-body-md text-on-surface">
                {format(new Date(assignment.startDate), 'dd/MM/yyyy')} — {format(new Date(assignment.endDate), 'dd/MM/yyyy')}
              </p>
            </div>

            {/* CHI TIẾT ĐƠN HÀNG */}
            <div className="border-t-[0.5px] border-outline-variant pt-md">
              <p className="text-label-sm font-inter font-semibold text-secondary uppercase tracking-widest mb-sm">
                Chi tiết đơn hàng
              </p>
              <dl className="grid grid-cols-2 gap-x-md gap-y-sm">
                <div>
                  <dt className="text-label-sm font-inter text-secondary">Khổ (Width)</dt>
                  <dd className="text-body-md font-mono text-on-surface">{assignment.order.widthM} m</dd>
                </div>
                <div>
                  <dt className="text-label-sm font-inter text-secondary">Chiều dài (Length)</dt>
                  <dd className="text-body-md font-mono text-on-surface">{Number(assignment.order.lengthM).toLocaleString()} m</dd>
                </div>
                <div>
                  <dt className="text-label-sm font-inter text-secondary">GSM</dt>
                  <dd className="text-body-md font-mono text-on-surface">{assignment.order.gsm}</dd>
                </div>
                <div>
                  <dt className="text-label-sm font-inter text-secondary">Màu (Color)</dt>
                  <dd className="text-body-md font-noto text-on-surface">{assignment.order.color}</dd>
                </div>
                {assignment.order.mbCode && (
                  <div className="col-span-2">
                    <dt className="text-label-sm font-inter text-secondary">Mã màu (MB Code)</dt>
                    <dd className="text-body-md font-mono text-on-surface">{assignment.order.mbCode}</dd>
                  </div>
                )}
                {assignment.order.qty != null && (
                  <div>
                    <dt className="text-label-sm font-inter text-secondary">Số lượng</dt>
                    <dd className="text-body-md font-mono text-on-surface">{assignment.order.qty.toLocaleString()} cuộn</dd>
                  </div>
                )}
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
                {assignment.allocatedMeters && (
                  <div className="col-span-2">
                    <dt className="text-label-sm font-inter text-secondary">Số mét phân công</dt>
                    <dd className="text-body-md font-mono text-on-surface">
                      {Number(assignment.allocatedMeters).toLocaleString()} m
                    </dd>
                  </div>
                )}
                {assignment.estimatedDailyOutput && (
                  <div className="col-span-2">
                    <dt className="text-label-sm font-inter text-secondary">Sản lượng dự kiến</dt>
                    <dd className="text-body-md font-mono text-on-surface">
                      {Number(assignment.estimatedDailyOutput).toLocaleString('vi-VN')} m/ngày
                    </dd>
                  </div>
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
            </div>

            <div className="pt-sm flex gap-sm">
              <button 
                onClick={handleEditClick}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-primary text-primary bg-transparent hover:bg-surface-container text-sm font-medium px-4 py-2 h-9 rounded-md disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
                Edit
              </button>
              <button 
                onClick={handleUnassign}
                disabled={isLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 border border-[#ba1a1a] text-[#ba1a1a] bg-transparent hover:bg-[#ba1a1a]/10 text-sm font-medium px-4 py-2 h-9 rounded-md disabled:opacity-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Remove
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
