// Không đặt 'use client': chỉ import từ client component (MultiLineOrderForm, PiMasterDetailEditor, BulkEditPOModal).
// Ô nhập có gợi ý dùng chung (thay datalist native và các dropdown tự làm). Spec + quy tắc dùng:
// REPORT/12102026/CLAUDE/PLAN_UI_SUGGEST_COMBOBOX_12102026.md (§2–§4, §6b).
// Nhu cầu mới thì mở rộng prop ở đây, không chép code ra form (PATTERNS.md §4).
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type SuggestOption<T = undefined> = {
  /** Giá trị điền vào ô khi chọn. */
  value: string
  /** Chữ hiển thị (mặc định = value). */
  label?: string
  /** Nhãn phụ bên phải, chữ nhỏ (vd mô tả · loại lưới). */
  hint?: string
  /** Tên nhóm; nhãn nhóm hiện mỗi khi nhóm đổi, nên `load` phải trả các dòng cùng nhóm liền nhau. */
  group?: string
  data?: T
}

type Props<T> = {
  id: string
  value: string
  onChange: (value: string) => void
  /** q đã trim; '' = ô trống (nguồn tự trả các giá trị dùng nhiều). Phải tôn trọng signal. Phải ổn định (module-level hoặc useCallback). */
  load: (q: string, signal: AbortSignal) => Promise<SuggestOption<T>[]>
  /** Gọi sau khi đã onChange(option.value). */
  onSelect?: (option: SuggestOption<T>) => void
  /** Enter khi không có dòng nào đang chọn (vd ô Repeat: chép đúng chuỗi đã gõ). Không truyền thì Enter đi tiếp như ô thường. */
  onEnterWithoutSelection?: () => void
  renderOption?: (option: SuggestOption<T>, q: string) => ReactNode
  className?: string
  placeholder?: string
  disabled?: boolean
  dense?: boolean
  listLabel?: string
  emptyText?: (q: string) => string
  errorText?: string
  /** Textarea (vd Mô tả): ↑↓ chỉ chọn gợi ý khi panel đang có dòng, Enter không có dòng chọn thì xuống dòng. */
  multiline?: boolean
  rows?: number
  maxLength?: number
}

const PANEL_MAX = 240

export function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<span className="font-semibold text-primary">{text.slice(i, i + q.length)}</span>{text.slice(i + q.length)}</>
}

