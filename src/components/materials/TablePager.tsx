'use client'

interface Props {
  page: number
  total: number
  limit: number
  loading: boolean
  error: string | null
  label: string
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

export default function TablePager({ page, total, limit, loading, error, label, onPageChange, onLimitChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / limit))
  const first = total ? Math.min((page - 1) * limit + 1, total) : 0
  const last = Math.min(page * limit, total)
  const number = (value: number) => value.toLocaleString('vi-VN')
  const button = 'rounded border border-outline-variant px-3 py-1.5 text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40'
  return <nav aria-label={`Phân trang ${label}`} className="scroll-mt-20 flex flex-wrap items-center justify-between gap-2 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs tabular-nums">
    <span role="status" aria-live="polite">{loading ? `Đang tải trang ${number(page)}…` : error ? 'Chưa tải được trang. Hãy thử lại.' : `Hiển thị ${number(first)}–${number(last)} / ${number(total)} dòng · Trang ${number(page)}/${number(pages)}`}</span>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label={`Trang trước ${label}`} disabled={loading || !!error || page <= 1} onClick={() => onPageChange(page - 1)} className={button}>Trước</button>
      <button type="button" aria-label={`Trang sau ${label}`} disabled={loading || !!error || page >= pages} onClick={() => onPageChange(page + 1)} className={button}>Sau</button>
      <label className="flex items-center gap-2">Dòng/trang<select aria-label={`Số dòng mỗi trang ${label}`} value={limit} onChange={event => onLimitChange(Number(event.target.value))} disabled={loading} className="rounded border border-outline-variant bg-surface px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{[50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    </div>
  </nav>
}
