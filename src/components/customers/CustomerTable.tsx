'use client'

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import CustomerModal from './CustomerModal'

export interface SerializedCustomer {
  id: string
  name: string
  address: string | null
  tel: string | null
  fax: string | null
  contact: string | null
  country: string | null
  note: string | null
  createdAt: string
  updatedAt: string
  _count: { orders: number }
}

export default function CustomerTable({ initialCustomers }: { initialCustomers: SerializedCustomer[] }) {
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<SerializedCustomer[]>(initialCustomers)
  const search = searchParams.get('q') || ''
  const rawPage = parseInt(searchParams.get('page') || '1', 10)
  const requestedPage = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const rawPageSize = parseInt(searchParams.get('pageSize') || '25', 10)
  const pageSize = [25, 50, 100].includes(rawPageSize) ? rawPageSize : 25
  const [editingCustomer, setEditingCustomer] = useState<SerializedCustomer | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [jumpInput, setJumpInput] = useState('')

  const updateUrl = useCallback((updates: Record<string, string | null>, isPush = false) => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || (key === 'page' && value === '1') || (key === 'pageSize' && value === '25')) params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}`
    if (isPush) window.history.pushState(null, '', newUrl)
    else window.history.replaceState(null, '', newUrl)
  }, [])

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) setCustomers(await res.json())
    } catch (err) {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) return
    setDeleteError(null)
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setDeleteError(json.error || 'Lỗi khi xóa')
        return
      }
      await fetchCustomers()
    } catch (err) {
      setDeleteError('Lỗi mạng — vui lòng thử lại')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => c.name.toLowerCase().includes(q))
  }, [customers, search])

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(requestedPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedCustomers = useMemo(() => filtered.slice(startIndex, endIndex), [filtered, startIndex, endIndex])
  const pageItems = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const items: (number | '...')[] = [1]
    if (safePage > 3) items.push('...')
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) items.push(i)
    if (safePage < totalPages - 2) items.push('...')
    items.push(totalPages)
    return items
  }, [safePage, totalPages])

  return (
    <div className="space-y-lg">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-display font-inter font-semibold text-primary tracking-tight">Danh sách khách hàng</h1>
          <p className="text-body-md font-noto text-secondary mt-xs">Quản lý database khách hàng để sử dụng trong form tạo đơn</p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setIsModalOpen(true) }}
          className="inline-flex items-center gap-sm bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Thêm khách hàng
        </button>
      </div>

      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline pointer-events-none">search</span>
        <input
          type="text"
          placeholder="Tìm tên khách hàng..."
          value={search}
          onChange={(e) => updateUrl({ q: e.target.value, page: '1' })}
          className="w-full h-10 pl-9 pr-3 rounded-lg border-[0.5px] border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-inter text-on-surface placeholder:text-outline transition-colors"
        />
      </div>

      {deleteError && (
        <div role="alert" className="px-md py-sm bg-error-container text-on-error-container rounded text-sm font-noto">
          {deleteError}
        </div>
      )}

      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm font-inter text-on-surface">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant text-secondary uppercase tracking-wider text-xs">
                <th className="px-4 py-3 font-medium">Tên công ty</th>
                <th className="px-4 py-3 font-medium">Quốc gia</th>
                <th className="px-4 py-3 font-medium">Điện thoại</th>
                <th className="px-4 py-3 font-medium">Người liên hệ</th>
                <th className="px-4 py-3 font-medium text-center">Đơn hàng</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map(c => (
                <tr key={c.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-semibold text-primary">{c.name}</td>
                  <td className="px-4 py-3 text-secondary">{c.country || '—'}</td>
                  <td className="px-4 py-3 text-secondary font-mono">{c.tel || '—'}</td>
                  <td className="px-4 py-3 text-secondary">{c.contact || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center bg-surface-container px-2 py-0.5 rounded-full text-xs font-mono">
                      {c._count.orders}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingCustomer(c); setIsModalOpen(true) }}
                        className="text-primary hover:bg-primary-container p-1.5 rounded transition-colors"
                        title="Sửa"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={c._count.orders > 0}
                        className="text-error hover:bg-error-container p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={c._count.orders > 0 ? 'Không thể xóa khách hàng đang có đơn hàng' : 'Xóa'}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-secondary">
                    Không tìm thấy khách hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-md border-t border-outline-variant px-md py-sm bg-surface-container">
            <div className="flex items-center gap-md">
              <p className="text-label-sm font-inter text-secondary">
                Hiển thị <span className="font-semibold text-on-surface">{startIndex + 1}–{endIndex}</span> trong số{' '}
                <span className="font-semibold text-on-surface">{totalItems.toLocaleString('vi-VN')}</span> khách hàng
              </p>
              <label className="flex items-center gap-xs text-label-sm font-inter text-secondary">
                <span>Xem:</span>
                <select
                  value={pageSize}
                  onChange={(e) => updateUrl({ pageSize: e.target.value, page: '1' })}
                  className="bg-surface-container-lowest border border-outline-variant rounded px-sm py-[3px] text-label-sm font-inter text-on-surface focus:outline-none focus:border-primary"
                  aria-label="Chọn số khách hàng hiển thị trên một trang"
                >
                  <option value={25}>25 / trang</option>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                </select>
              </label>
            </div>

            <nav className="flex items-center gap-xs" aria-label="Phân trang khách hàng">
              <button onClick={() => updateUrl({ page: '1' }, true)} disabled={safePage === 1} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none" aria-label="Đến trang đầu tiên">
                <span className="material-symbols-outlined text-[18px]">first_page</span>
              </button>
              <button onClick={() => updateUrl({ page: String(Math.max(1, safePage - 1)) }, true)} disabled={safePage === 1} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none" aria-label="Quay lại trang trước">
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              {pageItems.map((item, idx) => item === '...'
                ? <span key={`dots-${idx}`} className="px-1 text-label-sm text-outline" aria-hidden="true">…</span>
                : <button key={item} onClick={() => updateUrl({ page: String(item) }, true)} className={`min-w-[28px] h-7 px-1 rounded text-label-sm font-inter ${item === safePage ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface hover:bg-surface-container-high'}`} aria-label={`Trang ${item}`} aria-current={item === safePage ? 'page' : undefined}>{item}</button>
              )}
              <button onClick={() => updateUrl({ page: String(Math.min(totalPages, safePage + 1)) }, true)} disabled={safePage === totalPages} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none" aria-label="Chuyển sang trang sau">
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
              <button onClick={() => updateUrl({ page: String(totalPages) }, true)} disabled={safePage === totalPages} className="p-1 rounded text-secondary hover:text-on-surface hover:bg-surface-container-high disabled:opacity-30 disabled:pointer-events-none" aria-label="Đến trang cuối cùng">
                <span className="material-symbols-outlined text-[18px]">last_page</span>
              </button>
              <div className="flex items-center gap-1 ml-sm pl-sm border-l border-outline-variant">
                <input type="number" min={1} max={totalPages} value={jumpInput} placeholder={String(safePage)} onChange={(e) => setJumpInput(e.target.value)} onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = parseInt(jumpInput, 10)
                    if (!isNaN(value)) {
                      updateUrl({ page: String(Math.min(Math.max(1, value), totalPages)) }, true)
                      setJumpInput('')
                    }
                  }
                }} className="w-12 h-7 bg-surface-container-lowest border border-outline-variant rounded px-1.5 text-center text-label-sm font-mono text-on-surface focus:outline-none focus:border-primary" aria-label="Nhập số trang muốn đến" />
                <button onClick={() => {
                  const value = parseInt(jumpInput, 10)
                  if (!isNaN(value)) {
                    updateUrl({ page: String(Math.min(Math.max(1, value), totalPages)) }, true)
                    setJumpInput('')
                  }
                }} className="h-7 px-2 rounded border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high text-label-sm font-inter text-secondary hover:text-on-surface">Đến</button>
              </div>
            </nav>
          </div>
        )}
      </div>

      {isModalOpen && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false)
            fetchCustomers()
          }}
        />
      )}
    </div>
  )
}
