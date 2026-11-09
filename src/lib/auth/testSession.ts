/** Synthetic session for existing business-handler tests. Never accepts a real Prisma client. */
import { NextRequest } from 'next/server'
export function withTestSession<A extends unknown[], R>(handler: (...args: A) => R, fixture: unknown): (...args: A) => R {
  if (!fixture || typeof fixture !== 'object' || '$connect' in fixture) throw new Error('An isolated Prisma fixture is required.')
  Object.assign(fixture, { snySession: { findUnique: async () => ({ expiresAt: new Date(Date.now() + 60_000), user: { id: 'test-user', email: 'test@example.invalid' } }) } })
  return (...args: A): R => {
    const original = args[0] instanceof Request ? args[0] : undefined
    const h = new Headers(original?.headers)
    h.set('cookie', 'sny_session=' + 'a'.repeat(64))
    h.set('host', 'qa.invalid'); h.set('origin', 'http://qa.invalid')
    const request = new NextRequest(original ?? 'http://qa.invalid', { headers: h })
    return Reflect.apply(handler, undefined, [request, ...args.slice(1)])
  }
}
