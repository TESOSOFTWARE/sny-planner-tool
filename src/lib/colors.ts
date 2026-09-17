export type ColorStyle = {
  bgHex: string
  textHex: string
  borderHex: string
  bgClass: string
  textClass: string
  borderClass: string
}

export const PI_COLOR_PALETTE: ColorStyle[] = [
  { bgHex: '#d1fae5', textHex: '#065f46', borderHex: '#6ee7b7', bgClass: 'bg-emerald-100', textClass: 'text-emerald-900', borderClass: 'border-emerald-300' },
  { bgHex: '#dbeafe', textHex: '#1e40af', borderHex: '#93c5fd', bgClass: 'bg-blue-100', textClass: 'text-blue-900', borderClass: 'border-blue-300' },
  { bgHex: '#f3e8ff', textHex: '#6b21a8', borderHex: '#d8b4fe', bgClass: 'bg-purple-100', textClass: 'text-purple-900', borderClass: 'border-purple-300' },
  { bgHex: '#fef3c7', textHex: '#92400e', borderHex: '#fcd34d', bgClass: 'bg-amber-100', textClass: 'text-amber-950', borderClass: 'border-amber-300' },
  { bgHex: '#ffe4e6', textHex: '#9f1239', borderHex: '#fda4af', bgClass: 'bg-rose-100', textClass: 'text-rose-900', borderClass: 'border-rose-300' },
  { bgHex: '#e0e7ff', textHex: '#3730a3', borderHex: '#a5b4fc', bgClass: 'bg-indigo-100', textClass: 'text-indigo-900', borderClass: 'border-indigo-300' },
  { bgHex: '#ccfbf1', textHex: '#115e59', borderHex: '#5eead4', bgClass: 'bg-teal-100', textClass: 'text-teal-900', borderClass: 'border-teal-300' },
  { bgHex: '#cffafe', textHex: '#155e75', borderHex: '#67e8f9', bgClass: 'bg-cyan-100', textClass: 'text-cyan-900', borderClass: 'border-cyan-300' },
  { bgHex: '#e0f2fe', textHex: '#075985', borderHex: '#7dd3fc', bgClass: 'bg-sky-100', textClass: 'text-sky-900', borderClass: 'border-sky-300' },
  { bgHex: '#ede9fe', textHex: '#5b21b6', borderHex: '#c4b5fd', bgClass: 'bg-violet-100', textClass: 'text-violet-900', borderClass: 'border-violet-300' },
  { bgHex: '#fae8ff', textHex: '#86198f', borderHex: '#f0abfc', bgClass: 'bg-fuchsia-100', textClass: 'text-fuchsia-900', borderClass: 'border-fuchsia-300' },
  { bgHex: '#fce7f3', textHex: '#9d174d', borderHex: '#fbcfe8', bgClass: 'bg-pink-100', textClass: 'text-pink-900', borderClass: 'border-pink-300' },
  { bgHex: '#ffedd5', textHex: '#9a3412', borderHex: '#fdba74', bgClass: 'bg-orange-100', textClass: 'text-orange-950', borderClass: 'border-orange-300' },
  { bgHex: '#ecfccb', textHex: '#3f6212', borderHex: '#bef264', bgClass: 'bg-lime-100', textClass: 'text-lime-950', borderClass: 'border-lime-300' },
  { bgHex: '#fef9c3', textHex: '#854d0e', borderHex: '#fde047', bgClass: 'bg-yellow-100', textClass: 'text-yellow-950', borderClass: 'border-yellow-300' },
  { bgHex: '#e2e8f0', textHex: '#1e293b', borderHex: '#cbd5e1', bgClass: 'bg-slate-200', textClass: 'text-slate-900', borderClass: 'border-slate-300' },
]

/**
 * Deterministic color picker for a given piNumber string.
 * Always returns the exact same ColorStyle for identical piNumbers.
 */
export function getPiColorStyle(piNumber?: string | null): ColorStyle {
  if (!piNumber) return PI_COLOR_PALETTE[0]

  let hash = 0
  for (let i = 0; i < piNumber.length; i++) {
    hash = piNumber.charCodeAt(i) + ((hash << 5) - hash)
  }

  const index = Math.abs(hash) % PI_COLOR_PALETTE.length
  return PI_COLOR_PALETTE[index]
}
