import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
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
