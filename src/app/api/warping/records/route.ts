// src/app/api/warping/records/route.ts
// GET /api/warping/records
// Query params (all optional):
//   date      = "2026-07-20"  — filter by exact reportDate
//   machineId = "WARP-01"     — filter by machine
//   page      = 1 (default)
//   limit     = 100 (default, max 500)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const dateStr   = sp.get('date')
  const machineId = sp.get('machineId')
  const page      = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit     = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100', 10)))
  const skip      = (page - 1) * limit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  if (dateStr) {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) {
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const end   = new Date(start.getTime() + 86400000)
      where.reportDate = { gte: start, lt: end }
    }
  }

  if (machineId) {
    where.machineId = machineId
  }

  try {
    const [records, total] = await Promise.all([
      prisma.warpingDailyOutput.findMany({
        where,
        orderBy: [{ reportDate: 'desc' }, { machineId: 'asc' }, { shift: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.warpingDailyOutput.count({ where }),
    ])

    const serialized = records.map(r => ({
      ...r,
      denier:     r.denier?.toString() ?? null,
      strand:     r.strand?.toString() ?? null,
      beamCount1: r.beamCount1?.toString() ?? null,
      mPerEa:     r.mPerEa?.toString() ?? null,
      weigValue:  r.weigValue?.toString() ?? null,
      beamCount2: r.beamCount2?.toString() ?? null,
      quantity:   r.quantity?.toString() ?? null,
      weightKgs:  r.weightKgs.toString(),
      reportDate: r.reportDate.toISOString(),
      createdAt:  r.createdAt.toISOString(),
      updatedAt:  r.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      records: serialized,
      total,
      page,
      limit,
    })
  } catch (err) {
    console.error('[GET /api/warping/records]', err)
    return NextResponse.json({ success: false, error: 'Lỗi truy vấn dữ liệu.' }, { status: 500 })
  }
}
