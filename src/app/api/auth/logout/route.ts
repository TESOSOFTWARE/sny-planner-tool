import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { SESSION_COOKIE, sameOrigin, tokenHash } from '@/lib/auth/session'
export async function POST() {
  if (!sameOrigin()) return NextResponse.json({ success: false }, { status: 403 })
  const token = cookies().get(SESSION_COOKIE)?.value
  if (token) await prisma.snySession.deleteMany({ where: { tokenHash: tokenHash(token) } })
  cookies().delete(SESSION_COOKIE)
  return NextResponse.json({ success: true })
}
