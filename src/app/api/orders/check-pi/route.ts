// src/app/api/orders/check-pi/route.ts
// GET /api/orders/check-pi?piNumber=XXX
// Check if a PI Number already exists in DB and return existing customer names.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const piNumber = req.nextUrl.searchParams.get('piNumber')?.trim()
  if (!piNumber) {
    return NextResponse.json({ exists: false, customers: [] })
  }

  try {
    const orders = await prisma.productionOrder.findMany({
      where: {
        piNumber: {
          equals: piNumber,
          mode: 'insensitive',
        },
      },
      select: {
        customer: true,
      },
    })

    if (orders.length === 0) {
      return NextResponse.json({ exists: false, customers: [] })
    }

    const customers = Array.from(new Set(orders.map(o => o.customer).filter(Boolean)))
    return NextResponse.json({
      exists: true,
      customers,
      customer: customers[0] ?? null,
    })
  } catch (err) {
    console.error('[GET /api/orders/check-pi]', err)
    return NextResponse.json({ exists: false, customers: [], error: 'Lỗi kiểm tra PI.' }, { status: 500 })
  }
}