export default function SuggestCombobox<T = undefined>({
  id, value, onChange, load, onSelect, onEnterWithoutSelection, renderOption,
  className = '', placeholder, disabled = false, dense = false, listLabel = 'Gợi ý',
  emptyText = (q) => `Chưa có "${q}" — giá trị mới sẽ được gợi ý sau khi lưu đơn`,
  errorText = 'Không tải được gợi ý. Vẫn nhập tay được.',
  multiline = false, rows = 2, maxLength,
}: Props<T>) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const blurTimer = useRef<ReturnType<typeof setTimeout>>()
  const [open, setOpen] = useState(false)
  // Mở lại trong vòng 120ms sau blur (vd click lại ngay vào ô) không được bị hẹn giờ đóng cũ đè lên.
  const reopen = () => { clearTimeout(blurTimer.current); setOpen(true) }
  const [options, setOptions] = useState<SuggestOption<T>[]>([])
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  // Lật lên trên thì neo theo `bottom` (sát mép trên ô), để panel ngắn không lơ lửng xa ô.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const listId = `${id}-listbox`
  const q = value.trim()

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  // Tải gợi ý: chờ 250ms khi đang gõ, huỷ request cũ, bỏ kết quả về muộn.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(() => {
      load(q, controller.signal)
        .then(rows => { if (!controller.signal.aborted) { setOptions(rows); setActive(-1); setStatus('idle') } })
        .catch(() => { if (!controller.signal.aborted) { setOptions([]); setStatus('error') } })
    }, q ? 250 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, q, load])

  // Panel fixed theo vị trí ô: bám theo khi cuộn trang/bảng, chỉ đóng khi ô ra khỏi màn hình.
  useLayoutEffect(() => {
    if (!open) return
    let frame = 0
    const place = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = inputRef.current?.getBoundingClientRect()
        if (!r || r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return }
        const below = window.innerHeight - r.bottom
        const width = Math.min(Math.max(r.width, 240), window.innerWidth - 16)
        const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
        setPos(below < PANEL_MAX + 8 && r.top > below
          ? { bottom: window.innerHeight - r.top + 4, left, width }
          : { top: r.bottom + 4, left, width })
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open])

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id])

  const choose = (option: SuggestOption<T>) => { onChange(option.value); setOpen(false); setActive(-1); onSelect?.(option) }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    const n = options.length
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Textarea: không có gợi ý đang hiện thì ↑↓ để di chuyển con trỏ giữa các dòng chữ.
      if (multiline && !(open && n)) return
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (n) setActive(i => i < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter') {
      // Có dòng đang chọn: chọn và chặn lan lên form. Không có: onEnterWithoutSelection nếu có, còn lại để Enter đi tiếp
      // (form tạo đơn đã có guard chống submit).
      if (open && active >= 0 && options[active]) { e.preventDefault(); e.stopPropagation(); choose(options[active]) }
      else if (onEnterWithoutSelection) { e.preventDefault(); e.stopPropagation(); setOpen(false); onEnterWithoutSelection() }
    } else if (e.key === 'Escape' && open) {
      e.preventDefault(); e.stopPropagation(); setOpen(false)
    } else if (e.key === 'Tab') setOpen(false)
  }

  const rowCls = dense ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  // Ô trống chưa có dữ liệu thì không hiện panel rỗng; có gõ thì luôn hiện (kết quả / đang tải / rỗng / lỗi).
  const showPanel = open && !disabled && pos && (options.length > 0 || q !== '' || status === 'error')

  const fieldProps = {
    id, value, placeholder, className, disabled, maxLength, autoComplete: 'off',
    role: 'combobox', 'aria-expanded': !!showPanel, 'aria-controls': listId, 'aria-autocomplete': 'list' as const,
    'aria-activedescendant': showPanel && active >= 0 ? `${id}-opt-${active}` : undefined,
    onChange: (e: { target: { value: string } }) => {
      // Chỉ xoá kết quả cũ khi chuỗi tìm thật sự đổi (tránh chọn nhầm kết quả của từ khoá cũ).
      if (e.target.value.trim() !== q) { setOptions([]); setActive(-1) }
      onChange(e.target.value); setOpen(true)
    },
    onFocus: reopen,
    onClick: reopen, // mở lại sau Esc khi ô vẫn đang focus
    onBlur: () => { blurTimer.current = setTimeout(() => setOpen(false), 120) },
    onKeyDown,
  }

  return (
    <>
      {multiline
        ? <textarea ref={(el) => { inputRef.current = el }} rows={rows} {...fieldProps} />
        : <input ref={(el) => { inputRef.current = el }} type="text" {...fieldProps} />}
      {showPanel && pos && createPortal(
        <div id={listId} role="listbox" aria-label={listLabel}
          onMouseDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
          className="z-[9999] max-h-60 overflow-auto rounded-md border-[0.5px] border-outline-variant bg-surface-container-lowest py-1 shadow-lg">
          {options.length === 0
            ? <p className={`${rowCls} ${status === 'error' ? 'text-error' : 'text-secondary'}`}>
                {status === 'error' ? errorText : status === 'loading' ? 'Đang tải gợi ý…' : emptyText(q)}
              </p>
            : options.map((option, i) => (
              <Fragment key={`${option.value}|${i}`}>
                {option.group && option.group !== options[i - 1]?.group && (
                  <div role="presentation" className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-secondary bg-surface-container-low">{option.group}</div>
                )}
                <div id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
                  aria-label={option.group ? `${option.label ?? option.value}${option.hint ? ` · ${option.hint}` : ''} (${option.group})` : undefined}
                  onClick={() => choose(option)} onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer text-on-surface ${rowCls} ${i === active ? 'bg-surface-container-low' : ''}`}>
                  {renderOption ? renderOption(option, q) : (
                    <div className="flex items-baseline justify-between gap-3">
                      {/* Có hint (vd Item Code): giá trị chính không bao giờ bị cắt, để 2 mã gần giống vẫn phân biệt được; chỉ cắt hint.
                          Textarea (Mô tả): xuống dòng thay vì cắt, để đọc được cả câu. */}
                      <span className={option.hint ? 'shrink-0' : multiline ? 'min-w-0 whitespace-pre-wrap break-words' : 'min-w-0 truncate'}><Highlight text={option.label ?? option.value} q={q} /></span>
                      {option.hint && <span className="min-w-0 truncate text-xs text-secondary">{option.hint}</span>}
                    </div>
                  )}
                </div>
              </Fragment>
            ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Nguồn gợi ý từ đơn đã lưu (`/api/orders/suggestions`, chế độ "chứa" + top dùng nhiều). Ổn định ở cấp module. */
export const orderSuggestionLoader = (field: 'color' | 'meshType' | 'description') =>
  async (q: string, signal: AbortSignal): Promise<SuggestOption[]> => {
    const res = await fetch(`/api/orders/suggestions?field=${field}&match=contains&q=${encodeURIComponent(q)}`, { signal })
    if (!res.ok) throw new Error('suggestions')
    const values: string[] = await res.json()
    return values.map(value => ({ value }))
  }

/** Lọc danh sách đã có ở client theo "chứa" trên value + label + hint (vd Item Code). Trả tối đa `limit` dòng. */
export function filterLocalOptions<T>(options: SuggestOption<T>[], q: string, limit = 30): SuggestOption<T>[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return options.slice(0, limit)
  const hay = (o: SuggestOption<T>) => `${o.value} ${o.label ?? ''} ${o.hint ?? ''}`.toLowerCase()
  const starts = (o: SuggestOption<T>) => o.value.toLowerCase().startsWith(needle)
  return options.filter(o => hay(o).includes(needle)).sort((a, b) => Number(starts(b)) - Number(starts(a))).slice(0, limit)
}
