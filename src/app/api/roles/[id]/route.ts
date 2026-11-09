import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import { ADMIN_ONLY_PERMISSIONS, PERMISSIONS } from '@/lib/auth/permissions'
const schema = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(240).nullable().optional(), permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length) })
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('PATCH', req, 'access.roles.manage'); if (denied) return denied
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ success: false, error: 'Thông tin role không hợp lệ.' }, { status: 422 })
  if (body.data.permissions.some(permission => ADMIN_ONLY_PERMISSIONS.includes(permission))) return NextResponse.json({ success: false, error: 'Quyền quản trị tài khoản/role chỉ thuộc role Admin hệ thống.' }, { status: 422 })
  try {
    const result = await prisma.$transaction(async tx => {
      const role = await tx.snyRole.findUnique({ where: { id: params.id } })
      if (!role) return null
      if (role.isSystem) throw new Error('SYSTEM_ROLE')
      await tx.snyRole.update({ where: { id: role.id }, data: { name: body.data.name, description: body.data.description } })
      await tx.snyRolePermission.deleteMany({ where: { roleId: role.id } })
      if (body.data.permissions.length) await tx.snyRolePermission.createMany({ data: body.data.permissions.map(permissionKey => ({ roleId: role.id, permissionKey })) })
      return role.id
    })
    if (!result) return NextResponse.json({ success: false, error: 'Không tìm thấy role.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'SYSTEM_ROLE') return NextResponse.json({ success: false, error: 'Role Admin hệ thống không thể sửa.' }, { status: 409 })
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ success: false, error: 'Tên role đã tồn tại.' }, { status: 409 })
    return NextResponse.json({ success: false, error: 'Không cập nhật được role.' }, { status: 500 })
  }
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('DELETE', req, 'access.roles.manage'); if (denied) return denied
  const role = await prisma.snyRole.findUnique({ where: { id: params.id }, include: { _count: { select: { users: true } } } })
  if (!role) return NextResponse.json({ success: false, error: 'Không tìm thấy role.' }, { status: 404 })
  if (role.isSystem || role._count.users) return NextResponse.json({ success: false, error: 'Role hệ thống hoặc đang được gán không thể xóa.' }, { status: 409 })
  await prisma.snyRole.delete({ where: { id: role.id } })
  return NextResponse.json({ success: true })
}
