'use client'

import { useCallback, useRef, useState } from 'react'
import { useDismissable } from '@/components/schedule/useDismissable'

interface Props {
  materialName: string
  onEdit: () => void
  onDelete: () => void
}

export default function MaterialActionsMenu({ materialName, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismissable(open, close, panelRef, triggerRef)

  return (
    <div ref={panelRef} className="relative">
      <button ref={triggerRef} type="button" aria-label={`Thao tác với ${materialName}`} aria-expanded={open} aria-haspopup="menu" onClick={event => { event.stopPropagation(); setOpen(value => !value) }} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-outline-variant text-secondary hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
      </button>
      {open && <div role="menu" className="absolute right-0 z-30 mt-1 min-w-28 rounded-md border border-outline-variant bg-surface p-1 shadow-lg">
        <button role="menuitem" onClick={event => { event.stopPropagation(); close(); onEdit() }} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-surface-container">Chỉnh sửa</button>
        <button role="menuitem" onClick={event => { event.stopPropagation(); close(); onDelete() }} className="block w-full rounded px-3 py-2 text-left text-sm text-error hover:bg-error-container">Xóa</button>
      </div>}
    </div>
  )
}
