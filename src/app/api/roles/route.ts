import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError, currentUser } from '@/lib/auth/session'
import { ADMIN_ONLY_PERMISSIONS, PERMISSIONS, PERMISSION_LABELS, permissionModule } from '@/lib/auth/permissions'

const schema = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(240).nullable().optional(), permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length) })
export async function GET(req: NextRequest) {
  const denied = await authError('GET', req, 'access.roles.manage'); if (denied) return denied
  const roles = await prisma.snyRole.findMany({ include: { permissions: { select: { permissionKey: true } }, _count: { select: { users: true } } }, orderBy: { name: 'asc' } })
  return NextResponse.json({ success: true, roles: roles.map(r => ({ id: r.id, name: r.name, description: r.description, isSystem: r.isSystem, userCount: r._count.users, permissions: r.permissions.map(p => p.permissionKey) })), catalog: PERMISSIONS.map(key => ({ key, label: PERMISSION_LABELS[key], module: permissionModule(key) })) })
}
export async function POST(req: NextRequest) {
  const denied = await authError('POST', req, 'access.roles.manage'); if (denied) return denied
  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ success: false, error: 'Tên role hoặc danh sách quyền không hợp lệ.' }, { status: 422 })
  if (body.data.permissions.some(permission => ADMIN_ONLY_PERMISSIONS.includes(permission))) return NextResponse.json({ success: false, error: 'Quyền quản trị tài khoản/role chỉ thuộc role Admin hệ thống.' }, { status: 422 })
  try {
    const role = await prisma.snyRole.create({ data: { name: body.data.name, description: body.data.description, permissions: { create: body.data.permissions.map(permissionKey => ({ permission: { connect: { key: permissionKey } } })) } } })
    return NextResponse.json({ success: true, role: { id: role.id, name: role.name, permissions: body.data.permissions } }, { status: 201 })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ success: false, error: 'Tên role đã tồn tại.' }, { status: 409 })
    return NextResponse.json({ success: false, error: 'Không tạo được role.' }, { status: 500 })
  }
}
