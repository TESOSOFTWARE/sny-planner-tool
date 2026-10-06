'use client'

// src/components/orders/PiMasterDetailEditor.tsx
// Comprehensive Master-Detail Editor for Proforma Invoice (PI).
// Allows editing all sub-lines belonging to the same PI atomically.

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { calculateOrderWeight } from '@/lib/calculations/orderWeight'
import { deriveOrderTypeFromPacking, lineSchema, draftLineSchema, cleanSubLineForValidation } from '@/lib/validations/order'
import { FACTORY_COLOR_PRESETS } from '@/lib/colors'
import { itemCodeWarnings } from '@/lib/orders/itemCodeHint'
import { computeItemCodePrefillPatch } from '@/lib/orders/itemCodePrefill'
import type { ItemCodeOption } from '@/lib/orders/itemCodeCatalog'
import { toast } from 'sonner'

export interface LineValidationIssue {
  field: string
  message: string
}

export interface LineValidationError {
  line: number // 1-indexed (NO / subLineIndex)
  errors: string[]
  issues?: LineValidationIssue[]
}

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

  primaryPackingType: 'ROLL' | 'BALE' | 'CARTON' | 'HEMMED'
  subPackingType?: 'CARTON' | 'BALE' | ''
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
  itemCode: string

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
  // B-server: dự đoán số dòng khớp công thức màu (tính ở server như logic approve).
  recipeCoverage?: { matched: number; total: number; missingColors: string[] }
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
  recipeCoverage,
}: PiMasterDetailEditorProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetLineParam = searchParams.get('line')
  const targetLineId = searchParams.get('lineId')

  // Header State
  const [customer, setCustomer] = useState(initialCustomer)
  const [orderDate, setOrderDate] = useState(initialOrderDate)
  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDate || '')
  const [containerSize, setContainerSize] = useState(initialContainerSize || '')
  const [description, setDescription] = useState(initialDescription || '')
  const [remark, setRemark] = useState(initialRemark || '')
  const [lifecycleStatus, setLifecycleStatus] = useState<'APPROVED' | 'RESERVED' | 'DRAFT'>(
    initialLifecycleStatus === 'PLACEHOLDER' || (initialLifecycleStatus as string) === 'RESERVE' ? 'RESERVED' : ((initialLifecycleStatus as any) || 'APPROVED')
  )

  // Sub-lines State
  const [lines, setLines] = useState<SubLineItem[]>(initialLines)
  const [activeExpandedLine, setActiveExpandedLine] = useState<number | null>(null)
  const [activeColorDropdownIdx, setActiveColorDropdownIdx] = useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const colorDropdownRef = useRef<HTMLDivElement | null>(null)

  // Auto-close dropdown when scrolling table or page, but ALLOW scrolling inside the dropdown itself
  useEffect(() => {
    if (activeColorDropdownIdx === null) return
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (target && colorDropdownRef.current && colorDropdownRef.current.contains(target)) {
        // Scrolling inside color dropdown menu -> do NOT close
        return
      }
      setActiveColorDropdownIdx(null)
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [activeColorDropdownIdx])

  // Item Code Suggestions (DB history + MasterData catalog)
  const [itemCodeOptions, setItemCodeOptions] = useState<ItemCodeOption[]>([])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const url = initialPiNumber?.trim()
          ? `/api/orders/item-codes?pi=${encodeURIComponent(initialPiNumber.trim())}`
          : '/api/orders/item-codes'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setItemCodeOptions(data)
        }
      } catch {
        setItemCodeOptions([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [initialPiNumber])

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
  l.itemCode !== init.itemCode ||
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

  // Highlight and auto-expand line from ?line= or ?lineId= query param ONCE on initial load
  const handledTargetKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const currentKey = targetLineId ? `id:${targetLineId}` : targetLineParam ? `num:${targetLineParam}` : null
    if (!currentKey) return
    if (handledTargetKeyRef.current === currentKey) return
    if (!lines || lines.length === 0) return

    const foundIdx = targetLineId
      ? lines.findIndex((l) => l.id === targetLineId)
      : lines.findIndex((l) => l.subLineIndex === Number(targetLineParam))
    const lineNum = lines[foundIdx]?.subLineIndex
    if (foundIdx !== -1) {
      handledTargetKeyRef.current = currentKey
      setActiveExpandedLine(foundIdx)
      setTimeout(() => {
        const el = document.getElementById(`subline-row-${lineNum}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
    }
  }, [targetLineId, targetLineParam, lines])

  // UI state
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<LineValidationError[]>([])
  const [headerErrors, setHeaderErrors] = useState<{ customer?: string; orderDate?: string }>({})

  // Clear error banner when all errors are resolved
  useEffect(() => {
    if (lineErrors.length === 0 && Object.keys(headerErrors).length === 0 && errorMessage?.includes('không hợp lệ')) {
      setErrorMessage(null)
    }
  }, [lineErrors, headerErrors, errorMessage])

  const isDrawerField = (fieldName?: string) => {
    if (!fieldName) return false
    const drawerFields = [
      'productionGsm', 'mbCode', 'itemCode', 'uvPct', 'frFlag', 'frPct', 'meshType', 'needleCount', 'lineNote',
      'isLaminated', 'rawFabricGsm', 'coatingGsm', 'finishedGsm',
      'hasEyelet', 'eyeletColor', 'eyeletLines', 'eyeletSpec',
      'outerWrapping', 'hasPaperCore', 'isHalfFolded', 'subPackingType',
      'piecesPerCarton', 'piecesPerBale', 'boxDimensions',
      'onPallet', 'secondaryPackingType', 'palletDimensions', 'itemsPerPallet',
      'toleranceQtyPct', 'toleranceSpecPct', 'packingNote',
    ]
    return drawerFields.some((f) => fieldName === f || fieldName.startsWith(f))
  }

  const scrollToAndExpandLine = useCallback((subLineIndex: number, lineIdx: number, issues?: LineValidationIssue[]) => {
    const shouldExpand = issues && issues.length > 0 ? issues.some((i) => isDrawerField(i.field)) : true
    if (shouldExpand) {
      setActiveExpandedLine(lineIdx)
    }
    setTimeout(() => {
      const el = document.getElementById(`subline-row-${subLineIndex}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Auto-focus first invalid input inside this row or drawer
        setTimeout(() => {
          const invalidInput = el.querySelector('input.border-error, select.border-error') as HTMLElement
          if (invalidInput) {
            invalidInput.focus()
          } else if (shouldExpand) {
            const nextRow = el.nextElementSibling
            const drawerInput = nextRow?.querySelector('input.border-error, select.border-error') as HTMLElement
            drawerInput?.focus()
          }
        }, 150)
      }
    }, 100)
  }, [])

  const getLineError = useCallback((subLineIndex: number) => {
    return lineErrors.find((e) => e.line === subLineIndex)
  }, [lineErrors])

  const LENGTH_GROUP = useMemo(() => ['lengthM', 'rollLength', 'pieceLength', 'qty'], [])
  const COLOR_GROUP = useMemo(() => ['color', 'colorVersion'], [])
  const LAMINATE_GROUP = useMemo(() => ['rawFabricGsm', 'finishedGsm', 'coatingGsm', 'isLaminated'], [])
  const PACKING_GROUP = useMemo(() => ['primaryPackingType', 'piecesPerCarton', 'piecesPerBale'], [])
  const PALLET_GROUP = useMemo(() => ['onPallet', 'palletDimensions', 'secondaryPackingType'], [])

  const isFieldMatch = useCallback((issueField: string, targetField: string): boolean => {
    if (issueField === targetField || issueField.startsWith(targetField)) return true
    if (LENGTH_GROUP.includes(issueField) && LENGTH_GROUP.includes(targetField)) return true
    if (COLOR_GROUP.includes(issueField) && COLOR_GROUP.includes(targetField)) return true
    if (LAMINATE_GROUP.includes(issueField) && LAMINATE_GROUP.includes(targetField)) return true
    if (PACKING_GROUP.includes(issueField) && PACKING_GROUP.includes(targetField)) return true
    if (PALLET_GROUP.includes(issueField) && PALLET_GROUP.includes(targetField)) return true
    return false
  }, [LENGTH_GROUP, COLOR_GROUP, LAMINATE_GROUP, PACKING_GROUP, PALLET_GROUP])

  const getFieldErrorMsg = useCallback((subLineIndex: number, fieldName: string): string | undefined => {
    const lineErr = lineErrors.find((e) => e.line === subLineIndex)
    if (!lineErr) return undefined
    const matchedIssue = lineErr.issues?.find((issue) => isFieldMatch(issue.field, fieldName))
    return matchedIssue?.message
  }, [lineErrors, isFieldMatch])

  const hasFieldError = useCallback((subLineIndex: number, fieldName: string) => {
    const lineErr = lineErrors.find((e) => e.line === subLineIndex)
    if (!lineErr) return false
    if (lineErr.issues && lineErr.issues.length > 0) {
      return lineErr.issues.some((issue) => isFieldMatch(issue.field, fieldName))
    }
    return false
  }, [lineErrors, isFieldMatch])

  const handleConfirmDiscardAndSwitch = () => {
    if (pendingTargetPi) {
      const dest = pendingTargetPi
      setPendingTargetPi(null)
      if (dest.startsWith('/')) {
        router.push(dest)
      } else {
        router.push(`/orders/pi/${encodeURIComponent(dest)}`)
      }
    }
  }

  const handleConfirmSaveAndSwitch = async () => {
    if (!pendingTargetPi) return
    const dest = pendingTargetPi
    const success = await handleSaveAll()
    if (success) {
      setPendingTargetPi(null)
      if (dest.startsWith('/')) {
        router.push(dest)
      } else {
        router.push(`/orders/pi/${encodeURIComponent(dest)}`)
      }
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
        if (value === 'HEMMED') {
          current.piecesPerCarton = ''
          current.piecesPerBale = ''
          current.boxDimensions = ''
        } else {
          current.subPackingType = ''
        }
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

    // Reactive error clearing: Clear error for this subline when user modifies it
    setLineErrors((prev) => prev.filter((e) => e.line !== (lines[index]?.subLineIndex ?? (index + 1))))
  }, [lines])

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
            itemCode: '',
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
  itemCode: '',
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
    setLineErrors([])
    setHeaderErrors({})

    // 0. Header Pre-validation (Khách hàng & Ngày đặt hàng)
    const hErrors: { customer?: string; orderDate?: string } = {}
    if (!customer || !customer.trim()) {
      hErrors.customer = 'Tên khách hàng là bắt buộc.'
    }
    if (!orderDate || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
      hErrors.orderDate = 'Ngày đặt hàng không hợp lệ (YYYY-MM-DD).'
    }

    if (Object.keys(hErrors).length > 0) {
      setHeaderErrors(hErrors)
      setErrorMessage('Vui lòng điền đầy đủ thông tin Khách hàng và Ngày đặt hàng ở phía trên.')
      setSaving(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      const firstId = hErrors.customer ? 'header-customer' : 'header-order-date'
      setTimeout(() => document.getElementById(firstId)?.focus(), 150)
      return false
    }

    // 1. Client-Side Pre-validation (Sub-lines)
    const schemaToUse = lifecycleStatus === 'DRAFT' ? draftLineSchema : lineSchema
    const clientIssues: LineValidationError[] = []

    lines.forEach((l, idx) => {
      const lineNum = l.subLineIndex ?? (idx + 1)
      const sanitized = cleanSubLineForValidation(l)
      const parseRes = schemaToUse.safeParse(sanitized)
      if (!parseRes.success) {
        clientIssues.push({
          line: lineNum,
          errors: parseRes.error.issues.map((i) => i.message),
          issues: parseRes.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        })
      }
    })

    if (clientIssues.length > 0) {
      setLineErrors(clientIssues)
      setErrorMessage(`Dữ liệu không hợp lệ tại ${clientIssues.length} dòng sản phẩm. Vui lòng kiểm tra các ô được đánh dấu đỏ.`)
      setSaving(false)

      const firstErr = clientIssues[0]
      const firstIdx = lines.findIndex((l) => (l.subLineIndex ?? 0) === firstErr.line)
      if (firstIdx !== -1) {
        scrollToAndExpandLine(firstErr.line, firstIdx, firstErr.issues)
      }
      return false
    }

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
        isPlaceholder: lifecycleStatus === 'RESERVED',
        expectedUpdatedAt: initialUpdatedAt ?? undefined,
        lines: lines.map(cleanSubLineForValidation),
      }

      const res = await fetch(`/api/orders/pi/${encodeURIComponent(initialPiNumber)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data.details && Array.isArray(data.details)) {
          setLineErrors(data.details)
          const firstErr = data.details[0]
          const firstIdx = lines.findIndex((l) => (l.subLineIndex ?? 0) === firstErr.line)
          if (firstIdx !== -1) {
            scrollToAndExpandLine(firstErr.line, firstIdx, firstErr.issues)
          }
        }
        throw new Error(data.error || 'Có lỗi xảy ra khi lưu đơn hàng.')
      }

      toast.success(data.message || 'Lưu đơn hàng PI thành công!')
      setSuccessMessage(null)
      router.refresh()
      return true
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi lưu đơn hàng.')
      toast.error(err.message || 'Lỗi khi lưu đơn hàng.')
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Native datalist for Item Code autocomplete */}
      <datalist id="pme-itemcode-options">
        {itemCodeOptions.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </datalist>

      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-on-surface-variant font-medium">
        <Link href="/orders" onClick={handleBackToOrders} className="hover:text-primary transition-colors">
          Đơn hàng
        </Link>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="font-mono text-on-surface">{initialPiNumber}</span>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="text-primary font-semibold">Chỉnh sửa đơn hàng</span>
      </nav>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 bg-error/10 border border-error/30 text-error rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">error</span>
              <span className="font-bold text-sm">{errorMessage}</span>
            </div>
            <button
              onClick={() => {
                setErrorMessage(null)
                setLineErrors([])
              }}
              className="text-xs font-semibold hover:underline px-2 py-1 rounded hover:bg-error/10 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>

          {/* Cards chi tiết theo từng dòng lỗi */}
          {lineErrors.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2 border-t border-error/20">
              {lineErrors.map((err) => {
                const lineIdx = lines.findIndex((l) => (l.subLineIndex ?? 0) === err.line)
                return (
                  <div
                    key={err.line}
                    className="bg-surface/90 border border-error/40 rounded-lg p-3 text-xs space-y-1.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between font-bold text-error">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">report_problem</span>
                        Dòng #{err.line}
                      </span>
                      <button
                        type="button"
                        onClick={() => scrollToAndExpandLine(err.line, lineIdx, err.issues)}
                        className="px-2 py-0.5 bg-error/15 hover:bg-error/25 text-error font-semibold rounded text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        Đi tới dòng này
                        <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                      </button>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-on-surface-variant font-normal">
                      {err.errors.map((msg, i) => (
                        <li key={i} className="leading-snug">{msg}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
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
                  : lifecycleStatus === 'RESERVED' || (lifecycleStatus as string) === 'RESERVE' || (lifecycleStatus as string) === 'PLACEHOLDER'
                  ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30'
                  : 'bg-zinc-500/15 text-zinc-600 border border-zinc-500/30'
              }`}
            >
              {lifecycleStatus === 'APPROVED' ? 'Đã chốt — sản xuất (APPROVED)' : (lifecycleStatus === 'RESERVED' || (lifecycleStatus as string) === 'RESERVE' || (lifecycleStatus as string) === 'PLACEHOLDER') ? 'Giữ chỗ máy (RESERVED)' : 'Đơn nháp (DRAFT)'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Nút Quay lại - Đặt ở đầu thanh tác vụ kèm icon */}
            <Link
              href="/orders"
              onClick={handleBackToOrders}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-outline-variant bg-surface hover:bg-surface-variant text-on-surface rounded-lg text-sm font-medium transition-colors shadow-xs whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Quay lại</span>
            </Link>

            {lineErrors.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const firstErr = lineErrors[0]
                  const firstIdx = lines.findIndex((l) => (l.subLineIndex ?? 0) === firstErr.line)
                  if (firstIdx !== -1) {
                    scrollToAndExpandLine(firstErr.line, firstIdx, firstErr.issues)
                  }
                }}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-error bg-error/10 hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded-full font-bold transition-colors cursor-pointer whitespace-nowrap"
                title="Bấm để cuộn đến dòng lỗi đầu tiên"
              >
                <span className="material-symbols-outlined text-[15px]">error</span>
                <span>{lineErrors.length} dòng có lỗi</span>
              </button>
            )}

            {isDirty && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Chưa lưu thay đổi
              </span>
            )}

            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>Lưu tất cả thay đổi</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Header Fields Form - Lưới 12 cột cân đối tỷ lệ */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-x-5 gap-y-4 pt-4 pb-1">
          {/* Khách hàng (4/12 cột) */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center gap-1">
              <span>Khách hàng</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              id="header-customer"
              type="text"
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value)
                if (headerErrors.customer) {
                  setHeaderErrors((prev) => ({ ...prev, customer: undefined }))
                }
              }}
              className={`w-full bg-surface border rounded-lg px-3.5 py-2.5 text-sm font-medium focus:outline-none transition-all shadow-xs ${
                headerErrors.customer
                  ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                  : 'border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary/20'
              }`}
              required
            />
            {headerErrors.customer && (
              <p className="text-[11px] text-error mt-1 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {headerErrors.customer}
              </p>
            )}
          </div>

          {/* Ngày đặt hàng (2/12 cột) */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center gap-1">
              <span>Ngày đặt hàng</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              id="header-order-date"
              type="date"
              value={orderDate}
              onChange={(e) => {
                setOrderDate(e.target.value)
                if (headerErrors.orderDate) {
                  setHeaderErrors((prev) => ({ ...prev, orderDate: undefined }))
                }
              }}
              className={`w-full bg-surface border rounded-lg px-3.5 py-2.5 text-sm font-medium focus:outline-none transition-all shadow-xs ${
                headerErrors.orderDate
                  ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                  : 'border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary/20'
              }`}
              required
            />
            {headerErrors.orderDate && (
              <p className="text-[11px] text-error mt-1 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">error</span>
                {headerErrors.orderDate}
              </p>
            )}
          </div>

          {/* Ngày giao hàng (2/12 cột) */}
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Ngày giao hàng</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-surface border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all shadow-xs"
            />
          </div>

          {/* Container Size (4/12 cột) */}
          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Container Size</label>
            <input
              type="text"
              value={containerSize}
              onChange={(e) => setContainerSize(e.target.value)}
              placeholder="VD: 40HQ x 1, 20FT x 1"
              className="w-full bg-surface border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all shadow-xs"
            />
          </div>

          {/* Row 2: Ghi chú chung (Remark) - Mở rộng toàn bộ 12 cột, loại bỏ dropdown vòng đời trùng lặp */}
          <div className="lg:col-span-12">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 flex items-center justify-between">
              <span>Ghi chú chung đơn hàng (Remark / Description)</span>
              <span className="text-[11px] font-normal text-on-surface-variant/60">Tối đa 200 ký tự</span>
            </label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Nhập ghi chú điều hành sản xuất xuất khẩu (tiến độ xuất cont, yêu cầu tem nhãn barcode, đóng gói riêng, lưu ý khách hàng...)"
              className="w-full bg-surface border border-outline-variant rounded-lg px-3.5 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none transition-all shadow-xs resize-y min-h-[64px]"
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
                <th className="py-3 px-3 min-w-[170px]">Item Code</th>
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
                const isHighlighted =
                  (targetLineParam != null && line.subLineIndex === Number(targetLineParam)) ||
                  (targetLineId != null && line.id === targetLineId)
                const lineErr = getLineError(line.subLineIndex)
                const isError = Boolean(lineErr)

                return (
                  <React.Fragment key={line.id || `subline-${line.subLineIndex}`}>
                    <tr
                      id={`subline-row-${line.subLineIndex}`}
                      className={`hover:bg-surface-variant/20 transition-colors ${
                        isError
                          ? 'bg-error/5 border-l-4 border-l-error font-medium'
                          : isExpanded
                          ? 'bg-primary/5 font-medium'
                          : ''
                      } ${isHighlighted ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''}`}
                    >
                      {/* NO */}
                      <td className="py-2.5 px-2 font-mono font-bold text-center text-primary text-xs">
                        <div className="flex items-center justify-center gap-1">
                          {isError && (
                            <span
                              className="material-symbols-outlined text-error text-[16px] animate-pulse shrink-0"
                              title={lineErr?.errors.join('\n')}
                            >
                              error
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveExpandedLine(isExpanded ? null : idx)}
                            title="Bấm để mở rộng/thu gọn chi tiết"
                            className="hover:underline flex items-center justify-center gap-0.5 mx-auto"
                          >
                            <span className="material-symbols-outlined text-[14px] text-secondary">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                            {line.subLineIndex}
                          </button>
                        </div>
                      </td>

                      {/* Item Code (bên trái Màu & Phiên bản - đồng bộ với Create) */}
                      <td className="py-2.5 px-3">
                        {(() => {
                          const allCodes = lines.map((l) => l.itemCode || '')
                          const matched = itemCodeOptions.find((opt) => opt.code.toUpperCase() === (line.itemCode || '').trim().toUpperCase())
                          const conflict = matched ? computeItemCodePrefillPatch(line, matched).conflictWarning : undefined
                          const warns = itemCodeWarnings(allCodes, idx, conflict)
                          const hasWarn = warns.length > 0
                          return (
                            <div className="relative">
                              <input
                                type="text"
                                list="pme-itemcode-options"
                                value={line.itemCode}
                                onChange={(e) => {
                                  const val = e.target.value
                                  const matchedOpt = itemCodeOptions.find((opt) => opt.code.toUpperCase() === val.trim().toUpperCase())
                                  if (matchedOpt) {
                                    const { patch } = computeItemCodePrefillPatch(line, matchedOpt)
                                    setLines((prev) => {
                                      const next = [...prev]
                                      const updated = { ...next[idx], itemCode: val }
                                      if (patch.color) {
                                        updated.color = patch.color
                                        updated.colorVersion = patch.colorVersion || 'STD'
                                      }
                                      if (patch.uvPct != null) {
                                        updated.uvPct = typeof patch.uvPct === 'number' ? patch.uvPct : Number(patch.uvPct)
                                      }
                                      if (patch.meshType) {
                                        updated.meshType = patch.meshType
                                      }
                                      if (patch.mbCode) {
                                        updated.mbCode = patch.mbCode
                                      }
                                      next[idx] = updated
                                      return next
                                    })
                                  } else {
                                    updateLineField(idx, 'itemCode', val)
                                  }
                                }}
                                placeholder="e.g. GBN1GRE..."
                                title={warns.length > 0 ? warns.join('; ') : "Item Code theo dòng"}
                                className={`w-full font-mono bg-surface-variant/30 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                  hasWarn
                                    ? 'border-amber-500/60 bg-amber-500/5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30'
                                    : 'border-outline-variant/70 focus:border-primary'
                                }`}
                              />
                              {hasWarn && (
                                <div className="mt-1 space-y-0.5">
                                  {warns.map((w, wi) => (
                                    <p key={wi} className="text-[10px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1 leading-tight">
                                      <span className="material-symbols-outlined text-[12px] text-amber-600 dark:text-amber-400 shrink-0">warning</span>
                                      <span>{w}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Color & Version */}
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={line.color}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase()
                            updateLineField(idx, 'color', val)
                            if (val.includes('DESERT')) {
                              if (line.colorVersion !== 'Version A' && line.colorVersion !== 'Version B') {
                                updateLineField(idx, 'colorVersion', 'Version A')
                              }
                            } else {
                              updateLineField(idx, 'colorVersion', 'STD')
                            }
                          }}
                          onFocus={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setDropdownPos({ top: rect.bottom + 4, left: rect.left })
                            setActiveColorDropdownIdx(idx)
                          }}
                          onBlur={() => setTimeout(() => setActiveColorDropdownIdx(null), 250)}
                          placeholder="Màu sắc"
                          className={`w-full bg-surface-variant/30 border rounded px-2 py-1 text-xs font-semibold focus:outline-none uppercase transition-colors ${
                            hasFieldError(line.subLineIndex, 'color')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant/70 focus:border-primary'
                          }`}
                        />

                        {/* Autocomplete dropdown: Gợi ý màu công thức xưởng tiêu chuẩn */}
                        {activeColorDropdownIdx === idx && dropdownPos && (() => {
                          const search = (line.color || '').trim().toUpperCase()
                          const filteredPresets = FACTORY_COLOR_PRESETS.filter((p) => {
                            if (!search) return true
                            return (
                              p.color.includes(search) ||
                              p.name.toUpperCase().includes(search) ||
                              (p.mbCode && p.mbCode.toUpperCase().includes(search)) ||
                              (p.tags && p.tags.some((t) => t.includes(search)))
                            )
                          })

                          return (
                            <div
                              ref={colorDropdownRef}
                              onMouseDown={(e) => {
                                // Prevent input from losing focus / blurring when clicking scrollbar or popover body
                                e.preventDefault()
                              }}
                              style={{
                                position: 'fixed',
                                top: `${dropdownPos.top}px`,
                                left: `${dropdownPos.left}px`,
                              }}
                              className="z-[9999] bg-surface-container-lowest border border-outline-variant rounded-md shadow-2xl p-1.5 text-left w-64 divide-y divide-outline-variant/30"
                            >
                              <div>
                                <div className="px-1.5 py-0.5 text-[10px] font-semibold text-secondary uppercase tracking-wider mb-1 flex items-center justify-between">
                                  <span>Màu công thức xưởng</span>
                                  <span className="text-[9px] font-mono text-secondary/70">({filteredPresets.length})</span>
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-1 pr-0.5 overscroll-contain">
                                  {filteredPresets.length > 0 ? (
                                    filteredPresets.map((preset) => (
                                      <button
                                        key={preset.name}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLineField(idx, 'color', preset.color)
                                          updateLineField(idx, 'colorVersion', preset.version)
                                          setActiveColorDropdownIdx(null)
                                        }}
                                        className="w-full px-2 py-1.5 text-left rounded hover:bg-primary/10 transition-colors border border-outline-variant/40 flex flex-col"
                                      >
                                        <span className="font-semibold text-xs text-primary">{preset.name}</span>
                                        <span className="text-[9px] text-secondary font-mono">{preset.subText}</span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="py-3 px-2 text-center text-xs text-secondary">
                                      <div>Màu tùy biến: <span className="font-semibold text-on-surface">&quot;{search}&quot;</span></div>
                                      <div className="text-[10px] text-secondary/70 mt-0.5">Sẽ lưu phiên bản STD</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })()}

                        {line.color?.toUpperCase().includes('DESERT') && (
                          <div className={`mt-1 flex items-center gap-1 p-0.5 rounded transition-all ${
                            hasFieldError(line.subLineIndex, 'colorVersion') ? 'ring-1 ring-error bg-error/5' : ''
                          }`}>
                            <button
                              type="button"
                              onClick={() => updateLineField(idx, 'colorVersion', 'Version A')}
                              title="Bản A: MB Korea (Dark Beige 3160-2, MB 3.0%)"
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors flex-1 text-center ${
                                line.colorVersion === 'Version A'
                                  ? 'bg-primary text-on-primary border-primary font-bold shadow-xs'
                                  : 'bg-surface hover:bg-surface-variant text-secondary border-outline-variant'
                              }`}
                            >
                              Ver A (Korea)
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLineField(idx, 'colorVersion', 'Version B')}
                              title="Bản B: MB Arirang (Beige 8005A, MB 3.0%)"
                              className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors flex-1 text-center ${
                                line.colorVersion === 'Version B'
                                  ? 'bg-primary text-on-primary border-primary font-bold shadow-xs'
                                  : 'bg-surface hover:bg-surface-variant text-secondary border-outline-variant'
                              }`}
                            >
                              Ver B (Arirang)
                            </button>
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
                          title={getFieldErrorMsg(line.subLineIndex, 'widthM') || 'Khổ rộng (m)'}
                          className={`w-full font-mono bg-surface-variant/30 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                            hasFieldError(line.subLineIndex, 'widthM')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant/70 focus:border-primary'
                          }`}
                        />
                      </td>

                      {/* GSM (Đơn hàng) */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={line.gsm}
                          onChange={(e) => updateLineField(idx, 'gsm', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="GSM"
                          title={getFieldErrorMsg(line.subLineIndex, 'gsm') || 'GSM theo đơn đặt hàng'}
                          className={`w-full font-mono bg-surface-variant/30 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                            hasFieldError(line.subLineIndex, 'gsm')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant/70 focus:border-primary'
                          }`}
                        />
                      </td>

                      {/* Packing Type (ROLL / BALE / CARTON) */}
                      <td className="py-2.5 px-3 min-w-[176px]">
                        <select
                          value={line.primaryPackingType}
                          onChange={(e) => {
                            const val = e.target.value
                            updateLineField(idx, 'primaryPackingType', val)
                            if (val === 'HEMMED') {
                              updateLineField(idx, 'piecesPerCarton', '')
                              updateLineField(idx, 'piecesPerBale', '')
                              updateLineField(idx, 'boxDimensions', '')
                            } else {
                              updateLineField(idx, 'subPackingType', '')
                            }
                          }}
                          title={getFieldErrorMsg(line.subLineIndex, 'primaryPackingType') || 'Kiểu đóng gói'}
                          className={`w-full bg-surface-variant/50 border rounded px-2 py-1 text-xs font-semibold text-primary focus:outline-none transition-colors ${
                            hasFieldError(line.subLineIndex, 'primaryPackingType')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant'
                          }`}
                        >
                          <option value="ROLL">Theo cuộn (ROLL)</option>
                          <option value="CARTON">Thùng (CARTON)</option>
                          <option value="BALE">Kiện nén (BALE)</option>
                          <option value="HEMMED">May viền (HEMMED)</option>
                        </select>
                      </td>

                      {/* Quantity */}
                      <td className="py-2.5 px-2">
                        <input
                          type="number"
                          value={line.qty}
                          onChange={(e) => updateLineField(idx, 'qty', e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder={line.primaryPackingType === 'CARTON' ? 'Số tấm' : 'Số cuộn'}
                          title={getFieldErrorMsg(line.subLineIndex, 'qty') || (line.primaryPackingType === 'CARTON' ? 'Số tấm' : 'Số cuộn')}
                          className={`w-full font-mono bg-surface-variant/30 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                            hasFieldError(line.subLineIndex, 'qty')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant/70 focus:border-primary'
                          }`}
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
                          title={
                            getFieldErrorMsg(line.subLineIndex, 'lengthM') ||
                            (line.primaryPackingType === 'ROLL'
                              ? 'Chiều dài cuộn (m/cuộn)'
                              : line.primaryPackingType === 'CARTON'
                              ? 'Chiều dài tấm (m)'
                              : 'Tổng chiều dài (m)')
                          }
                          className={`w-full font-mono bg-surface-variant/30 border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                            hasFieldError(line.subLineIndex, 'lengthM')
                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                              : 'border-outline-variant/70 focus:border-primary'
                          }`}
                        />
                      </td>

                      {/* Badges Summary */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {isError && (
                            <button
                              type="button"
                              onClick={() => scrollToAndExpandLine(line.subLineIndex, idx, lineErr?.issues)}
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'text-error bg-error/20 border border-error/50 ring-1 ring-error/50 font-bold'
                                  : 'text-error bg-error/10 hover:bg-error/20 border border-error/30'
                              }`}
                              title={isExpanded ? 'Đang mở ngăn chi tiết dòng này' : 'Bấm để xem và sửa chi tiết lỗi'}
                            >
                              <span className="material-symbols-outlined text-[12px]">warning</span>
                              Lỗi kỹ thuật ({lineErr?.errors.length})
                            </button>
                          )}
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
                              Eyelet {line.eyeletLines ? `${line.eyeletLines}L` : ''}
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
                        <td colSpan={12} className="p-4">
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

                            {/* Alert Box nếu dòng này có thông số chưa hợp lệ (kể cả trên bảng chính) */}
                            {lineErr && (
                              <div className="bg-error/10 border border-error/30 rounded-xl p-3.5 space-y-2 text-xs">
                                <div className="flex items-center gap-2 font-bold text-error">
                                  <span className="material-symbols-outlined text-[18px]">report_problem</span>
                                  Dòng #{line.subLineIndex} có {lineErr.errors.length} thông số cần hoàn thiện hoặc sửa lỗi:
                                </div>
                                <ul className="list-disc pl-5 space-y-1 text-on-surface font-medium">
                                  {lineErr.errors.map((msg, i) => (
                                    <li key={i} className="leading-snug">{msg}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

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
                                      title={getFieldErrorMsg(line.subLineIndex, 'productionGsm') || 'GSM thực tế dệt chạy (nếu khác GSM đơn)'}
                                      className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                        hasFieldError(line.subLineIndex, 'productionGsm')
                                          ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                          : 'border-outline-variant text-primary focus:border-primary'
                                      }`}
                                    />
                                    {hasFieldError(line.subLineIndex, 'productionGsm') && (
                                      <p className="text-[10px] text-error mt-0.5 font-medium">
                                        {getFieldErrorMsg(line.subLineIndex, 'productionGsm')}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">Mã màu (MB Code)</label>
                                    <input
                                      type="text"
                                      value={line.mbCode}
                                      onChange={(e) => updateLineField(idx, 'mbCode', e.target.value)}
                                      placeholder="e.g. MYD4501A"
                                      title={getFieldErrorMsg(line.subLineIndex, 'mbCode') || 'Mã masterbatch màu'}
                                      className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                        hasFieldError(line.subLineIndex, 'mbCode')
                                          ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                          : 'border-outline-variant focus:border-primary'
                                      }`}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-secondary mb-1">Item Code</label>
                                    {(() => {
                                      const allCodes = lines.map((l) => l.itemCode || '')
                                      const matched = itemCodeOptions.find((opt) => opt.code.toUpperCase() === (line.itemCode || '').trim().toUpperCase())
                                      const conflict = matched ? computeItemCodePrefillPatch(line, matched).conflictWarning : undefined
                                      const warns = itemCodeWarnings(allCodes, idx, conflict)
                                      const hasWarn = warns.length > 0
                                      return (
                                        <>
                                          <input
                                            type="text"
                                            list="pme-itemcode-options"
                                            value={line.itemCode}
                                            onChange={(e) => {
                                              const val = e.target.value
                                              const matchedOpt = itemCodeOptions.find((opt) => opt.code.toUpperCase() === val.trim().toUpperCase())
                                              if (matchedOpt) {
                                                const { patch } = computeItemCodePrefillPatch(line, matchedOpt)
                                                setLines((prev) => {
                                                  const next = [...prev]
                                                  const updated = { ...next[idx], itemCode: val }
                                                  if (patch.color) {
                                                    updated.color = patch.color
                                                    updated.colorVersion = patch.colorVersion || 'STD'
                                                  }
                                                  if (patch.uvPct != null) {
                                                    updated.uvPct = typeof patch.uvPct === 'number' ? patch.uvPct : Number(patch.uvPct)
                                                  }
                                                  if (patch.meshType) {
                                                    updated.meshType = patch.meshType
                                                  }
                                                  if (patch.mbCode) {
                                                    updated.mbCode = patch.mbCode
                                                  }
                                                  next[idx] = updated
                                                  return next
                                                })
                                              } else {
                                                updateLineField(idx, 'itemCode', val)
                                              }
                                            }}
                                            placeholder="e.g. GBN1GRE260205054"
                                            title="Item Code tự do theo dòng"
                                            className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                              hasWarn
                                                ? 'border-amber-500/60 bg-amber-500/5 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30'
                                                : 'border-outline-variant focus:border-primary'
                                            }`}
                                          />
                                          {hasWarn && (
                                            <div className="mt-1 space-y-0.5">
                                              {warns.map((w, wi) => (
                                                <p key={wi} className="text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
                                                  <span className="material-symbols-outlined text-[13px] text-amber-600 dark:text-amber-400 shrink-0">warning</span>
                                                  <span>{w}</span>
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      )
                                    })()}
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
                                    title={getFieldErrorMsg(line.subLineIndex, 'uvPct') || 'Tỷ lệ UV (%)'}
                                    className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                      hasFieldError(line.subLineIndex, 'uvPct')
                                        ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                        : 'border-outline-variant focus:border-primary'
                                    }`}
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
                                  2. Tráng màng & Gia công Eyelet
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
                                    <span>Tráng màng (COATING)</span>
                                  </label>

                                  {line.isLaminated && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 space-y-2">
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM mộc (RAW FABRIC GSM) *</label>
                                          <input
                                            type="number"
                                            value={line.rawFabricGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'rawFabricGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Mộc (325)"
                                            title={getFieldErrorMsg(line.subLineIndex, 'rawFabricGsm') || 'GSM vải mộc'}
                                            className={`w-full font-mono bg-surface border rounded px-1.5 py-1 text-xs focus:outline-none transition-colors ${
                                              hasFieldError(line.subLineIndex, 'rawFabricGsm')
                                                ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                                : 'border-outline-variant focus:border-primary'
                                            }`}
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM màng tráng (COATING GSM)</label>
                                          <input
                                            type="number"
                                            value={line.coatingGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'coatingGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="Tráng (105)"
                                            title="GSM lớp keo tráng"
                                            className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[10px] font-medium text-secondary mb-0.5">GSM thành phẩm (FINISHED GSM) *</label>
                                          <input
                                            type="number"
                                            value={line.finishedGsm ?? ''}
                                            onChange={(e) => updateLineField(idx, 'finishedGsm', e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="TP (430)"
                                            title={getFieldErrorMsg(line.subLineIndex, 'finishedGsm') || 'GSM thành phẩm sau tráng'}
                                            className={`w-full font-mono bg-surface border rounded px-1.5 py-1 text-xs font-semibold focus:outline-none transition-colors ${
                                              hasFieldError(line.subLineIndex, 'finishedGsm') || hasFieldError(line.subLineIndex, 'rawFabricGsm')
                                                ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                                : 'border-outline-variant text-primary focus:border-primary'
                                            }`}
                                          />
                                        </div>
                                      </div>
                                      {(hasFieldError(line.subLineIndex, 'rawFabricGsm') || hasFieldError(line.subLineIndex, 'finishedGsm')) && (
                                        <p className="text-[10px] text-error font-medium flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[12px]">error</span>
                                          {getFieldErrorMsg(line.subLineIndex, 'rawFabricGsm') || getFieldErrorMsg(line.subLineIndex, 'finishedGsm') || 'GSM mộc và GSM thành phẩm là bắt buộc khi tráng màng.'}
                                        </p>
                                      )}
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
                                    <span>Có eyelet</span>
                                  </label>

                                  {line.hasEyelet && (
                                    <div className="grid grid-cols-3 gap-2 pl-1">
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Màu Eyelet</label>
                                        <input
                                          type="text"
                                          value={line.eyeletColor}
                                          onChange={(e) => updateLineField(idx, 'eyeletColor', e.target.value)}
                                          placeholder="SILVER, BRASS..."
                                          className="w-full bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Số lines Eyelet</label>
                                        <input
                                          type="number"
                                          value={line.eyeletLines}
                                          onChange={(e) => updateLineField(idx, 'eyeletLines', e.target.value === '' ? '' : Number(e.target.value))}
                                          placeholder="e.g. 4"
                                          className="w-full font-mono bg-surface border border-outline-variant rounded px-1.5 py-1 text-xs focus:border-primary focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">Mô tả Eyelet</label>
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
                                      
                                    </div>
                                  </div>
                                )}

                                                                {line.primaryPackingType === 'HEMMED' && (
                                  <div className="bg-surface border border-outline-variant/60 rounded-lg p-2.5 space-y-2 shadow-xs">
                                    <div className="space-y-1.5">
                                      <span className="text-[11px] font-semibold text-on-surface">Kiểu đóng gói phụ *</span>
                                      <div
                                        role="radiogroup"
                                        aria-label="Kiểu đóng gói phụ"
                                        className="inline-flex rounded p-0.5 bg-surface-container border border-outline-variant/40"
                                        onKeyDown={(e) => {
                                          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                                          e.preventDefault()
                                          updateLineField(idx, 'subPackingType', line.subPackingType === 'CARTON' ? 'BALE' : 'CARTON')
                                        }}
                                      >
                                        <button
                                          type="button"
                                          role="radio"
                                          aria-checked={line.subPackingType === 'CARTON'}
                                          onClick={() => updateLineField(idx, 'subPackingType', 'CARTON')}
                                          className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                            line.subPackingType === 'CARTON'
                                              ? 'bg-primary text-on-primary shadow-xs'
                                              : 'text-secondary hover:text-on-surface'
                                          }`}
                                        >
                                          Đóng Thùng (CARTON)
                                        </button>
                                        <button
                                          type="button"
                                          role="radio"
                                          aria-checked={line.subPackingType === 'BALE'}
                                          onClick={() => updateLineField(idx, 'subPackingType', 'BALE')}
                                          className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                            line.subPackingType === 'BALE'
                                              ? 'bg-primary text-on-primary shadow-xs'
                                              : 'text-secondary hover:text-on-surface'
                                          }`}
                                        >
                                          Đóng Kiện (BALE)
                                        </button>
                                      </div>
                                    </div>
                                    {hasFieldError(line.subLineIndex, 'subPackingType') && (
                                      <p className="text-[10px] text-error mt-0.5 font-medium flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[12px]">error</span>
                                        {getFieldErrorMsg(line.subLineIndex, 'subPackingType') || 'Chọn quy cách con (CARTON hoặc BALE).'}
                                      </p>
                                    )}
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
                                        title={getFieldErrorMsg(line.subLineIndex, 'piecesPerCarton') || 'Số tấm đóng gói mỗi thùng carton'}
                                        className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                          hasFieldError(line.subLineIndex, 'piecesPerCarton')
                                            ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                            : 'border-outline-variant focus:border-primary'
                                        }`}
                                      />
                                      {hasFieldError(line.subLineIndex, 'piecesPerCarton') && (
                                        <p className="text-[10px] text-error mt-1 font-medium flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[12px]">error</span>
                                          {getFieldErrorMsg(line.subLineIndex, 'piecesPerCarton') || 'Vui lòng nhập số tấm/thùng.'}
                                        </p>
                                      )}
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-secondary mb-1">Kích thước thùng</label>
                                      <input
                                        type="text"
                                        value={line.boxDimensions || ''}
                                        onChange={(e) => updateLineField(idx, 'boxDimensions', e.target.value)}
                                        placeholder="VD: 60x40x30 cm"
                                        className="w-full bg-surface border border-outline-variant rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
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
                                        title={getFieldErrorMsg(line.subLineIndex, 'piecesPerBale') || 'Số tấm đóng gói mỗi kiện bale'}
                                        className={`w-full font-mono bg-surface border rounded px-2 py-1 text-xs focus:outline-none transition-colors ${
                                          hasFieldError(line.subLineIndex, 'piecesPerBale')
                                            ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                            : 'border-outline-variant focus:border-primary'
                                        }`}
                                      />
                                      {hasFieldError(line.subLineIndex, 'piecesPerBale') && (
                                        <p className="text-[10px] text-error mt-1 font-medium flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[12px]">error</span>
                                          {getFieldErrorMsg(line.subLineIndex, 'piecesPerBale') || 'Vui lòng nhập số tấm/kiện.'}
                                        </p>
                                      )}
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
                                          className={`w-full bg-surface border rounded px-1.5 py-1 text-xs focus:outline-none transition-colors ${
                                            hasFieldError(line.subLineIndex, 'secondaryPackingType')
                                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                              : 'border-outline-variant focus:border-primary'
                                          }`}
                                        >
                                          <option value="WOOD_PALLET">Gỗ</option>
                                          <option value="PLASTIC_PALLET">Nhựa</option>
                                          <option value="IRON_PALLET">Sắt</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-medium text-secondary mb-0.5">KT Pallet (tùy chọn)</label>
                                        <input
                                          type="text"
                                          value={line.palletDimensions}
                                          onChange={(e) => updateLineField(idx, 'palletDimensions', e.target.value)}
                                          placeholder="110 x 110 cm"
                                          title={getFieldErrorMsg(line.subLineIndex, 'palletDimensions') || 'Kích thước Pallet'}
                                          className={`w-full bg-surface border rounded px-1.5 py-1 text-xs focus:outline-none transition-colors ${
                                            hasFieldError(line.subLineIndex, 'palletDimensions')
                                              ? 'border-error bg-error/5 text-error focus:ring-1 focus:ring-error'
                                              : 'border-outline-variant focus:border-primary'
                                          }`}
                                        />
                                        {hasFieldError(line.subLineIndex, 'palletDimensions') && (
                                          <p className="text-[10px] text-error mt-0.5 font-medium flex items-center gap-0.5">
                                            <span className="material-symbols-outlined text-[11px]">error</span>
                                            {getFieldErrorMsg(line.subLineIndex, 'palletDimensions') || 'Nhập kích thước pallet.'}
                                          </p>
                                        )}
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
      <div className="flex items-center justify-end p-4 bg-surface border border-outline-variant rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          {lineErrors.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const firstErr = lineErrors[0]
                const firstIdx = lines.findIndex((l) => (l.subLineIndex ?? 0) === firstErr.line)
                if (firstIdx !== -1) {
                  scrollToAndExpandLine(firstErr.line, firstIdx, firstErr.issues)
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs text-error bg-error/10 hover:bg-error/20 border border-error/30 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer"
              title="Bấm để cuộn đến dòng lỗi đầu tiên"
            >
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{lineErrors.length} dòng có lỗi cần sửa</span>
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
            </button>
          )}
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Chưa lưu thay đổi
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-on-primary font-semibold text-sm rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
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
                Hủy thay đổi & {pendingTargetPi === '/orders' ? 'Quay lại danh sách' : `Chuyển sang ${pendingTargetPi}`}
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
