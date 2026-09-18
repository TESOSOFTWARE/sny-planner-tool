'use client'

// src/components/orders/BulkEditPOModal.tsx
// Modal to edit shared PO fields across all sub-lines of a piNumber.

import { useState, useEffect, useRef } from 'react'

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

  // Customer Autocomplete
  const [customerOptions, setCustomerOptions] = useState<{ id: string; name: string }[]>([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const customerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerRef.current && !customerRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const query = customer.trim()
        const url = query ? `/api/customers/search?q=${encodeURIComponent(query)}` : '/api/customers'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          setCustomerOptions(query ? data : data.slice(0, 20))
          if (query) {
            const exact = data.find((c: any) => c.name.toLowerCase() === query.toLowerCase())
            setCustomerId(exact ? exact.id : null)
          } else {
            setCustomerId(null)
          }
        }
      } catch {
      }
    }, customer.trim() ? 300 : 0)

    return () => clearTimeout(timer)
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
            <div className="relative sm:col-span-2" ref={customerRef}>
              <label className="block text-xs font-inter font-medium text-secondary mb-1">
                Khách hàng <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={customer}
                onChange={(e) => {
                  setCustomer(e.target.value)
                  setShowCustomerDropdown(true)
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                className={inputCls}
                autoComplete="off"
              />
              {showCustomerDropdown && customerOptions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-md shadow-lg max-h-48 overflow-auto">
                  {customerOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                      onClick={() => {
                        setCustomer(opt.name)
                        setCustomerId(opt.id)
                        setShowCustomerDropdown(false)
                      }}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              )}
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
