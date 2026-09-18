// src/app/api/customers/color-presets/route.ts
// GET /api/customers/color-presets?customerId=... OR ?customerName=...
// Returns array of ColorPreset for the specified customer.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ColorPreset } from '@prisma/client'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customerId')?.trim()
  const customerName = searchParams.get('customerName')?.trim()

  if (!customerId && !customerName) {
    return NextResponse.json([])
  }

  try {
    let presets: ColorPreset[] = []

    if (customerId) {
      presets = await prisma.colorPreset.findMany({
        where: { customerId },
        orderBy: { color: 'asc' },
      })
    } else if (customerName) {
      const customer = await prisma.customer.findFirst({
        where: { name: { equals: customerName, mode: 'insensitive' } },
        select: { id: true },
      })

      if (customer) {
        presets = await prisma.colorPreset.findMany({
          where: { customerId: customer.id },
          orderBy: { color: 'asc' },
        })
      }
    }

    return NextResponse.json(presets)
  } catch (err) {
    console.error('[GET /api/customers/color-presets]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
