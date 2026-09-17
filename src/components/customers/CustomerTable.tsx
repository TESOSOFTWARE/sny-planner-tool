'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [customers, setCustomers] = useState<SerializedCustomer[]>(initialCustomers)
  const [search, setSearch] = useState('')
  const [editingCustomer, setEditingCustomer] = useState<SerializedCustomer | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers')
      if (res.ok) setCustomers(await res.json())
    } catch (err) {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) return
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Lỗi khi xóa')
        return
      }
      await fetchCustomers()
    } catch (err) {
      alert('Lỗi mạng')
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(c => c.name.toLowerCase().includes(q))
  }, [customers, search])

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
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-lg border-[0.5px] border-outline-variant bg-surface focus:border-primary focus:outline-none text-sm font-inter text-on-surface placeholder:text-outline transition-colors"
        />
      </div>

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
              {filtered.map(c => (
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
