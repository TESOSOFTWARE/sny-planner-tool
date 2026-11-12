import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError, currentUser, tokenHash, SESSION_COOKIE } from '@/lib/auth/session'
import { cookies } from 'next/headers'
import { hashPassword } from '@/lib/auth/password'
const schema = z.object({ roleIds: z.array(z.string().min(1)).length(1), locked: z.boolean(), newPassword: z.string().min(12).max(128).optional() })
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('PATCH', req, 'access.users.manage'); if (denied) return denied
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ success: false, error: 'Thông tin tài khoản không hợp lệ.' }, { status: 422 })
  const actor = await currentUser(), target = await prisma.snyUser.findUnique({ where: { id: params.id }, include: { roles: { include: { role: true } } } })
  if (!target) return NextResponse.json({ success: false, error: 'Không tìm thấy tài khoản.' }, { status: 404 })
  if (actor?.id === target.id && body.data.locked) return NextResponse.json({ success: false, error: 'Không thể tự khóa tài khoản đang sử dụng.' }, { status: 409 })
  const hasAdmin = target.roles.some(x => x.role.isSystem && x.role.name === 'Admin')
  const keepsAdmin = (await prisma.snyRole.count({ where: { id: { in: body.data.roleIds }, isSystem: true, name: 'Admin' } })) > 0
  if (hasAdmin && (body.data.locked || !keepsAdmin)) {
    const other = await prisma.snyUserRole.count({ where: { role: { isSystem: true, name: 'Admin' }, userId: { not: target.id }, user: { lockedUntil: null } } })
    if (!other) return NextResponse.json({ success: false, error: 'Không thể khóa hoặc hạ quyền Admin cuối cùng.' }, { status: 409 })
  }
  try {
    const passwordHash = body.data.newPassword ? await hashPassword(body.data.newPassword) : undefined
    await prisma.$transaction(async tx => {
      await tx.snyRole.findMany({ where: { id: { in: Array.from(new Set(body.data.roleIds)) } }, select: { id: true } }).then(rows => {
        if (rows.length !== new Set(body.data.roleIds).size) throw new Error('ROLE_MISSING')
      })
      if (body.data.locked) await tx.snySession.deleteMany({ where: { userId: target.id } })
      await tx.snyUser.update({ where: { id: target.id }, data: { lockedUntil: body.data.locked ? new Date('9999-12-31T00:00:00Z') : null, ...(passwordHash ? { passwordHash, failedAttempts: 0 } : {}) } })
      await tx.snyUserRole.deleteMany({ where: { userId: target.id } })
      await tx.snyUserRole.createMany({ data: Array.from(new Set(body.data.roleIds)).map(roleId => ({ userId: target.id, roleId })) })
    })
    if (actor?.id === target.id && body.data.newPassword) { const token = cookies().get(SESSION_COOKIE)?.value; if (token) await prisma.snySession.deleteMany({ where: { tokenHash: tokenHash(token) } }); cookies().delete(SESSION_COOKIE) }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'ROLE_MISSING') return NextResponse.json({ success: false, error: 'Một role đã bị xóa.' }, { status: 409 })
    return NextResponse.json({ success: false, error: 'Không cập nhật được tài khoản.' }, { status: 500 })
  }
}
