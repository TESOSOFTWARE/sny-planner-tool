import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Local-only helper for quickly filling the login form during development. */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Không tìm thấy.' }, { status: 404 })
  }

  const { SNY_DEV_LOGIN_EMAIL: email, SNY_DEV_LOGIN_PASSWORD: password } = process.env
  if (!email || !password) {
    return NextResponse.json({ error: 'Thiếu SNY_DEV_LOGIN_EMAIL hoặc SNY_DEV_LOGIN_PASSWORD trong .env.local.' }, { status: 404 })
  }

  return NextResponse.json({ email, password }, { headers: { 'Cache-Control': 'no-store, private' } })
}
