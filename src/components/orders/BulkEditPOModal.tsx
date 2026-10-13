'use client'

// src/components/orders/BulkEditPOModal.tsx
// Modal to edit shared PO fields across all sub-lines of a piNumber.

import { useState, useEffect, useRef } from 'react'
import SuggestCombobox, { type SuggestOption } from '@/components/ui/SuggestCombobox'

const loadCustomers = async (q: string, signal: AbortSignal): Promise<SuggestOption<{ id: string }>[]> => {
  const res = await fetch(q ? `/api/customers/search?q=${encodeURIComponent(q)}` : '/api/customers', { signal })
  if (!res.ok) throw new Error('customers')
  const rows: { id: string; name: string }[] = await res.json()
  return (q ? rows : rows.slice(0, 20)).map(c => ({ value: c.name, data: { id: c.id } }))
}

interface Props {
  isOpen: boolean
  piNumber: string
  initialCustomer: string
  initialOrderDate?: string
  initialDeliveryDate?: string
  initialContainerSize?: string
  initialDescription?: string
  initialRemark?: string
  onClose: () => void
  onSuccess: () => void
}

export default function BulkEditPOModal({
  isOpen,
  piNumber,
  initialCustomer,
  initialOrderDate,
  initialDeliveryDate,
  initialContainerSize,
  initialDescription,
  initialRemark,
  onClose,
  onSuccess,
}: Props) {
  const [customer, setCustomer] = useState(initialCustomer || '')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [orderDate, setOrderDate] = useState(
    initialOrderDate ? initialOrderDate.slice(0, 10) : ''
  )
  const [deliveryDate, setDeliveryDate] = useState(
    initialDeliveryDate ? initialDeliveryDate.slice(0, 10) : ''
  )
  const [containerSize, setContainerSize] = useState(initialContainerSize || '')
  const [description, setDescription] = useState(initialDescription || '')
  const [remark, setRemark] = useState(initialRemark || '')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCustomer(initialCustomer || '')
    setOrderDate(initialOrderDate ? initialOrderDate.slice(0, 10) : '')
    setDeliveryDate(initialDeliveryDate ? initialDeliveryDate.slice(0, 10) : '')
    setContainerSize(initialContainerSize || '')
    setDescription(initialDescription || '')
    setRemark(initialRemark || '')
    setError(null)
  }, [
    isOpen,
    initialCustomer,
    initialOrderDate,
    initialDeliveryDate,
    initialContainerSize,
    initialDescription,
    initialRemark,
  ])

  // Gõ đúng tên khách đã có (không chọn từ danh sách) vẫn gán customerId.
  // Khách vừa chọn từ danh sách đã có id chắc chắn: không tra lại theo tên (search chỉ trả 10 kết quả "chứa").
  const pickedCustomer = useRef<{ name: string; id: string } | null>(null)
  useEffect(() => {
    const query = customer.trim()
    if (!query) {
      setCustomerId(null)
      return
    }
    if (pickedCustomer.current?.name === query) { setCustomerId(pickedCustomer.current.id); return }
    pickedCustomer.current = null
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        if (res.ok) {
          const data: { id: string; name: string }[] = await res.json()
          const exact = data.find(c => c.name === query) ?? data.find(c => c.name.toLowerCase() === query.toLowerCase())
          setCustomerId(exact ? exact.id : null)
        }
      } catch {
      }
    }, 300)

    return () => { clearTimeout(timer); controller.abort() }
  }, [customer])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer.trim()) {
      setError('Khách hàng là bắt buộc')
      return
    }
    if (!orderDate) {
      setError('Ngày đặt hàng là bắt buộc')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/orders/bulk-edit-pi', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piNumber,
          data: {
            customer: customer.trim(),
            customerId,
            orderDate: orderDate || undefined,
            deliveryDate: deliveryDate || null,
            containerSize: containerSize.trim() || null,
            description: description.trim() || null,
            remark: remark.trim() || null,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Cập nhật thất bại.')
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError('Lỗi kết nối mạng.')
    } finally {
      setIsLoading(false)
    }
  }

  const inputCls =
    'w-full bg-transparent border-[0.5px] border-outline-variant rounded px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:border-b-2 transition-colors'
  const monoInputCls =
    'w-full bg-transparent border-[0.5px] border-outline-variant rounded px-3 py-2 text-sm font-mono text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:border-b-2 transition-colors'
  const textareaCls =
    'w-full bg-transparent border-[0.5px] border-outline-variant rounded px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:border-b-2 transition-colors resize-none'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-outline-variant"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
          <div>
            <h3 className="text-base font-inter font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">edit_note</span>
              Sửa chung PO — [{piNumber}]
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              Cập nhật thông tin chung cho tất cả dòng hàng thuộc PI [{piNumber}]
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-error-container border border-error/30 text-error text-xs">
              <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer */}
            <div className="relative sm:col-span-2">
              <label htmlFor="bulk-customer" className="block text-xs font-inter font-medium text-secondary mb-1">
                Khách hàng <span className="text-error">*</span>
              </label>
              <SuggestCombobox<{ id: string }>
                id="bulk-customer"
                value={customer}
                onChange={setCustomer}
                load={loadCustomers}
                onSelect={(opt) => { pickedCustomer.current = { name: opt.value.trim(), id: opt.data!.id }; setCustomerId(opt.data!.id) }}
                className={inputCls}
                listLabel="Khách hàng"
                emptyText={(q) => `Chưa có khách "${q}" — sẽ tạo khách mới khi lưu`}
              />
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Ngày đặt hàng <span className="text-error">*</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className={monoInputCls}
              />
            </div>

            {/* Delivery Date */}
            <div>
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Ngày giao hàng
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className={monoInputCls}
              />
            </div>

            {/* Container Size */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Container size
              </label>
              <input
                type="text"
                placeholder="e.g. 40HQ x 1"
                value={containerSize}
                onChange={(e) => setContainerSize(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Mô tả (Description)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={textareaCls}
              />
            </div>

            {/* Remark */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Ghi chú nội bộ (Remark)
              </label>
              <textarea
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className={textareaCls}
              />
            </div>
          </div>

          {/* Footer actions inside form */}
          <div className="pt-4 border-t border-outline-variant flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-outline hover:bg-surface-container text-on-surface text-sm font-medium px-4 py-2 rounded-md transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 bg-primary text-on-primary text-sm font-medium px-5 py-2 rounded-md hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isLoading ? (
                <>Đang lưu...</>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">save</span> Lưu thay đổi PO
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
