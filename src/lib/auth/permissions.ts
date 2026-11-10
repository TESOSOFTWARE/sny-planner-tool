import { prisma } from '@/lib/db'

export const PERMISSIONS = ["orders.read","orders.create","orders.update","orders.approve","orders.delete","orders.import","customers.read","customers.create","customers.update","customers.delete","schedule.read","schedule.assign","schedule.update","schedule.remove","schedule.import","schedule.calendar.manage","output.read","output.plan.create","output.plan.update","output.actual.import","output.actual.enter","output.link.resolve","output.print","materials.read","materials.stock.update","materials.transaction.manage","materials.import.confirm","reports.read","reports.print","access.users.manage","access.roles.manage"] as const
export type PermissionKey = typeof PERMISSIONS[number]
export const ADMIN_ONLY_PERMISSIONS: PermissionKey[] = ['access.users.manage', 'access.roles.manage']
export const PERMISSION_LABELS: Record<PermissionKey, string> = {"orders.read":"Xem Production Orders","orders.create":"Tạo đơn","orders.update":"Sửa đơn","orders.approve":"Chốt đơn","orders.delete":"Xóa đơn","orders.import":"Nhập Excel đơn","customers.read":"Xem khách hàng","customers.create":"Tạo khách hàng","customers.update":"Sửa khách hàng","customers.delete":"Xóa khách hàng","schedule.read":"Xem lịch máy","schedule.assign":"Xếp máy","schedule.update":"Sửa/chuyển lịch","schedule.remove":"Gỡ lịch","schedule.import":"Nhập lịch","schedule.calendar.manage":"Sửa lịch nghỉ","output.read":"Xem sản lượng","output.plan.create":"Tạo kế hoạch sản xuất","output.plan.update":"Sửa kế hoạch sản xuất","output.actual.import":"Nhập sản lượng Excel","output.actual.enter":"Nhập sản lượng trực tiếp","output.link.resolve":"Gắn sản lượng với item","output.print":"In lịch sản xuất","materials.read":"Xem nguyên liệu/tồn","materials.stock.update":"Sửa tồn nguyên liệu","materials.transaction.manage":"Quản lý giao dịch kho","materials.import.confirm":"Xác nhận nhập báo cáo kho","reports.read":"Xem báo cáo thống kê","reports.print":"In báo cáo","access.users.manage":"Quản lý tài khoản và gán vai trò","access.roles.manage":"Tạo/sửa vai trò và quyền"} as const
export function permissionModule(key: PermissionKey) { return key.split('.')[0] }

export function permissionForRequest(pathname: string, method: string): PermissionKey | null {
  if (pathname.startsWith('/api/auth/')) return null
  if (pathname.startsWith('/orders/production')) return 'output.read'
  if (pathname === '/' || pathname.startsWith('/orders')) return 'orders.read'
  if (pathname.startsWith('/customers')) return 'orders.read'
  if (pathname.startsWith('/schedule')) return method === 'GET' ? 'schedule.read' : 'schedule.assign'
  if (pathname.startsWith('/materials')) return 'materials.read'
  if (pathname.startsWith('/reports')) return 'reports.read'
  if (pathname === '/forbidden') return null
  if (pathname.startsWith('/settings/')) return 'access.users.manage'
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method)
  if (pathname.startsWith('/api/production-records/manual')) return method === 'POST' ? 'output.actual.enter' : 'output.read'
  if (pathname.startsWith('/api/production-records/order-candidates')) return 'output.link.resolve'
  if (pathname.startsWith('/api/production-records')) return method === 'GET' ? 'output.read' : 'output.actual.enter'
  if (pathname.startsWith('/api/production-plans')) return method === 'GET' ? 'output.read' : method === 'POST' ? 'output.plan.create' : 'output.plan.update'
  if (pathname.startsWith('/api/orders')) {
    if (/approve/.test(pathname)) return 'orders.approve'
    if (/import/.test(pathname) || /\/bulk(?:$|-|\/)/.test(pathname) && write) return 'orders.import'
    return write ? (/bulk-delete|DELETE/.test(pathname) || method === 'DELETE' ? 'orders.delete' : /multi-line/.test(pathname) ? 'orders.create' : 'orders.update') : 'orders.read'
  }
  if (pathname.startsWith('/api/customers')) {
    if (!write) return 'customers.read'
    if (pathname.includes('color-presets')) return 'customers.update'
    if (method === 'DELETE') return 'customers.delete'
    return pathname.match(/^\/api\/customers\/?$/) ? 'customers.create' : 'customers.update'
  }
  if (pathname.startsWith('/api/assignments')) {
    if (/bulk-delete/.test(pathname) || method === 'DELETE') return 'schedule.remove'
    if (/import/.test(pathname)) return 'schedule.import'
    if (method === 'POST' && pathname.endsWith('/assignments')) return 'schedule.assign'
    return write ? 'schedule.update' : 'schedule.read'
  }
  if (pathname.startsWith('/api/calendar')) return write ? 'schedule.calendar.manage' : 'schedule.read'
  if (pathname.startsWith('/api/reports')) return write ? 'reports.print' : 'reports.read'
  if (pathname.startsWith('/api/schedule')) return write ? 'schedule.import' : 'schedule.read'
  if (pathname.startsWith('/api/machine-specs')) return write ? 'schedule.calendar.manage' : 'schedule.read'
  if (pathname.startsWith('/api/materials')) {
    if (/\/materials\/(?:packing|rolling)\/(?:records|import)/.test(pathname)) return write ? 'output.actual.import' : 'output.read'
    if (/packing\/import|rolling\/import|knitting\/|extruder\/import|warping\/import/.test(pathname)) return write ? 'output.actual.import' : 'output.read'
    if (/transactions|import-transactions|import-history/.test(pathname)) return write ? 'materials.import.confirm' : 'materials.read'
    return write ? 'materials.stock.update' : 'materials.read'
  }
  if (/^\/api\/(extruder|warping|knitting)\//.test(pathname)) {
    if (/template$/.test(pathname) || /records$/.test(pathname)) return 'output.read'
    return write ? 'output.actual.import' : 'output.read'
  }
  if (pathname.startsWith('/api/color-recipes')) return write ? 'orders.update' : 'orders.read'
  if (pathname.startsWith('/api/roles')) return 'access.roles.manage'
  if (pathname.startsWith('/api/users')) return 'access.users.manage'
  return null
}

export async function userHasPermission(userId: string, permission: PermissionKey): Promise<boolean> {
  const count = await prisma.snyUserRole.count({ where: { userId, role: { permissions: { some: { permissionKey: permission } } } } })
  return count > 0
}
