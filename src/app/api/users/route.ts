import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'
const createSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(12).max(128), roleIds: z.array(z.string().min(1)).length(1) })
export async function GET(req: NextRequest) {
  const denied = await authError('GET', req, 'access.users.manage'); if (denied) return denied
  const users = await prisma.snyUser.findMany({ select: { id: true, email: true, createdAt: true, lockedUntil: true, roles: { select: { role: { select: { id: true, name: true } } } } }, orderBy: { email: 'asc' } })
  return NextResponse.json({ success: true, users: users.map(u => ({ ...u, createdAt: u.createdAt.toISOString(), lockedUntil: u.lockedUntil?.toISOString() ?? null, roles: u.roles.map(x => x.role) })) })
}
export async function POST(req: NextRequest) {
  const denied = await authError('POST', req, 'access.users.manage'); if (denied) return denied
  const body = createSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ success: false, error: 'Email, mật khẩu tối thiểu 12 ký tự và role là bắt buộc.' }, { status: 422 })
  try {
    const user = await prisma.snyUser.create({ data: { email: body.data.email, passwordHash: await hashPassword(body.data.password), roles: { create: Array.from(new Set(body.data.roleIds)).map(roleId => ({ role: { connect: { id: roleId } } })) } }, select: { id: true, email: true } })
    return NextResponse.json({ success: true, user }, { status: 201 })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ success: false, error: 'Email đã tồn tại hoặc role không hợp lệ.' }, { status: 409 })
    if ((error as { code?: string })?.code === 'P2025') return NextResponse.json({ success: false, error: 'Role đã bị xóa hoặc không tồn tại.' }, { status: 409 })
    return NextResponse.json({ success: false, error: 'Không tạo được tài khoản.' }, { status: 500 })
  }
}
