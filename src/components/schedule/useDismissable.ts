'use client'
import { useEffect, useRef, type RefObject } from 'react'
import { shouldDismiss } from '@/lib/schedule/scheduleGrid'

// Popup không có lớp nền: đóng khi bấm ra ngoài hoặc Esc; Esc trả focus về nút mở (0810-22c).
export function useDismissable(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement>, triggerRef: RefObject<HTMLElement>) {
  const pendingClickCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => pendingClickCleanup.current?.(), [])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: PointerEvent) => {
      if (!shouldDismiss(event.target, panelRef.current, triggerRef.current)) return
      const target = event.target instanceof Element ? event.target : null
      // Header/menu clicks must still switch popups; only swallow clicks into the grid body.
      if (target?.closest('[data-schedule-scroll] tbody')) {
        pendingClickCleanup.current?.()
        const clear = () => {
          document.removeEventListener('click', swallowClick, true)
          document.removeEventListener('pointerdown', clear, true)
          window.clearTimeout(timer)
          pendingClickCleanup.current = null
        }
        const swallowClick = (click: MouseEvent) => {
          clear()
          click.preventDefault()
          click.stopPropagation()
        }
        const timer = window.setTimeout(clear, 500)
        pendingClickCleanup.current = clear
        document.addEventListener('click', swallowClick, true)
        document.addEventListener('pointerdown', clear, true)
      }
      // The pending click listener survives the open -> closed effect cleanup.
      onClose()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, panelRef, triggerRef])
}
