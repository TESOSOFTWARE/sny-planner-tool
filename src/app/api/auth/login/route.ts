import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { sameOrigin, startSession } from '@/lib/auth/session'

const input = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) })
const dummyHash = hashPassword('unused-random-password')

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ success: false, error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 })
  const parsed = input.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Kiểm tra lại email và mật khẩu.' }, { status: 422 })
  try {
    const user = await prisma.snyUser.findUnique({ where: { email: parsed.data.email } })
    const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? await dummyHash)
    if (!user || (user.lockedUntil && user.lockedUntil > new Date()) || !valid) {
      if (user && (!user.lockedUntil || user.lockedUntil <= new Date())) {
        const updated = await prisma.snyUser.update({ where: { id: user.id }, data: { failedAttempts: { increment: 1 } } })
        if (updated.failedAttempts >= 5) await prisma.snyUser.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } })
      }
      return NextResponse.json({ success: false, error: 'Email hoặc mật khẩu không đúng, hoặc tài khoản đang tạm khóa. Thử lại sau.' }, { status: 401 })
    }
    await prisma.snyUser.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } })
    await startSession(user.id)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Không thể đăng nhập. Vui lòng thử lại.' }, { status: 503 })
  }
}
