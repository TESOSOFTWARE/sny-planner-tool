/** Synthetic session for existing business-handler tests. Never accepts a real Prisma client. */
import { NextRequest } from 'next/server'
export function withTestSession<A extends unknown[], R>(handler: (...args: A) => Promise<R>, fixture: unknown): (...args: A) => Promise<R> {
  if (!fixture || typeof fixture !== 'object' || '$connect' in fixture) throw new Error('An isolated Prisma fixture is required.')
  Object.assign(fixture, { snySession: { findUnique: async () => ({ expiresAt: new Date(Date.now() + 60_000), user: { id: 'test-user', email: 'test@example.invalid' } }) }, snyUserRole: { count: async () => 1 } })
  return async (...args: A): Promise<R> => {
    const original = args[0] instanceof Request ? args[0] : undefined
    const h = new Headers(original?.headers)
    h.set('cookie', 'sny_session=' + 'a'.repeat(64))
    h.set('host', 'qa.invalid'); h.set('origin', 'http://qa.invalid')
    const url = new URL(original?.url ?? 'http://qa.invalid')
    // Older route fixtures used a generic URL path; give the auth resolver a
    // representative business endpoint while preserving their query string.
    if (url.pathname === '/records') url.pathname = '/api/extruder/records'
    if (url.pathname === '/rolling/import') url.pathname = '/api/materials/rolling/import'
    if (url.pathname === '/rolling/import/confirm') url.pathname = '/api/materials/rolling/import/confirm'
    const body = original && !['GET', 'HEAD'].includes(original.method) ? await original.clone().arrayBuffer() : undefined
    const request = new NextRequest(url, { method: original?.method, headers: h, body })
    return await Reflect.apply(handler, undefined, [request, ...args.slice(1)])
  }
}
