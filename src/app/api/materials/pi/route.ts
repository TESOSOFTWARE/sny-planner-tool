import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
// [MoM §3.1 / Q-17] Small PI-only suggestion payload, not the full order list.
export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (query.length > 200) return NextResponse.json({ success: false, error: 'Mã PI tìm kiếm quá dài.' }, { status: 422 })
  try {
    const orders = await prisma.productionOrder.findMany({ where: query ? { piNumber: { contains: query, mode: 'insensitive' } } : {}, select: { piNumber: true }, distinct: ['piNumber'], orderBy: { piNumber: 'asc' }, take: 50 })
    return NextResponse.json({ success: true, piNumbers: orders.map(order => order.piNumber) })
  } catch {
    return NextResponse.json({ success: false, error: 'Không thể tải gợi ý mã PI.' }, { status: 500 })
  }
}
