// GET /api/orders/pi-search?q=xxx — tìm PI cũ để "Repeat of" (feedback 12/10 #1). Chỉ đọc.
// q trống → 8 PI mới nhất (không tính placeholder); q có → khớp chứa trong số PI hoặc tên khách, không phân biệt hoa/thường.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
const querySchema = z.string().trim().max(50)
const LIMIT = 8

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(req.nextUrl.searchParams.get('q') ?? '')
  if (!parsed.success) return NextResponse.json({ error: 'Nội dung tìm PI không hợp lệ.' }, { status: 422 })
  const q = parsed.data
  try {
    // ponytail: gom nhóm trong JS trên tối đa 400 dòng mới nhất; khi số đơn lớn hơn nhiều thì chuyển sang groupBy/SQL.
    const rows = await prisma.productionOrder.findMany({
      // Bỏ placeholder chiếm lịch (import lịch máy, khách "Chưa xác định") — không phải đơn thật để lặp.
      where: { isPlaceholder: false, ...(q ? { OR: [{ piNumber: { contains: q, mode: 'insensitive' } }, { customer: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { piNumber: true, customer: true, orderDate: true, color: true },
      orderBy: [{ orderDate: 'desc' }, { piNumber: 'asc' }],
      take: 400,
    })
    const groups = new Map<string, { piNumber: string; customer: string; orderDate: Date | null; lineCount: number; colors: string[] }>()
    for (const row of rows) {
      let group = groups.get(row.piNumber)
      if (!group) {
        if (groups.size >= LIMIT) continue
        group = { piNumber: row.piNumber, customer: row.customer, orderDate: row.orderDate, lineCount: 0, colors: [] }
        groups.set(row.piNumber, group)
      }
      group.lineCount++
      const color = row.color?.trim()
      if (color && group.colors.length < 3 && !group.colors.includes(color)) group.colors.push(color)
    }
    return NextResponse.json(Array.from(groups.values()))
  } catch {
    return NextResponse.json({ error: 'Không tải được danh sách PI.' }, { status: 500 })
  }
}
