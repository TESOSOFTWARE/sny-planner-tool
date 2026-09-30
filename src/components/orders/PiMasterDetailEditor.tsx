'use client'

// src/components/orders/PiMasterDetailEditor.tsx
// Comprehensive Master-Detail Editor for Proforma Invoice (PI).
// Allows editing all sub-lines belonging to the same PI atomically.

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { deriveOrderTypeFromPacking } from '@/lib/validations/order'

export interface RelatedPiItem {
  piNumber: string
  customer: string
  containerSize?: string | null
  orderDate: string
  lifecycleStatus: string
  lineCount: number
}

export interface SubLineItem {
  id?: string
  subLineIndex: number
  color: string
  colorVersion: string
  colorRecipeSnapshot?: string | null
  widthM: number | ''
  lengthM: number | ''
  gsm: number | ''
  productionGsm: number | ''
  orderType: 'meters' | 'rolls' | 'pieces'
  qty: number | ''
  rollLength: number | ''
  pieceLength: number | ''

  primaryPackingType: 'ROLL' | 'BALE' | 'CARTON'
  hasPaperCore: boolean
  isHalfFolded: boolean
  piecesPerCarton: number | ''
  piecesPerBale: number | ''
  boxDimensions: string
  onPallet: boolean
  secondaryPackingType: 'NONE' | 'WOOD_PALLET' | 'IRON_PALLET' | 'PLASTIC_PALLET'
  palletDimensions: string
  itemsPerPallet: number | ''
  packingNote: string
  outerWrapping?: string

  // Dual-GSM & Tolerance
  isLaminated?: boolean
  rawFabricGsm?: number | ''
  coatingGsm?: number | ''
  finishedGsm?: number | ''
  toleranceQtyPct?: number | ''
  toleranceSpecPct?: number | ''

  uvPct: number | ''
  frFlag: boolean
  frPct: number | ''
  lineNote: string
  requiresPacking: boolean
  meshType: string
  needleCount: number | ''
  beamCount: number | ''
  mbCode: string

  hasEyelet: boolean
  eyeletColor: string
  eyeletLines: number | ''
  eyeletSpec: string

  assignments?: Array<{
    id: string
    machineId: string
    startDate: string
    endDate: string
    isPlaceholder: boolean
  }>
}

export interface PiMasterDetailEditorProps {
  initialPiNumber: string
  initialCustomer: string
  initialCustomerId?: string | null
  initialOrderDate: string
  initialDeliveryDate?: string | null
  initialContainerSize?: string | null
  initialDescription?: string | null
  initialRemark?: string | null
  initialLifecycleStatus?: string
  initialIsPlaceholder?: boolean
  initialLines: SubLineItem[]
  // F1 (R4): mốc updatedAt mới nhất lúc mở PI — gửi kèm PUT để server phát hiện ghi đè (409).
  initialUpdatedAt?: string | null
  relatedPis?: RelatedPiItem[]
}

