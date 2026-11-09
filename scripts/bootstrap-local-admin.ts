// Local-only bootstrap. Run: node --env-file=.env.local --import tsx scripts/bootstrap-local-admin.ts EMAIL
import { PrismaClient } from '@prisma/client'
import { PERMISSIONS, PERMISSION_LABELS, permissionModule } from '../src/lib/auth/permissions'

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '')
  const email = process.argv[2]?.trim().toLowerCase()
  if (target.hostname !== '127.0.0.1' || target.port !== '55432' || target.pathname !== '/sny_planner_local') throw new Error('Bootstrap chỉ chạy trên DB local đã xác minh.')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Truyền email account local hiện có làm đối số.')
  const prisma = new PrismaClient()
  try {
    const user = await prisma.snyUser.findUnique({ where: { email } })
    if (!user) throw new Error('Không tìm thấy account local.')
    await prisma.$transaction(async tx => {
      for (const key of PERMISSIONS) await tx.snyPermission.upsert({ where: { key }, create: { key, label: PERMISSION_LABELS[key], module: permissionModule(key) }, update: { label: PERMISSION_LABELS[key], module: permissionModule(key) } })
      const role = await tx.snyRole.upsert({ where: { name: 'Admin' }, create: { name: 'Admin', description: 'Quản trị tài khoản, role và toàn bộ chức năng.', isSystem: true }, update: { description: 'Quản trị tài khoản, role và toàn bộ chức năng.', isSystem: true } })
      await tx.snyRolePermission.createMany({ data: PERMISSIONS.map(permissionKey => ({ roleId: role.id, permissionKey })), skipDuplicates: true })
      await tx.snyUserRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} })
    })
    console.log('Đã gán Admin cho account local.')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
