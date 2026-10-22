'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import SuggestCombobox from '@/components/ui/SuggestCombobox'
import { formatOrderLabel, queryAfterSelection, searchOrderChoices, type OrderChoice } from '@/lib/schedule/orderChoiceSearch'

// Esc lần 1 chỉ đóng gợi ý, lần 2 mới đóng hộp. Handler React chạy trước listener document của useScheduleModalFocus nên cờ này kịp bật.
export function useComboboxEscapeGuard(onClose: () => void) {
  const escaping = useRef(false)
  const close = useCallback(() => { if (!escaping.current) onClose() }, [onClose])
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const target = event.target
    if (event.key === 'Escape' && target instanceof HTMLElement &&
        target.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') {
      escaping.current = true
      setTimeout(() => { escaping.current = false }, 0)
    }
  }
  return { close, onKeyDownCapture }
}

type Props<T extends OrderChoice & { id: string }> = {
  id: string
  orders: readonly T[]
  selectedId: string
  onSelectedChange: (id: string) => void
  loading: boolean
  includeFinished: boolean
  hiddenCount: number
  onToggleFinished: (next: boolean) => void
}

export default function OrderChoicePicker<T extends OrderChoice & { id: string }>({
  id, orders, selectedId, onSelectedChange, loading, includeFinished, hiddenCount, onToggleFinished,
}: Props<T>) {
  const [query, setQuery] = useState('')
  const selected = orders.find(o => o.id === selectedId)
  // Khi cha đặt sẵn dòng (Sửa phân công) thì ô hiện nhãn dòng đó; gõ lại chữ thì selectedId = '' và ô giữ chữ đang gõ;
  // cha đặt lại về rỗng (mở lại hộp Xếp máy) thì ô được xoá, không còn nhãn dòng lần trước.
  const previous = useRef<T | undefined>(undefined)
  const queryRef = useRef(query)
  queryRef.current = query
  useEffect(() => {
    setQuery(queryAfterSelection(queryRef.current, selected, previous.current))
    previous.current = selected
  }, [selected])

  const load = useCallback(async (q: string, _signal: AbortSignal) =>
    searchOrderChoices(orders, selected && q === formatOrderLabel(selected) ? '' : q).map(o => ({
      value: formatOrderLabel(o), label: formatOrderLabel(o), group: o.group, data: o,
    })), [orders, selected])

  return <>
    <SuggestCombobox
      id={id}
      value={query}
      onChange={value => { setQuery(value); onSelectedChange('') }}
      load={load}
      onSelect={option => onSelectedChange(option.data?.id ?? '')}
      disabled={loading}
      placeholder="Tìm PI, khách, màu, loại lưới, khổ, GSM..."
      listLabel="Dòng hàng"
      emptyText={() => 'Không tìm thấy dòng hàng phù hợp'}
      className="w-full h-10 px-sm rounded-lg border-[0.5px] border-outline bg-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none text-body-md"
    />
    <p className="mt-1 text-xs text-secondary">
      {loading ? 'Đang tải dòng hàng…' : includeFinished ? 'Đang hiện cả dòng đã kết thúc lịch' : `Đang ẩn ${hiddenCount} dòng đã kết thúc lịch`}
      {' · '}
      <button type="button" disabled={loading} onClick={() => onToggleFinished(!includeFinished)} className="text-primary underline disabled:opacity-50">{includeFinished ? 'Ẩn' : 'Hiện'}</button>
    </p>
  </>
}