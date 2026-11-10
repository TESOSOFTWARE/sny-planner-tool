'use client'

import { useEffect, useState } from 'react'

type Attachment = { id: string; fileName: string; mimeType: string; fileSize: number; createdAt: string }

export default function OrderAttachments({ orderId }: { orderId: string }) {
  const [files, setFiles] = useState<Attachment[]>([]), [selected, setSelected] = useState<File | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const url = `/api/orders/${encodeURIComponent(orderId)}/attachments`
  async function load() {
    try { const res = await fetch(url); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error ?? 'Không tải được tệp.'); setFiles(data.files) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được tệp.') }
  }
  useEffect(() => { void load() }, [url])
  async function upload(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return
    setBusy(true); setError(''); setNotice('')
    try {
      const body = new FormData(); body.set('file', selected)
      const res = await fetch(url, { method: 'POST', body }); const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Không tải lên được tệp.')
      setSelected(null); setNotice('Đã đính kèm tệp vào dòng đơn.'); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải lên được tệp.') }
    finally { setBusy(false) }
  }
  return <section aria-labelledby="order-attachments-title" className="mx-auto mt-6 max-w-[800px] rounded border border-outline-variant bg-surface p-5">
    <h2 id="order-attachments-title" className="text-lg font-semibold text-primary">Tệp đính kèm theo dòng đơn</h2>
    <p className="mt-1 text-sm text-secondary">Ảnh quy cách hoặc PDF, tối đa 5 MB mỗi tệp.</p>
    <form onSubmit={upload} className="mt-4 flex flex-wrap items-center gap-3">
      <label className="text-sm">Chọn ảnh/PDF<input className="ml-2 max-w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setSelected(e.target.files?.[0] ?? null)} /></label>
      <button disabled={!selected || busy} className="rounded border border-primary px-4 py-2 text-sm text-primary disabled:opacity-50">{busy ? 'Đang tải…' : 'Đính kèm'}</button>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}{notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
    {!files.length ? <p className="mt-4 text-sm text-secondary">Chưa có tệp đính kèm.</p> : <ul className="mt-4 divide-y divide-outline-variant">{files.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{file.fileName} · {(file.fileSize / 1024).toFixed(0)} KB</span><a className="text-primary underline" href={`${url}/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">Mở tệp</a></li>)}</ul>}
  </section>
}
