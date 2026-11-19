'use client'

import { useMemo, useState } from 'react'
import ProductionHandoffPanel from '@/components/orders/ProductionHandoffPanel'

type OrderLine = { id: string; piNumber: string; subLineIndex: number; customer: string; color: string | null; orderType: string }
type PIGroup = { piNumber: string; customers: string[]; lines: OrderLine[] }

function groupByPI(orders: OrderLine[]): PIGroup[] {
  const map = new Map<string, OrderLine[]>()
  for (const order of orders) map.set(order.piNumber, [...(map.get(order.piNumber) ?? []), order])
  return Array.from(map.entries()).map(([piNumber, lines]) => ({
    piNumber,
    customers: Array.from(new Set(lines.map(line => line.customer))),
    lines: lines.sort((a, b) => a.subLineIndex - b.subLineIndex),
  }))
}

export default function ProductionHandoffsWorkspace({ orders, canEnter }: { orders: OrderLine[]; canEnter: boolean }) {
  const [search, setSearch] = useState('')
  const [selectedPI, setSelectedPI] = useState<string | null>(null)
  const groups = useMemo(() => groupByPI(orders), [orders])
  const query = search.trim().toLocaleLowerCase('vi-VN')
  const filtered = useMemo(() => query
    ? groups.filter(group => group.piNumber.toLocaleLowerCase('vi-VN').includes(query) || group.customers.some(customer => customer.toLocaleLowerCase('vi-VN').includes(query)) || group.lines.some(line => line.color?.toLocaleLowerCase('vi-VN').includes(query)))
    : groups, [groups, query])
  const selected = filtered.find(group => group.piNumber === selectedPI) ?? (filtered.length === 1 ? filtered[0] : null)

  return <div className="space-y-5">
    <div className="relative max-w-xl">
      <span aria-hidden="true" className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">search</span>
      <input aria-label="Tìm PI, khách hàng hoặc màu" className="h-10 w-full rounded-lg border border-outline-variant bg-surface pl-9 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" placeholder="Tìm PI, khách hàng hoặc màu…" value={search} onChange={event => setSearch(event.target.value)} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(280px,360px)_1fr]">
      <section aria-labelledby="handoff-pi-results" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="handoff-pi-results" className="font-semibold text-primary">Đơn hàng</h2>
          <span className="text-xs text-secondary">{filtered.length} PI</span>
        </div>
        {filtered.length === 0 ? <p role="status" className="rounded border border-outline-variant p-4 text-sm text-secondary">Không tìm thấy PI phù hợp.</p> : <ul className="space-y-2">{filtered.map(group => {
          const active = selected?.piNumber === group.piNumber
          return <li key={group.piNumber}><button type="button" aria-pressed={active} onClick={() => setSelectedPI(group.piNumber)} className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${active ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'}`}>
            <span className="block font-mono font-semibold text-primary">{group.piNumber}</span>
            <span className="mt-1 block truncate text-sm text-on-surface">{group.customers.join(', ')}</span>
            <span className="mt-1 block text-xs text-secondary">{group.lines.length} dòng hàng</span>
          </button></li>
        })}</ul>}
      </section>

      <section aria-labelledby="handoff-workspace-title" className="min-w-0 space-y-3">
        {selected ? <>
          <div><h2 id="handoff-workspace-title" className="text-lg font-semibold text-primary">PI {selected.piNumber}</h2><p className="text-sm text-secondary">Chọn dòng hàng để xem actual khả dụng và ghi bàn giao WIP.</p></div>
          <ProductionHandoffPanel canEnter={canEnter} defaultOpen orders={selected.lines.map(({ id, piNumber, subLineIndex, color, orderType }) => ({ id, piNumber, subLineIndex, color, orderType }))} />
        </> : <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-outline-variant p-6 text-center text-sm text-secondary">Chọn một PI để xem hành trình và lịch sử bàn giao.</div>}
      </section>
    </div>
  </div>
}
