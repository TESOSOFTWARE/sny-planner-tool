'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// All five tables keep their existing response shapes; only the request lifecycle is shared.
export function useMaterialPage<T extends { success: boolean; error?: string }>(endpoint: string, filters: string) {
  const [query, setQuery] = useState({ filters, page: 1, limit: 100 })
  const page = query.filters === filters ? query.page : 1
  const params = new URLSearchParams(filters)
  params.set('page', String(page)); params.set('limit', String(query.limit))
  const url = `${endpoint}?${params}`
  const [result, setResult] = useState<{ data: T | null; key: string; error: string | null }>({ data: null, key: '', error: null })
  const [pending, setPending] = useState(true)
  const [revision, setRevision] = useState(0)
  const sequence = useRef(0)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(previous => previous.filters === filters ? previous : { ...previous, filters, page: 1 })
  }, [filters])

  useEffect(() => {
    const controller = new AbortController(), request = ++sequence.current
    setPending(true)
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal })
        const data = await response.json() as T
        if (controller.signal.aborted || request !== sequence.current) return
        if (!response.ok || !data.success) {
          setResult(previous => ({ ...previous, key: url, error: data.error ?? 'Không thể tải dữ liệu.' }))
          return
        }
        setResult({ data, key: url, error: null })
      } catch {
        if (controller.signal.aborted || request !== sequence.current) return
        setResult(previous => ({ ...previous, key: url, error: 'Không thể kết nối máy chủ.' }))
      } finally {
        if (!controller.signal.aborted && request === sequence.current) setPending(false)
      }
    }
    void load()
    return () => { controller.abort(); sequence.current++ }
  }, [url, revision])

  const scrollToTable = () => {
    const frame = tableRef.current
    frame?.querySelector('[data-material-scroll]')?.scrollTo({ top: 0 })
    frame?.querySelector('nav')?.scrollIntoView({ block: 'start' })
  }
  const onPageChange = (next: number) => { setQuery({ filters, page: Math.max(1, next), limit: query.limit }); scrollToTable() }
  const onLimitChange = (limit: number) => { setQuery({ filters, page: 1, limit }); scrollToTable() }
  const retry = useCallback(() => { setPending(true); setRevision(value => value + 1) }, [])
  const loading = pending || result.key !== url
  const error = result.key === url ? result.error : null
  return { data: result.data, page, limit: query.limit, loading, error, retry, tableRef, onPageChange, onLimitChange }
}
