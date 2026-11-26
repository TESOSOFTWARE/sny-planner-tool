import { authError } from '@/lib/auth/session'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: { orderId: string } }

/** [MoM 30/10 §2, §4] Return knitting actual linked to this specific PI line.
 * KnittingDailyOutput is a machine/day total and must not be assigned to an order
 * by schedule share when presenting actual production by PI.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const accessError = await authError('GET', request)
  if (accessError) return accessError

  try {
    const order = await prisma.productionOrder.findUnique({
      where: { id: params.orderId },
      select: { id: true, piNumber: true, lengthM: true, isDraft: true },
    })
    if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy dòng đơn hàng.' }, { status: 404 })

    if (order.isDraft || order.lengthM == null) {
      return NextResponse.json({ success: true, producedMeters: null, remainingMeters: null, avgDailyOutput: null, remainingDays: null, hasData: false, hasUnlinkedData: false })
    }

    const now = new Date()
    const sevenCalendarDaysAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6))
    const [linked, unlinked, recentRows] = await Promise.all([
      prisma.knittingDailyDetail.aggregate({
        where: { orderId: order.id },
        _count: { mValue: true },
        _sum: { mValue: true },
      }),
      prisma.knittingDailyDetail.count({
        where: { orderId: null, orderRef: { equals: order.piNumber, mode: 'insensitive' } },
      }),
      prisma.knittingDailyDetail.findMany({
        where: {
          orderId: order.id,
          reportDate: { gte: sevenCalendarDaysAgo },
          mValue: { gt: 0 },
        },
        select: { reportDate: true, mValue: true },
      }),
    ])

    const hasData = linked._count.mValue > 0
    const producedMeters = Number(linked._sum.mValue ?? 0)
    const remainingMeters = Math.max(0, Number(order.lengthM) - producedMeters)
    const dailyTotals = new Map<string, number>()
    for (const row of recentRows) {
      const day = row.reportDate.toISOString().slice(0, 10)
      dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Number(row.mValue ?? 0))
    }
    const avgDailyOutput = dailyTotals.size
      ? Array.from(dailyTotals.values()).reduce((sum, value) => sum + value, 0) / dailyTotals.size
      : null

    return NextResponse.json({
      success: true,
      producedMeters: hasData ? Math.round(producedMeters * 100) / 100 : null,
      remainingMeters: hasData ? Math.round(remainingMeters * 100) / 100 : null,
      avgDailyOutput: avgDailyOutput !== null ? Math.round(avgDailyOutput) : null,
      remainingDays: avgDailyOutput && avgDailyOutput > 0 ? Math.ceil(remainingMeters / avgDailyOutput) : null,
      hasData,
      hasUnlinkedData: unlinked > 0,
    })
  } catch (err) {
    console.error('[GET /api/knitting/progress/[orderId]]', err)
    return NextResponse.json({ success: false, error: 'Không tải được sản lượng dệt theo dòng đơn.' }, { status: 500 })
  }
}
