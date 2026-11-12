'use client'
import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) })
      const result = await response.json()
      if (!response.ok || !result.success) { setError(result.error ?? 'Đăng nhập thất bại.'); return }
      window.location.assign('/orders')
    } catch { setError('Không thể kết nối máy chủ.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen flex items-center justify-center px-4 bg-background">
    <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-xl border border-outline-variant bg-surface p-7 shadow-sm">
      <div><h1 className="text-2xl font-semibold text-primary">Đăng nhập SNY Planner</h1><p className="mt-2 text-sm text-secondary">Nhập email và mật khẩu để tiếp tục.</p></div>
      <label className="block text-sm">Email<input required type="email" name="email" autoComplete="username" maxLength={254} className="mt-1 block w-full rounded border border-outline p-2 focus-visible:outline-primary" /></label>
      <label className="block text-sm">Mật khẩu<div className="relative mt-1"><input required type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" maxLength={128} className="block w-full rounded border border-outline p-2 pr-11 focus-visible:outline-primary" /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex items-center px-3 text-secondary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span aria-hidden="true" className="material-symbols-outlined text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span></button></div></label>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <button disabled={busy} className="w-full rounded bg-primary px-4 py-2 text-on-primary disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  </main>
}
