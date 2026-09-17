// src/app/orders/bulk/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { parsePastedTextExtended, type ParsedRowResult } from '@/lib/excel/parsePastedText'
import type { ParsedOrder } from '@/types'

export default function BulkPastePage() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [results, setResults] = useState<ParsedRowResult[]>([])
  const [status, setStatus] = useState<'idle' | 'preview' | 'saving' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)

  const handleParse = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    const parsed = parsePastedTextExtended(trimmed)
    setResults(parsed)
    setStatus('preview')
  }

  const handleImport = async () => {
    const validRows = results
      .filter((r) => r.isValid && r.order)
      .map((r) => r.order as ParsedOrder)

    if (validRows.length === 0) return

    setStatus('saving')
    setErrorMessage(null)

    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        setErrorMessage(json.error ?? 'Failed to import pasted orders.')
        setStatus('error')
        return
      }

      setImportResult({ imported: json.imported, skipped: json.skipped })
      setStatus('success')
      router.refresh()
    } catch {
      setErrorMessage('Network error — could not reach the server.')
      setStatus('error')
    }
  }

  const handleReset = () => {
    setText('')
    setResults([])
    setImportResult(null)
    setErrorMessage(null)
    setStatus('idle')
  }

  const handlePasteAgain = () => {
    setStatus('idle')
  }

  const totalCount = results.length
  const validCount = results.filter((r) => r.isValid).length
  const invalidCount = totalCount - validCount

  return (
    <div className="max-w-[1200px] mx-auto px-container-margin py-xl">
      {/* Breadcrumb — visible in idle, preview, and error states */}
      {(status === 'idle' || status === 'preview' || status === 'error') && (
        <nav aria-label="Breadcrumb" className="mb-lg">
          <ol className="flex items-center gap-sm text-label-md font-inter text-on-surface-variant">
            <li>
              <Link href="/orders" className="hover:text-primary transition-colors">
                Production orders
              </Link>
            </li>
            <li aria-hidden="true">
              <span className="material-symbols-outlined text-[16px] text-outline">chevron_right</span>
            </li>
            <li className="text-on-surface font-medium" aria-current="page">
              Bulk paste
            </li>
          </ol>
        </nav>
      )}

      {/* ── IDLE STATE (TEXTAREA INPUT) ────────────────────────────────────── */}
      {status === 'idle' && (
        <div className="space-y-lg">
          <div>
            <h1 className="text-display font-inter font-semibold text-primary tracking-tight">
              Bulk paste orders
            </h1>
            <p className="text-body-md font-noto text-secondary mt-xs">
              Copy rows directly from Excel and paste below
            </p>
          </div>

          <form onSubmit={handleParse} className="space-y-md">
            <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-lg flex flex-col gap-sm">
              <label htmlFor="excel-paste-textarea" className="text-label-sm font-inter font-medium text-on-surface-variant">
                Paste clipboard rows from Excel
              </label>
              <textarea
                id="excel-paste-textarea"
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste your Excel rows here (Ctrl+V)...&#10;&#10;Expected columns in order:&#10;Row ID | PI Number | Sub-line | Customer | Date | Item | Description | UV% | FR | GSM | Width | Length | Color | Unit | Qty"
                className="w-full min-h-[250px] bg-transparent border-[0.5px] border-outline-variant rounded-lg p-md font-mono text-type-mono text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:border-b-2 transition-colors resize-y"
              />
              <p className="text-label-sm font-inter text-outline">
                Note: Rows missing required fields (PI, Customer, Date, GSM, Width, Length, Color) will be highlighted for review before import.
              </p>
            </div>

            <div className="flex items-center gap-md">
              <button
                id="btn-parse-rows"
                type="submit"
                disabled={!text.trim()}
                className="inline-flex items-center gap-sm bg-primary text-on-primary text-label-md font-inter font-medium px-lg py-sm rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                <span className="material-symbols-outlined text-[18px]">table_rows</span>
                Parse rows →
              </button>
              <Link
                href="/orders"
                className="text-label-md font-inter font-medium text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* ── PREVIEW STATE (TABLE INSPECT) ──────────────────────────────────── */}
      {status === 'preview' && (
        <div className="space-y-lg">
          <div>
            <h1 className="text-display font-inter font-semibold text-primary tracking-tight">
              Preview pasted orders
            </h1>
            <p className="text-body-md font-noto text-secondary mt-xs">
              {validCount} of {totalCount} rows valid and ready to import. Review data mappings below.
            </p>
          </div>

          {/* Validation summary banner */}
          {invalidCount > 0 && (
            <div
              role="alert"
              className="flex items-start gap-sm border border-error/40 bg-error-container rounded-lg px-md py-sm"
            >
              <span className="material-symbols-outlined text-[20px] text-error shrink-0 mt-0.5">warning</span>
              <div>
                <p className="text-label-md font-inter font-semibold text-error">
                  {invalidCount} row(s) failed validation
                </p>
                <p className="text-label-sm font-inter text-on-error-container mt-0.5">
                  Invalid rows are highlighted in red below and will be skipped. You can import only the valid rows, or click "Paste again" to modify your paste input.
                </p>
              </div>
            </div>
          )}

          {invalidCount === 0 && totalCount > 0 && (
            <div
              role="status"
              className="flex items-center gap-sm border border-[#22c55e]/40 bg-[#f0fdf4] rounded-lg px-md py-sm"
            >
              <span className="material-symbols-outlined text-[20px] text-[#15803d]">check_circle</span>
              <p className="text-label-md font-inter font-medium text-[#15803d]">
                All {totalCount} rows are valid and ready to import!
              </p>
            </div>
          )}

          {/* Table Container */}
          <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface-container border-b-[0.5px] border-outline-variant">
                    {['#', 'Status / Issue', 'PI Number', 'Sub-line', 'Customer', 'Date', 'Width (m)', 'Length (m)', 'GSM', 'Color', 'FR', 'UV %', 'Qty'].map((h, idx) => (
                      <th
                        key={h}
                        className={`px-md py-sm text-left text-label-sm font-inter font-medium text-secondary uppercase tracking-widest whitespace-nowrap ${
                          ['Width (m)', 'Length (m)', 'GSM', 'Qty'].includes(h) ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[0.5px] divide-outline-variant">
                  {results.map((result, idx) => {
                    const rowNum = idx + 1
                    if (result.isValid && result.order) {
                      const o = result.order
                      return (
                        <tr
                          key={idx}
                          className="hover:bg-surface-container-low transition-colors bg-[#f0fdf4]/20 border-l-4 border-l-[#22c55e]"
                        >
                          <td className="px-md py-sm text-outline font-mono text-type-mono">{rowNum}</td>
                          <td className="px-md py-sm whitespace-nowrap">
                            <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-label-sm font-inter font-semibold bg-[#f0fdf4] text-[#15803d] border border-[#22c55e]/20">
                              <span className="material-symbols-outlined text-[12px]">check</span>
                              Valid
                            </span>
                          </td>
                          <td className="px-md py-sm whitespace-nowrap">
                            <span className="bg-primary text-on-primary rounded text-label-sm font-inter font-medium px-sm py-xs">
                              {o.piNumber}
                            </span>
                          </td>
                          <td className="px-md py-sm font-mono text-type-mono text-on-surface-variant text-center">
                            {o.subLineIndex}
                          </td>
                          <td className="px-md py-sm text-body-md font-noto text-on-surface whitespace-nowrap max-w-[140px] truncate">
                            {o.customer}
                          </td>
                          <td className="px-md py-sm font-mono text-type-mono text-on-surface-variant whitespace-nowrap tabular-nums">
                            {o.orderDate}
                          </td>
                          <td className="px-md py-sm text-right font-mono text-type-mono text-on-surface tabular-nums">
                            {Number(o.widthM).toFixed(1)}
                          </td>
                          <td className="px-md py-sm text-right font-mono text-type-mono text-on-surface tabular-nums">
                            {Number(o.lengthM).toLocaleString()}
                          </td>
                          <td className="px-md py-sm text-right font-mono text-type-mono text-on-surface tabular-nums">
                            {o.gsm}
                          </td>
                          <td className="px-md py-sm text-body-md font-noto text-on-surface whitespace-nowrap">
                            {o.color}
                          </td>
                          <td className="px-md py-sm text-center">
                            {o.frFlag ? (
                              <span className="text-[#92400E] bg-[#FFF8E7] border border-[#F59E0B]/30 px-sm py-xs rounded text-label-sm font-semibold">
                                FR
                              </span>
                            ) : (
                              <span className="text-outline">—</span>
                            )}
                          </td>
                          <td className="px-md py-sm font-mono text-type-mono text-on-surface-variant tabular-nums">
                            {o.uvPct != null ? `${(o.uvPct * 100).toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-md py-sm text-right font-mono text-type-mono text-on-surface tabular-nums">
                            {o.qty != null ? o.qty : '—'}
                          </td>
                        </tr>
                      )
                    } else {
                      return (
                        <tr
                          key={idx}
                          className="bg-error-container/10 hover:bg-error-container/15 border-l-4 border-l-error"
                        >
                          <td className="px-md py-sm text-outline font-mono text-type-mono">{rowNum}</td>
                          <td className="px-md py-sm whitespace-nowrap">
                            <span className="inline-flex items-center gap-xs px-2 py-0.5 rounded text-label-sm font-inter font-semibold bg-error-container text-error border border-error/20">
                              <span className="material-symbols-outlined text-[12px]">error</span>
                              Invalid
                            </span>
                          </td>
                          <td colSpan={11} className="px-md py-sm">
                            <div className="flex flex-col gap-xs">
                              <p className="text-label-sm font-inter font-semibold text-error">
                                Error: {result.error}
                              </p>
                              <p className="font-mono text-type-mono text-on-surface-variant break-all opacity-80 select-all">
                                {result.rawLine}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )
                    }
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t-[0.5px] border-outline-variant px-md py-sm bg-surface-container flex items-center justify-between">
              <p className="text-label-sm font-inter text-secondary">
                Total parsed rows: <span className="font-semibold text-on-surface">{totalCount}</span> · Valid to import: <span className="font-semibold text-[#15803d]">{validCount}</span> · Will skip: <span className="font-semibold text-error">{invalidCount}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-md">
            <button
              id="btn-confirm-import"
              onClick={handleImport}
              disabled={validCount === 0}
              className="inline-flex items-center gap-sm bg-primary text-on-primary text-label-md font-inter font-medium px-lg py-sm rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              Import {validCount} rows
            </button>
            <button
              id="btn-paste-again"
              onClick={handlePasteAgain}
              className="inline-flex items-center gap-sm border-[0.5px] border-outline-variant bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant hover:text-on-surface text-label-md font-inter font-medium px-md py-sm rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              ← Paste again
            </button>
          </div>
        </div>
      )}

      {/* ── SAVING STATE (SPINNER LOADING SCREEN) ─────────────────────────── */}
      {status === 'saving' && (
        <div className="flex flex-col items-center justify-center py-[120px] gap-md">
          <svg className="w-12 h-12 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <h2 className="text-headline-md font-inter font-semibold text-on-surface">Saving to database…</h2>
          <p className="text-body-md font-noto text-secondary">
            Writing valid orders and filtering duplicate keys. Do not close this page.
          </p>
        </div>
      )}

      {/* ── SUCCESS STATE (IMPORT SUCCESS BANNER) ─────────────────────────── */}
      {status === 'success' && importResult && (
        <div className="max-w-md mx-auto bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-lg md:p-xl shadow-lg mt-xl text-center space-y-lg">
          <div className="w-16 h-16 rounded-full bg-[#f0fdf4] border border-[#22c55e]/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[32px] text-[#15803d]">check_circle</span>
          </div>

          <div className="space-y-xs">
            <h2 className="text-headline-md font-inter font-semibold text-on-surface">
              Import completed!
            </h2>
            <p className="text-body-md font-noto text-secondary">
              The pasted records have been processed and saved.
            </p>
          </div>

          <div className="bg-surface-container-low border-[0.5px] border-outline-variant rounded-lg p-md text-left divide-y divide-[0.5px] divide-outline-variant/60 font-inter text-label-md">
            <div className="flex items-center justify-between py-2">
              <span className="text-secondary font-medium">Successfully Imported</span>
              <span className="font-semibold text-[#15803d] tabular-nums">{importResult.imported} rows</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-secondary font-medium">Skipped Duplicates</span>
              <span className="font-semibold text-outline tabular-nums">{importResult.skipped} rows</span>
            </div>
          </div>

          <div className="flex flex-col gap-sm pt-sm">
            <Link
              id="link-view-orders"
              href="/orders"
              className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-label-md font-inter font-medium py-sm px-lg rounded-lg hover:opacity-90 transition-opacity w-full"
            >
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              View all orders
            </Link>
            <button
              id="btn-paste-more"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-sm border-[0.5px] border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container text-label-md font-inter font-medium py-sm px-lg rounded-lg transition-colors w-full"
            >
              <span className="material-symbols-outlined text-[18px]">add_task</span>
              Paste more orders
            </button>
          </div>
        </div>
      )}

      {/* ── ERROR STATE (FAIL SCREEN) ────────────────────────────────────── */}
      {status === 'error' && (
        <div className="max-w-md mx-auto bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-lg md:p-xl shadow-lg mt-xl text-center space-y-lg">
          <div className="w-16 h-16 rounded-full bg-error-container border border-error/30 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[32px] text-error">error</span>
          </div>

          <div className="space-y-xs">
            <h2 className="text-headline-md font-inter font-semibold text-on-surface">
              Import failed
            </h2>
            <p className="text-body-md font-noto text-secondary">
              An error was encountered during the import process.
            </p>
          </div>

          {errorMessage && (
            <div role="alert" className="bg-error-container/20 border border-error/30 rounded-lg p-md text-left">
              <p className="text-label-sm font-inter text-error font-semibold">Error details:</p>
              <p className="text-label-sm font-inter text-on-error-container mt-1 break-words font-mono">
                {errorMessage}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-sm pt-sm">
            <button
              id="btn-try-again"
              onClick={handlePasteAgain}
              className="inline-flex items-center justify-center gap-sm bg-primary text-on-primary text-label-md font-inter font-medium py-sm px-lg rounded-lg hover:opacity-90 transition-opacity w-full"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Try again
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-sm border-[0.5px] border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-container text-label-md font-inter font-medium py-sm px-lg rounded-lg transition-colors w-full"
            >
              Cancel and reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
