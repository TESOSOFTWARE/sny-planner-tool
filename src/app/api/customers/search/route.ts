import { authError } from '@/lib/auth/session'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const accessError = await authError('GET', request)
  if (accessError) return accessError

  try {
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')

    if (!q || q.trim() === '') {
      return NextResponse.json([])
    }

    const customers = await prisma.customer.findMany({
      where: {
        name: {
          contains: q.trim(),
          mode: 'insensitive'
        }
      },
      orderBy: { name: 'asc' },
      take: 10
    })

    return NextResponse.json(customers)
  } catch (error) {
    console.error('[GET /api/customers/search]', error)
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 })
  }
}
