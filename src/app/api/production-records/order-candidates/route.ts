import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.link.resolve')
  if (denied) return denied
  const parsed = z.string().trim().min(1).max(150).safeParse(request.nextUrl.searchParams.get('pi') ?? '')
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Nhập mã PI để tìm dòng đơn.' }, { status: 422 })
  try {
    const orders = await prisma.productionOrder.findMany({ where: { piNumber: parsed.data }, orderBy: { subLineIndex: 'asc' }, take: 50, select: { id: true, piNumber: true, subLineIndex: true, customer: true, itemCode: true, color: true, lifecycleStatus: true } })
    return NextResponse.json({ success: true, orders })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tra được dòng đơn theo PI.' }, { status: 500 })
  }
}