export default function PiMasterDetailEditor({
  initialPiNumber,
  initialCustomer,
  initialCustomerId,
  initialOrderDate,
  initialDeliveryDate,
  initialContainerSize,
  initialDescription,
  initialRemark,
  initialLifecycleStatus = 'APPROVED',
  initialIsPlaceholder = false,
  initialLines,
  initialUpdatedAt = null,
  relatedPis = [],
}: PiMasterDetailEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetLineParam = searchParams.get('line')

  // Header State
  const [customer, setCustomer] = useState(initialCustomer)
  const [orderDate, setOrderDate] = useState(initialOrderDate)
  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDate || '')
  const [containerSize, setContainerSize] = useState(initialContainerSize || '')
  const [description, setDescription] = useState(initialDescription || '')
  const [remark, setRemark] = useState(initialRemark || '')
  const [lifecycleStatus, setLifecycleStatus] = useState<'APPROVED' | 'PLACEHOLDER' | 'DRAFT'>(
    (initialLifecycleStatus as any) || 'APPROVED'
  )

  // Sub-lines State
  const [lines, setLines] = useState<SubLineItem[]>(initialLines)
  const [activeExpandedLine, setActiveExpandedLine] = useState<number | null>(null)

  // Dirty Guard State
  const [pendingTargetPi, setPendingTargetPi] = useState<string | null>(null)

  // Dirty State Detection
  const isDirty = useMemo(() => {
    if (customer !== initialCustomer) return true
    if (orderDate !== initialOrderDate) return true
    if (deliveryDate !== (initialDeliveryDate || '')) return true
    if (containerSize !== (initialContainerSize || '')) return true
    if (description !== (initialDescription || '')) return true
    if (remark !== (initialRemark || '')) return true
    if (lifecycleStatus !== (initialLifecycleStatus || 'APPROVED')) return true
    if (lines.length !== initialLines.length) return true

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const init = initialLines[i]
      if (!init) return true
      if (
        l.color !== init.color ||
        l.colorVersion !== init.colorVersion ||
        l.widthM !== init.widthM ||
        l.lengthM !== init.lengthM ||
        l.gsm !== init.gsm ||
        l.productionGsm !== init.productionGsm ||
        l.orderType !== init.orderType ||
        l.qty !== init.qty ||
        l.rollLength !== init.rollLength ||
        l.pieceLength !== init.pieceLength ||
        l.primaryPackingType !== init.primaryPackingType ||
        l.hasPaperCore !== init.hasPaperCore ||
        l.isHalfFolded !== init.isHalfFolded ||
        l.piecesPerCarton !== init.piecesPerCarton ||
        l.piecesPerBale !== init.piecesPerBale ||
        l.boxDimensions !== init.boxDimensions ||
        l.onPallet !== init.onPallet ||
        l.secondaryPackingType !== init.secondaryPackingType ||
        l.palletDimensions !== init.palletDimensions ||
        l.itemsPerPallet !== init.itemsPerPallet ||
        l.packingNote !== init.packingNote ||
        l.outerWrapping !== init.outerWrapping ||
        l.isLaminated !== init.isLaminated ||
        l.rawFabricGsm !== init.rawFabricGsm ||
        l.coatingGsm !== init.coatingGsm ||
        l.finishedGsm !== init.finishedGsm ||
        l.toleranceQtyPct !== init.toleranceQtyPct ||
        l.toleranceSpecPct !== init.toleranceSpecPct ||
        l.uvPct !== init.uvPct ||
        l.frFlag !== init.frFlag ||
        l.frPct !== init.frPct ||
        l.lineNote !== init.lineNote ||
        l.requiresPacking !== init.requiresPacking ||
        l.meshType !== init.meshType ||
        l.needleCount !== init.needleCount ||
        l.beamCount !== init.beamCount ||
        l.mbCode !== init.mbCode ||
        l.hasEyelet !== init.hasEyelet ||
        l.eyeletColor !== init.eyeletColor ||
        l.eyeletLines !== init.eyeletLines ||
        l.eyeletSpec !== init.eyeletSpec
      ) {
        return true
      }
    }
    return false
  }, [
    customer,
    initialCustomer,
    orderDate,
    initialOrderDate,
    deliveryDate,
    initialDeliveryDate,
    containerSize,
    initialContainerSize,
    description,
    initialDescription,
    remark,
    initialRemark,
    lifecycleStatus,
    initialLifecycleStatus,
    lines,
    initialLines,
  ])

  // Highlight and auto-expand line from ?line= query param
  useEffect(() => {
    if (targetLineParam) {
      const lineNum = Number(targetLineParam)
      const foundIdx = lines.findIndex((l) => l.subLineIndex === lineNum)
      if (foundIdx !== -1) {
        setActiveExpandedLine(foundIdx)
        setTimeout(() => {
          const el = document.getElementById(`subline-row-${lineNum}`)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 300)
      }
    }
  }, [targetLineParam, lines])

  // UI state
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)



  const handleConfirmDiscardAndSwitch = () => {
    if (pendingTargetPi) {
      const dest = pendingTargetPi
      setPendingTargetPi(null)
      router.push(`/orders/pi/${encodeURIComponent(dest)}`)
    }
  }

  const handleConfirmSaveAndSwitch = async () => {
    if (!pendingTargetPi) return
    const dest = pendingTargetPi
    const success = await handleSaveAll()
    if (success) {
      setPendingTargetPi(null)
      router.push(`/orders/pi/${encodeURIComponent(dest)}`)
    }
  }

  // Update a field on a specific sub-line
  const updateLineField = useCallback((index: number, field: keyof SubLineItem, value: any) => {
    setLines((prev) => {
      const next = [...prev]
      const current = { ...next[index], [field]: value }

      // Auto-update orderType when packingType changes
      if (field === 'primaryPackingType') {
        current.orderType = deriveOrderTypeFromPacking(value, null)
      }
      // If color changes and doesn't contain DESERT, reset colorVersion to STD
      if (field === 'color') {
        const strVal = String(value || '').toUpperCase()
        if (!strVal.includes('DESERT')) {
          current.colorVersion = 'STD'
        }
      }
      next[index] = current
      return next
    })
  }, [])

  // Add line
  const handleAddLine = useCallback(() => {
    setLines((prev) => {
      const lastLine = prev[prev.length - 1]
      const newLine: SubLineItem = lastLine
        ? {
            ...lastLine,
            id: undefined,
            subLineIndex: prev.length + 1,
            color: lastLine.color,
            colorVersion: lastLine.colorVersion || 'STD',
            assignments: [],
          }
        : {
            subLineIndex: 1,
            color: 'DESERT SAND',
            colorVersion: 'STD',
            widthM: 2.0,
            lengthM: 50,
            gsm: 240,
            productionGsm: 240,
            orderType: 'rolls',
            qty: 50,
            rollLength: 50,
            pieceLength: '',
            primaryPackingType: 'ROLL',
            // G1: lõi giấy chỉ đúng với ROLL — default false để không gán dữ liệu ảo cho BALE/CARTON
            hasPaperCore: false,
            isHalfFolded: false,
            piecesPerCarton: '',
            piecesPerBale: '',
            boxDimensions: '',
            onPallet: false,
            secondaryPackingType: 'NONE',
            palletDimensions: '',
            itemsPerPallet: '',
            packingNote: '',
            outerWrapping: 'POLYBAG',
            isLaminated: false,
            rawFabricGsm: '',
            coatingGsm: '',
            finishedGsm: '',
            toleranceQtyPct: 10,
            toleranceSpecPct: 5,
            uvPct: 4,
            frFlag: false,
            frPct: '',
            lineNote: '',
            requiresPacking: false,
            meshType: 'Standard',
            needleCount: 18,
            beamCount: '',
            mbCode: '',
            hasEyelet: false,
            eyeletColor: '',
            eyeletLines: '',
            eyeletSpec: '',
            assignments: [],
          }
      return [...prev, newLine]
    })
  }, [])

  // Clone line
  const handleCloneLine = useCallback((index: number) => {
    setLines((prev) => {
      const source = prev[index]
      const cloned: SubLineItem = {
        ...source,
        id: undefined,
        subLineIndex: prev.length + 1,
        assignments: [],
      }
      return [...prev, cloned]
    })
  }, [])

  // Delete line
  const handleDeleteLine = useCallback((index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        alert('Đơn hàng cần có ít nhất 1 dòng sản phẩm.')
        return prev
      }
      const target = prev[index]
      if (target.assignments && target.assignments.length > 0) {
        alert(`Không thể xóa dòng ${index + 1} vì đã có phân công máy dệt. Vui lòng hủy gán máy trước.`)
        return prev
      }
      const remaining = prev.filter((_, i) => i !== index)
      return remaining.map((line, idx) => ({ ...line, subLineIndex: idx + 1 }))
    })
  }, [])

  // Calculations for totals
  const totals = useMemo(() => {
    let totalMeters = 0
    let totalSqm = 0
    let totalWeightKgs = 0
    let totalRequiredYarnKg = 0

    lines.forEach((line) => {
      const calc = calculateOrderWeight({
        orderType: line.orderType,
        widthM: typeof line.widthM === 'number' ? line.widthM : null,
        lengthM: typeof line.lengthM === 'number' ? line.lengthM : null,
        gsm: typeof line.gsm === 'number' ? line.gsm : null,
        productionGsm: typeof line.productionGsm === 'number' ? line.productionGsm : null,
        qty: typeof line.qty === 'number' ? line.qty : null,
        rollLength: typeof line.rollLength === 'number' ? line.rollLength : null,
        pieceLength: typeof line.pieceLength === 'number' ? line.pieceLength : null,
        isLaminated: line.isLaminated ?? false,
        rawFabricGsm: typeof line.rawFabricGsm === 'number' ? line.rawFabricGsm : null,
        coatingGsm: typeof line.coatingGsm === 'number' ? line.coatingGsm : null,
        finishedGsm: typeof line.finishedGsm === 'number' ? line.finishedGsm : null,
      })

      if (calc.totalMeters) totalMeters += Number(calc.totalMeters)
      if (calc.qtySqm) totalSqm += Number(calc.qtySqm)
      if (calc.totalWeightKgs) totalWeightKgs += Number(calc.totalWeightKgs)
      if (calc.requiredYarnKg) totalRequiredYarnKg += Number(calc.requiredYarnKg)
    })

    return {
      totalMeters: Math.round(totalMeters),
      totalSqm: Math.round(totalSqm * 10) / 10,
      totalWeightKgs: Math.round(totalWeightKgs * 10) / 10,
      totalRequiredYarnKg: Math.round(totalRequiredYarnKg * 10) / 10,
    }
  }, [lines])

  const handleBackToOrders = (e: React.MouseEvent) => {
    if (isDirty) {
      e.preventDefault()
      setPendingTargetPi('/orders')
    }
  }

  // Save all changes atomically
  const handleSaveAll = async (): Promise<boolean> => {
    setSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = {
        customer,
        customerId: initialCustomerId,
        orderDate,
        deliveryDate: deliveryDate || null,
        containerSize: containerSize || null,
        description: description || null,
        remark: remark || null,
        lifecycleStatus,
        isPlaceholder: lifecycleStatus === 'PLACEHOLDER',
        expectedUpdatedAt: initialUpdatedAt ?? undefined,
        lines,
      }

      const res = await fetch(`/api/orders/pi/${encodeURIComponent(initialPiNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Có lỗi xảy ra khi lưu đơn hàng.')
      }

      setSuccessMessage(data.message || 'Lưu đơn hàng PI thành công!')
      router.refresh()
      return true
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi lưu đơn hàng.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
        <Link href="/orders" onClick={handleBackToOrders} className="hover:text-primary transition-colors">
          Đơn hàng
        </Link>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="font-mono text-on-surface">{initialPiNumber}</span>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="text-primary font-semibold">Chỉnh sửa toàn diện (Master-Detail)</span>
      </nav>



      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-error/10 border border-error/30 text-error rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined">error</span>
            <span className="font-medium text-sm">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-sm font-semibold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined">check_circle</span>
            <span className="font-medium text-sm">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-sm font-semibold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {/* HEADER CARD: PI & Customer Information */}
      <div className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[28px]">inventory_2</span>
              {initialPiNumber}
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary uppercase">
              {lines.length} Dòng sản phẩm
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                lifecycleStatus === 'APPROVED'
                  ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                  : lifecycleStatus === 'PLACEHOLDER'
                  ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                  : 'bg-zinc-500/15 text-zinc-600 border border-zinc-500/30'
              }`}
            >
              {lifecycleStatus === 'APPROVED' ? 'Chính thức (Approved)' : lifecycleStatus === 'PLACEHOLDER' ? 'Giữ chỗ máy (Placeholder)' : 'Bản nháp (Draft)'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Chưa lưu thay đổi
              </span>
            )}
            <Link
              href="/orders"
              onClick={handleBackToOrders}
              className="px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium hover:bg-surface-variant transition-colors"
            >
              Quay lại
            </Link>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2 bg-primary hover:bg-primary/90 text-on-primary font-medium text-sm rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-60"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  Đang lưu...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  Lưu tất cả thay đổi
                </>
              )}
            </button>
          </div>
        </div>

        {/* Header Fields Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4 pt-4 pb-1">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center gap-1">
              <span>Khách hàng</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm font-medium focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center gap-1">
              <span>Ngày đặt hàng</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm font-medium focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Ngày giao hàng</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Container Size</label>
            <input
              type="text"
              value={containerSize}
              onChange={(e) => setContainerSize(e.target.value)}
              placeholder="VD: 40HQ x 1, 20FT x 1"
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs"
            />
          </div>

          {/* Row 2: Lifecycle Status (1 col) + Ghi chú chung (3 cols with multi-line textarea) */}
          <div className="flex flex-col justify-start">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center gap-1">
              <span>Trạng thái vòng đời</span>
              <span className="text-red-500">*</span>
            </label>
            <select
              value={lifecycleStatus}
              onChange={(e) => setLifecycleStatus(e.target.value as any)}
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm font-semibold text-primary focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs"
            >
              <option value="APPROVED">APPROVED — Đơn chính thức</option>
              <option value="PLACEHOLDER">PLACEHOLDER — Đơn giữ chỗ</option>
              <option value="DRAFT">DRAFT — Bản nháp</option>
            </select>
            <p className="text-[11px] text-on-surface-variant/75 mt-1.5 leading-tight">
              {lifecycleStatus === 'APPROVED' && 'Đủ điều kiện phân bổ vào 40 máy dệt.'}
              {lifecycleStatus === 'PLACEHOLDER' && 'Đơn giữ chỗ dệt (viền nét đứt).'}
              {lifecycleStatus === 'DRAFT' && 'Bản nháp tạm chặn đưa vào dệt.'}
            </p>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center justify-between">
              <span>Ghi chú chung đơn hàng (Remark / Description)</span>
              <span className="text-[11px] font-normal text-on-surface-variant/60">Nhiều dòng · Tối đa 200 ký tự</span>
            </label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Nhập ghi chú điều hành sản xuất xuất khẩu (tiến độ xuất cont, yêu cầu tem nhãn barcode, đóng gói riêng, lưu ý khách hàng...)"
              className="w-full bg-surface-variant/40 border border-outline-variant rounded-lg px-3.5 py-2 text-sm focus:border-primary focus:bg-surface focus:outline-none transition-all shadow-xs resize-y min-h-[74px]"
            />
          </div>
        </div>
      </div>

      {/* KPI STATS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-outline-variant/60 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-on-surface-variant">Tổng chiều dài</div>
          <div className="text-xl font-bold font-mono text-primary mt-1">
            {totals.totalMeters.toLocaleString('vi-VN')} <span className="text-xs font-normal">m</span>
          </div>
        </div>

        <div className="bg-surface border border-outline-variant/60 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-on-surface-variant">Tổng diện tích</div>
          <div className="text-xl font-bold font-mono text-primary mt-1">
            {totals.totalSqm.toLocaleString('vi-VN')} <span className="text-xs font-normal">m²</span>
          </div>
        </div>

        <div className="bg-surface border border-outline-variant/60 rounded-xl p-4 shadow-sm">
          <div className="text-xs font-medium text-on-surface-variant">Tổng khối lượng vải</div>
          <div className="text-xl font-bold font-mono text-primary mt-1">
            {totals.totalWeightKgs.toLocaleString('vi-VN')} <span className="text-xs font-normal">kg</span>
          </div>
        </div>

        <div className="bg-surface border border-outline-variant/60 rounded-xl p-4 shadow-sm bg-primary/5 border-primary/20">
          <div className="text-xs font-medium text-primary flex items-center justify-between">
            <span>Sợi cần dùng (+5% loss)</span>
            <span className="material-symbols-outlined text-[16px]">trending_up</span>
          </div>
          <div className="text-xl font-bold font-mono text-primary mt-1">
            {totals.totalRequiredYarnKg.toLocaleString('vi-VN')} <span className="text-xs font-normal">kg</span>
          </div>
        </div>
      </div>

      {/* DETAIL TABLE: SUB-LINES */}
      <div className="bg-surface border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 bg-surface-variant/30 border-b border-outline-variant flex items-center justify-between">
          <div className="font-semibold text-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">format_list_bulleted</span>
            Danh sách Dòng Sản Phẩm ({lines.length})
          </div>

          <button
            onClick={handleAddLine}
            type="button"
            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Thêm dòng sản phẩm
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-surface-variant/60 text-on-surface-variant text-xs font-semibold uppercase border-b border-outline-variant">
                <th className="py-3 px-2 w-10 text-center">NO</th>
                <th className="py-3 px-3 min-w-[160px]">Màu & Phiên bản</th>
                <th className="py-3 px-2 min-w-[80px]">Khổ (m)</th>
                <th className="py-3 px-2 min-w-[80px]">GSM</th>
                <th className="py-3 px-3 min-w-[130px]">Kiểu đóng gói *</th>
                <th className="py-3 px-2 min-w-[90px]">Số lượng</th>
                <th className="py-3 px-2 min-w-[100px]">Chiều dài</th>
                <th className="py-3 px-3 min-w-[140px]">Đặc tính kỹ thuật</th>
                <th className="py-3 px-2 min-w-[80px] text-right">Tổng m</th>
                <th className="py-3 px-2 min-w-[90px] text-right">Kg Sợi (5%)</th>
                <th className="py-3 px-2 w-28 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {lines.map((line, idx) => {
                const calc = calculateOrderWeight({
                  orderType: line.orderType,
                  widthM: typeof line.widthM === 'number' ? line.widthM : null,
                  lengthM: typeof line.lengthM === 'number' ? line.lengthM : null,
                  gsm: typeof line.gsm === 'number' ? line.gsm : null,
                  productionGsm: typeof line.productionGsm === 'number' ? line.productionGsm : null,
                  qty: typeof line.qty === 'number' ? line.qty : null,
                  rollLength: typeof line.rollLength === 'number' ? line.rollLength : null,
                  pieceLength: typeof line.pieceLength === 'number' ? line.pieceLength : null,
                  isLaminated: line.isLaminated ?? false,
                  rawFabricGsm: typeof line.rawFabricGsm === 'number' ? line.rawFabricGsm : null,
                  coatingGsm: typeof line.coatingGsm === 'number' ? line.coatingGsm : null,
                  finishedGsm: typeof line.finishedGsm === 'number' ? line.finishedGsm : null,
                })

                const isExpanded = activeExpandedLine === idx
                const isHighlighted = targetLineParam != null && line.subLineIndex === Number(targetLineParam)

                return (
                  <React.Fragment key={idx}>
                    <tr
                      id={`subline-row-${line.subLineIndex}`}
                      className={`hover:bg-surface-variant/20 transition-colors ${
                        isExpanded ? 'bg-primary/5 font-medium' : ''
                      } ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
                    >
                      {/* NO */}
                      <td className="py-2.5 px-2 font-mono font-bold text-center text-primary text-xs">
                        <button
                          type="button"
                          onClick={() => setActiveExpandedLine(isExpanded ? null : idx)}
                          title="Bấm để mở rộng/thu gọn chi tiết"
                          className="hover:underline flex items-center justify-center gap-1 mx-auto"
                        >
                          <span className="material-symbols-outlined text-[14px] text-secondary">
                            {isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                          {line.subLineIndex}
                        </button>
                      </td>

                      {/* Color & Version */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={line.color}
                          onChange={(e) => updateLineField(idx, 'color', e.target.value.toUpperCase())}
                          placeholder="Màu sắc"
                          className="w-full bg-surface-variant/30 border border-outline-variant/70 rounded px-2 py-1 text-xs font-semibold focus:border-primary focus:outline-none uppercase"
                        />
                        {line.color?.toUpperCase().includes('DESERT') && (
                          <div className="mt-1">
                            <select
                              value={line.colorVersion || 'STD'}
                              onChange={(e) => updateLineField(idx, 'colorVersion', e.target.value)}
                              className="w-full bg-surface-variant/30 border border-outline-variant/70 rounded px-1.5 py-0.5 text-[11px] text-primary font-medium focus:outline-none"
                            >
                              <option value="STD">Tiêu chuẩn (STD)</option>
                              <option value="Version A">Version A (MB Korea)</option>
                              <option value="Version B">Version B (MB Arirang)</option>
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Width (M) */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="0.01"
                          value={line.widthM}
                          onChange={(e) => updateLineField(idx, 'widthM', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full font-mono bg-surface-variant/30 border border-outline-variant/70 rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>

                      {/* GSM (Đơn hàng) */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={line.gsm}
                          onChange={(e) => updateLineField(idx, 'gsm', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="GSM"
                          title="GSM theo đơn đặt hàng"
                          className="w-full font-mono bg-surface-variant/30 border border-outline-variant/70 rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>

                      {/* Packing Type (ROLL / BALE / CARTON) */}
                      <td className="py-2.5 px-3">
                        <select
                          value={line.primaryPackingType}
                          onChange={(e) => updateLineField(idx, 'primaryPackingType', e.target.value)}
                          className="w-full bg-surface-variant/50 border border-outline-variant rounded px-2 py-1 text-xs font-semibold text-primary focus:outline-none"
                        >
                          <option value="ROLL">Theo cuộn (ROLL)</option>
                          <option value="CARTON">Thùng (CARTON)</option>
                          <option value="BALE">Kiện nén (BALE)</option>
                        </select>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={line.qty}
                          onChange={(e) => updateLineField(idx, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder={line.primaryPackingType === 'CARTON' ? 'Số tấm' : 'Số cuộn'}
                          className="w-full font-mono bg-surface-variant/30 border border-outline-variant/70 rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>

                      {/* Length */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          step="0.1"
                          value={
                            line.primaryPackingType === 'ROLL'
                              ? line.rollLength
                              : line.primaryPackingType === 'CARTON'
                              ? line.pieceLength
                              : line.lengthM
                          }
                          onChange={(e) => {
                            const val = e.target.value === '' ? '' : Number(e.target.value)
                            if (line.primaryPackingType === 'ROLL') {
                              updateLineField(idx, 'rollLength', val)
                              updateLineField(idx, 'lengthM', val)
                            } else if (line.primaryPackingType === 'CARTON') {
                              updateLineField(idx, 'pieceLength', val)
                              updateLineField(idx, 'lengthM', val)
                            } else {
                              updateLineField(idx, 'lengthM', val)
                            }
                          }}
                          placeholder={
                            line.primaryPackingType === 'ROLL'
                              ? 'm/cuộn'
                              : line.primaryPackingType === 'CARTON'
                              ? 'Dài tấm (m)'
                              : 'Tổng mét'
                          }
                          className="w-full font-mono bg-surface-variant/30 border border-outline-variant/70 rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                        />
                      </td>

                      {/* Badges Summary */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {line.isLaminated && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Tráng màng
                            </span>
                          )}
                          {(line.frFlag || (typeof line.frPct === 'number' && line.frPct > 0)) && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-600 border border-rose-500/30">
                              FR {line.frPct ? `${line.frPct}%` : ''}
                            </span>
                          )}
                          {line.hasEyelet && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 border border-blue-500/30">
                              Khoen {line.eyeletLines ? `${line.eyeletLines}L` : ''}
                            </span>
                          )}
                          {line.onPallet && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/15 text-purple-600 border border-purple-500/30">
                              Pallet
                            </span>
                          )}
                          {!line.isLaminated && !line.frFlag && !line.hasEyelet && !line.onPallet && (
                            <span className="text-[11px] text-outline italic">Tiêu chuẩn</span>
                          )}
                        </div>
                      </td>

                      {/* Total Linear Meters */}
                      <td className="py-2.5 px-2 font-mono font-medium text-right text-xs">
                        {calc.totalMeters ? Number(calc.totalMeters).toLocaleString('vi-VN') : '—'}
                      </td>

                      {/* Required Yarn Kg */}
                      <td className="py-2.5 px-2 font-mono font-bold text-right text-xs text-primary">
                        {calc.requiredYarnKg ? Number(calc.requiredYarnKg).toLocaleString('vi-VN') : '—'}
                      </td>

                      {/* Action buttons */}
                      <td className="py-2.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveExpandedLine(isExpanded ? null : idx)}
                            title={isExpanded ? 'Thu gọn chi tiết' : 'Chỉnh sửa kỹ thuật chuyên sâu'}
                            className={`p-1.5 rounded transition-colors ${
                              isExpanded
                                ? 'bg-primary text-on-primary'
                                : 'hover:bg-surface-variant text-on-surface-variant hover:text-primary'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">tune</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCloneLine(idx)}
                            title="Nhân bản dòng này"
                            className="p-1.5 hover:bg-surface-variant rounded text-on-surface-variant hover:text-primary transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(idx)}
                            title="Xóa dòng này"
                            className="p-1.5 hover:bg-error/10 rounded text-on-surface-variant hover:text-error transition-colors"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED SUB-LINE INSPECTOR DRAWER */}
                    {isExpanded && (
                      <tr className="bg-surface-variant/15 border-b border-outline-variant">
                        <td colSpan={11} className="p-4">
                          <div className="bg-surface border border-outline-variant/80 rounded-xl p-4 shadow-sm space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/40">
                              <div className="text-xs font-bold font-inter text-primary uppercase tracking-wider flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">tune</span>
                                Dòng #{line.subLineIndex} — Chi tiết Kỹ thuật, Tráng màng & Đóng gói
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveExpandedLine(null)}
                                className="text-xs text-secondary hover:text-on-surface flex items-center gap-1 font-medium"
                              >
                                <span className="material-symbols-outlined text-[16px]">close</span>
                                Đóng ngăn chi tiết
                              </button>
                            </div>

                            {/* 3 Khối Tiến trình Xưởng */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                              {/* KHỐI 1: Phụ gia & Kỹ thuật Dệt */}
                              <div className="bg-surface-variant/20 border border-outline-variant/50 rounded-lg p-3 space-y-3">
                                <div className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px]">science</span>
                                  1. Phụ gia & Kỹ thuật Dệt
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">GSM SX (thực tế)</label>
                                    <input
                                      type="number"
                                      value={line.productionGsm ?? ''}
                                      onChange={(e) => updateLineField(idx, 'productionGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="GSM dệt thực tế"
                                      title="GSM thực tế dệt chạy (nếu khác GSM đơn)"
                                      className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs text-primary focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">Mã màu (MB Code)</label>
                                    <input
                                      type="text"
                                      value={line.mbCode}
                                      onChange={(e) => updateLineField(idx, 'mbCode', e.target.value)}
                                      placeholder="e.g. MYD4501A"
                                      className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-secondary mb-1">UV %</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={line.uvPct}
                                    onChange={(e) => updateLineField(idx, 'uvPct', e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="e.g. 2.5"
                                    className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                  />
                                </div>

                                {/* Chống cháy (FR) */}
                                <div className="pt-2 border-t border-outline-variant/30 space-y-1.5">
                                  <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={line.frFlag}
                                      onChange={(e) => {
                                        const checked = e.target.checked
                                        updateLineField(idx, 'frFlag', checked)
                                        if (!checked) updateLineField(idx, 'frPct', '')
                                      }}
                                      className="rounded text-primary focus:ring-0 cursor-pointer"
                                    />
                                    <span>Chống cháy (FR)</span>
                                  </label>
                                  {line.frFlag && (
                                    <div className="pl-5">
                                      <label className="block text-[11px] font-medium text-secondary mb-1">FR % (tỷ lệ phụ gia)</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        value={line.frPct}
                                        onChange={(e) => updateLineField(idx, 'frPct', e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder="e.g. 8.0"
                                        className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Lưới & Kim */}
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/30">
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">Loại lưới</label>
                                    <input
                                      type="text"
                                      value={line.meshType}
                                      onChange={(e) => updateLineField(idx, 'meshType', e.target.value)}
                                      placeholder="Hex, Diamond..."
                                      className="w-full bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">Số kim</label>
                                    <input
                                      type="number"
                                      value={line.needleCount}
                                      onChange={(e) => updateLineField(idx, 'needleCount', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="e.g. 192"
                                      className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                </div>

                                {/* Ghi chú dòng */}
                                <div className="pt-2 border-t border-outline-variant/30">
                                  <label className="block text-[11px] font-medium text-secondary mb-1">Ghi chú kỹ thuật dòng</label>
                                  <input
                                    type="text"
                                    value={line.lineNote}
                                    onChange={(e) => updateLineField(idx, 'lineNote', e.target.value)}
                                    placeholder="Ghi chú kỹ thuật cho dòng này..."
                                    className="w-full bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                  />
                                </div>
                              </div>

                              {/* KHỐI 2: Tráng màng ngoài Dual-GSM & Gia công Khoen */}
                              <div className="bg-surface-variant/20 border border-outline-variant/50 rounded-lg p-3 space-y-3">
                                <div className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px]">layers</span>
                                  2. Tráng màng & Gia công Khoen
                                </div>

                                {/* Tráng màng ngoài */}
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!line.isLaminated}
                                      onChange={(e) => updateLineField(idx, 'isLaminated', e.target.checked)}
                                      className="rounded text-primary focus:ring-0 cursor-pointer"
                                    />
                                    <span>Hàng tráng màng ngoài (Dual-GSM)</span>
                                  </label>

                                  {line.isLaminated && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM mộc *</label>
                                          <input
                                            type="number"
                                            value={line.rawFabricGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'rawFabricGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Mộc (325)"
                                            className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM tráng</label>
                                          <input
                                            type="number"
                                            value={line.coatingGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'coatingGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Tráng (105)"
                                            className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM TP *</label>
                                          <input
                                            type="number"
                                            value={line.finishedGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'finishedGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="TP (430)"
                                            className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs text-primary font-semibold focus:border-primary focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                      {line.rawFabricGsm && line.coatingGsm && line.finishedGsm &&
                                       Number(line.rawFabricGsm) + Number(line.coatingGsm) !== Number(line.finishedGsm) && (
                                        <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                                          <span className="material-symbols-outlined text-[14px]">warning</span>
                                          Lưu ý: Mộc ({line.rawFabricGsm}) + Tráng ({line.coatingGsm}) = {Number(line.rawFabricGsm) + Number(line.coatingGsm)} ≠ TP ({line.finishedGsm})
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Dập khoen Eyelet */}
                                <div className="pt-2 border-t border-outline-variant/30 space-y-2">
                                  <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={line.hasEyelet}
                                      onChange={(e) => updateLineField(idx, 'hasEyelet', e.target.checked)}
                                      className="rounded text-primary focus:ring-0 cursor-pointer"
                                    />
                                    <span>Có eyelet (khoen viền)</span>
                                  </label>

                                  {line.hasEyelet && (
                                    <div className="grid grid-cols-3 gap-2 pl-1">
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Màu khoen</label>
                                        <input
                                          type="text"
                                          value={line.eyeletColor}
                                          onChange={(e) => updateLineField(idx, 'eyeletColor', e.target.value)}
                                          placeholder="SILVER, BRASS..."
                                          className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Số lines khoen</label>
                                        <input
                                          type="number"
                                          value={line.eyeletLines}
                                          onChange={(e) => updateLineField(idx, 'eyeletLines', e.target.value === '' ? '' : Number(e.target.value))}
                                          placeholder="e.g. 4"
                                          className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Mô tả khoen</label>
                                        <input
                                          type="text"
                                          value={line.eyeletSpec}
                                          onChange={(e) => updateLineField(idx, 'eyeletSpec', e.target.value)}
                                          placeholder="Khoảng cách 50cm, 2 feet..."
                                          className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* KHỐI 3: Đóng gói Chi tiết, Pallet & Dung sai KCS */}
                              <div className="bg-surface-variant/20 border border-outline-variant/50 rounded-lg p-3 space-y-3">
                                <div className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-[16px]">inventory</span>
                                  3. Đóng gói, Pallet & Dung sai
                                </div>

                                {/* Chi tiết theo Kiểu đóng gói */}
                                {line.primaryPackingType === 'ROLL' && (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-secondary mb-1">Vỏ bọc cuộn</label>
                                      <select
                                        value={line.outerWrapping || 'POLYBAG'}
                                        onChange={(e) => updateLineField(idx, 'outerWrapping', e.target.value)}
                                        className="w-full bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                      >
                                        <option value="POLYBAG">Túi polybag</option>
                                        <option value="TARPAULIN">Bạt tarpaulin</option>
                                        <option value="NONE">Không bọc</option>
                                      </select>
                                    </div>
                                    <div className="flex items-center gap-4 pt-1">
                                      <label className="flex items-center gap-1.5 text-xs text-on-surface cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={line.hasPaperCore}
                                          onChange={(e) => updateLineField(idx, 'hasPaperCore', e.target.checked)}
                                          className="rounded text-primary focus:ring-0 cursor-pointer"
                                        />
                                        <span>Lõi giấy</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 text-xs text-on-surface cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={line.isHalfFolded}
                                          onChange={(e) => updateLineField(idx, 'isHalfFolded', e.target.checked)}
                                          className="rounded text-primary focus:ring-0 cursor-pointer"
                                        />
                                        <span>Gấp đôi khổ</span>
                                      </label>
                                    </div>
                                  </div>
                                )}

                                {line.primaryPackingType === 'CARTON' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-secondary mb-1">Số tấm/thùng *</label>
                                      <input
                                        type="number"
                                        value={line.piecesPerCarton}
                                        onChange={(e) => updateLineField(idx, 'piecesPerCarton', e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder="VD: 5"
                                        className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {line.primaryPackingType === 'BALE' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-secondary mb-1">Số tấm/kiện *</label>
                                      <input
                                        type="number"
                                        value={line.piecesPerBale}
                                        onChange={(e) => updateLineField(idx, 'piecesPerBale', e.target.value === '' ? '' : Number(e.target.value))}
                                        placeholder="VD: 50"
                                        className="w-full font-mono bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                )}

                                {/* Pallet Option */}
                                <div className="pt-2 border-t border-outline-variant/30 space-y-2">
                                  <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={line.onPallet}
                                      onChange={(e) => {
                                        const checked = e.target.checked
                                        updateLineField(idx, 'onPallet', checked)
                                        if (checked && line.secondaryPackingType === 'NONE') {
                                          updateLineField(idx, 'secondaryPackingType', 'WOOD_PALLET')
                                        } else if (!checked) {
                                          updateLineField(idx, 'secondaryPackingType', 'NONE')
                                        }
                                      }}
                                      className="rounded text-primary focus:ring-0 cursor-pointer"
                                    />
                                    <span>Đóng trên Pallet</span>
                                  </label>

                                  {line.onPallet && (
                                    <div className="grid grid-cols-3 gap-2 pl-1">
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Loại Pallet</label>
                                        <select
                                          value={line.secondaryPackingType}
                                          onChange={(e) => updateLineField(idx, 'secondaryPackingType', e.target.value as any)}
                                          className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        >
                                          <option value="WOOD_PALLET">Gỗ</option>
                                          <option value="PLASTIC_PALLET">Nhựa</option>
                                          <option value="IRON_PALLET">Sắt</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">KT Pallet *</label>
                                        <input
                                          type="text"
                                          value={line.palletDimensions}
                                          onChange={(e) => updateLineField(idx, 'palletDimensions', e.target.value)}
                                          placeholder="110 x 110 cm"
                                          className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">SL/Pallet</label>
                                        <input
                                          type="number"
                                          value={line.itemsPerPallet}
                                          onChange={(e) => updateLineField(idx, 'itemsPerPallet', e.target.value === '' ? '' : Number(e.target.value))}
                                          placeholder="SL/Pallet"
                                          className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Dung sai KCS */}
                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/30">
                                  <div>
                                    <label className="block text-[10px] font-medium text-secondary mb-0.5">Dung sai số lượng (±%)</label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={line.toleranceQtyPct ?? ''}
                                      onChange={(e) => updateLineField(idx, 'toleranceQtyPct', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="±10%"
                                      className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-medium text-secondary mb-0.5">Dung sai rộng/dài/nặng (±%)</label>
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={line.toleranceSpecPct ?? ''}
                                      onChange={(e) => updateLineField(idx, 'toleranceSpecPct', e.target.value === '' ? '' : Number(e.target.value))}
                                      placeholder="±5%"
                                      className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                    />
                                  </div>
                                </div>

                                {/* Ghi chú đóng gói */}
                                <div className="pt-2 border-t border-outline-variant/30">
                                  <label className="block text-[10px] font-medium text-secondary mb-0.5">Ghi chú đóng gói</label>
                                  <input
                                    type="text"
                                    value={line.packingNote}
                                    onChange={(e) => updateLineField(idx, 'packingNote', e.target.value)}
                                    placeholder="VD: Dán nhãn SNY, bọc màng co..."
                                    className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                  />
                                </div>

                              </div>

                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="flex items-center justify-end gap-3 p-4 bg-surface border border-outline-variant rounded-xl shadow-sm">
        {isDirty && (
          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Chưa lưu thay đổi
          </span>
        )}
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                Lưu tất cả thay đổi
              </>
            )}
          </button>
        </div>

      {/* DIRTY GUARD CONFIRMATION MODAL */}
      {pendingTargetPi && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-surface border border-outline-variant rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-amber-600 text-[24px]">warning</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-on-surface">Bạn có thay đổi chưa lưu!</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Đơn hàng <span className="font-mono font-bold text-primary">{initialPiNumber}</span> đang có dữ liệu được sửa nhưng chưa bấm <strong>Lưu tất cả thay đổi</strong>. Bạn muốn làm gì trước khi {pendingTargetPi === '/orders' ? 'quay lại danh sách' : <>chuyển sang PI <span className="font-mono font-bold text-primary">{pendingTargetPi}</span></>}?
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmSaveAndSwitch}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-on-primary font-medium text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Lưu thay đổi & {pendingTargetPi === '/orders' ? 'Trở về danh sách' : `Chuyển sang ${pendingTargetPi}`}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleConfirmDiscardAndSwitch}
                className="w-full py-2.5 px-4 border border-error/40 text-error hover:bg-error/10 font-medium text-xs rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                Hủy thay đổi & Chuyển ngay
              </button>

              <button
                type="button"
                onClick={() => setPendingTargetPi(null)}
                className="w-full py-2 px-4 border border-outline-variant hover:bg-surface-variant text-on-surface-variant font-medium text-xs rounded-xl transition-all"
              >
                Ở lại tiếp tục sửa {initialPiNumber}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
