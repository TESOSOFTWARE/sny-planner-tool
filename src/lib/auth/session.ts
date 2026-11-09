import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { permissionForRequest, userHasPermission, type PermissionKey } from '@/lib/auth/permissions'

export const SESSION_COOKIE = 'sny_session'
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function currentUser(providedToken?: string | null) {
  const token = providedToken === undefined ? cookies().get(SESSION_COOKIE)?.value : providedToken
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const session = await prisma.snySession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { id: true, email: true, lockedUntil: true } } } })
  return session && session.expiresAt > new Date() && (!session.user.lockedUntil || session.user.lockedUntil <= new Date()) ? session.user : null
}

export async function requireUser() {
  const user = await currentUser()
  if (!user) redirect('/login')
  return user
}

export async function requirePermission(permission: PermissionKey) {
  const user = await requireUser()
  if (!await userHasPermission(user.id, permission)) redirect('/forbidden')
  return user
}

export function sameOrigin(request?: Request) {
  const h = request?.headers ?? headers(), origin = h.get('origin'), host = h.get('host')
  if (!origin || !host) return false
  try { return new URL(origin).host === host } catch { return false }
}

/** Called by every business Route Handler, including requests bypassing UI. */
export async function authError(method: string, request: Request, explicitPermission?: PermissionKey) {
  const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1) ?? null
  const user = await currentUser(token)
  if (!user) return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập.' }, { status: 401 })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !sameOrigin(request)) return NextResponse.json({ success: false, error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 })
  const required = explicitPermission ?? permissionForRequest(new URL(request.url).pathname, method)
  if (!required || !await userHasPermission(user.id, required)) return NextResponse.json({ success: false, error: 'Bạn chưa được cấp quyền thực hiện thao tác này.' }, { status: 403 })
  return null
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000)
  await prisma.snySession.create({ data: { tokenHash: tokenHash(token), userId, expiresAt } })
  cookies().set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', expires: expiresAt, path: '/' })
}
