'use client'

import { Toaster as SonnerToaster } from 'sonner'

export default function ToasterProvider() {
  return (
    <SonnerToaster
      position="top-right"
      offset={76}
      richColors
      closeButton
      duration={3500}
      style={{
        zIndex: 99999,
      }}
      toastOptions={{
        className: 'font-inter text-sm shadow-xl rounded-xl border border-slate-200/80',
        style: {
          zIndex: 99999,
          fontFamily: 'var(--font-inter), sans-serif',
        },
      }}
    />
  )
}
