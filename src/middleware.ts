import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const h = new Headers(request.headers)
  h.set('x-sny-path', request.nextUrl.pathname)
  // Authentication is checked against persisted sessions in layouts/API handlers.
  return NextResponse.next({ request: { headers: h } })
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
