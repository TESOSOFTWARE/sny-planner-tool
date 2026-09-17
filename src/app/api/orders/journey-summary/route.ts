// src/app/api/orders/journey-summary/route.ts
// GET /api/orders/journey-summary
// Computes Extruder, Warping progress weights and unlinked data warnings per piNumber.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function normalizePI(str: string | null | undefined): string {
  if (!str) return ''
  return str.trim().toUpperCase().replace(/\s+/g, '')
}

function extractPISubstrings(raw: string | null | undefined): string[] {
  if (!raw) return []
  let s = raw.trim()
  if (!s || s.startsWith('*')) return []

  s = s.replace(/[-–]\s*(GRAIN NET|SHADE NET|FENCE NET|DEBRIS NET|SAFETY NET).*/i, '')
  s = s.replace(/\s+(SHADE NET MONO TAPE|SHADE NET MONO|SHADE NET|FENCE NET|GRAIN NET|DEBRIS NET|SAFETY NET).*/i, '')

  const parts = s.split(/[,;\/]+/)
  return parts.map((p) => normalizePI(p)).filter(Boolean)
}

export interface JourneyPISummary {
  piNumber: string
  extruderWeightKg: number
  warpingWeightKg: number
  hasUnlinkedData: boolean
  unlinkedReason?: string
}

export async function GET() {
  try {
    // 1. Fetch all ProductionOrders
    const orders = await prisma.productionOrder.findMany({
      select: { id: true, piNumber: true, subLineIndex: true, requiredYarnKg: true },
    })

    // Map orderId -> piNumber
    const orderIdToPI = new Map<string, string>()
    // Map normalized piNumber -> list of orderIds and subLine count
    const piToOrdersMap = new Map<string, { ids: Set<string>; subLineCount: number; rawPI: string }>()

    for (const o of orders) {
      orderIdToPI.set(o.id, o.piNumber)
      const norm = normalizePI(o.piNumber)
      if (!norm) continue
      const existing = piToOrdersMap.get(norm)
      if (existing) {
        existing.ids.add(o.id)
        existing.subLineCount++
      } else {
        piToOrdersMap.set(norm, { ids: new Set([o.id]), subLineCount: 1, rawPI: o.piNumber })
      }
    }

    // 2. Fetch Extruder outputs
    const extruders = await prisma.extruderDailyOutput.findMany({
      select: { id: true, orderId: true, orderRef: true, weightKgs: true },
    })

    // 3. Fetch Warping outputs
    const warpings = await prisma.warpingDailyOutput.findMany({
      select: { id: true, orderId: true, orderRef: true, weightKgs: true },
    })

    // 4. Fetch Knitting details (for unlinked check)
    const knittings = await prisma.knittingDailyDetail.findMany({
      select: { id: true, orderId: true, orderRef: true },
    })

    const extruderWeightMap = new Map<string, number>()
    const warpingWeightMap = new Map<string, number>()
    const unlinkedPISet = new Set<string>()

    // Accumulate Extruder weights
    for (const e of extruders) {
      const w = Number(e.weightKgs || 0)
      if (e.orderId) {
        const pi = orderIdToPI.get(e.orderId)
        if (pi) {
          const norm = normalizePI(pi)
          extruderWeightMap.set(norm, (extruderWeightMap.get(norm) || 0) + w)
        }
      } else if (e.orderRef) {
        const extracted = extractPISubstrings(e.orderRef)
        for (const extP of extracted) {
          if (piToOrdersMap.has(extP)) {
            unlinkedPISet.add(extP)
          }
        }
      }
    }

    // Accumulate Warping weights
    for (const w of warpings) {
      const weight = Number(w.weightKgs || 0)
      if (w.orderId) {
        const pi = orderIdToPI.get(w.orderId)
        if (pi) {
          const norm = normalizePI(pi)
          warpingWeightMap.set(norm, (warpingWeightMap.get(norm) || 0) + weight)
        }
      } else if (w.orderRef) {
        const extracted = extractPISubstrings(w.orderRef)
        for (const extP of extracted) {
          if (piToOrdersMap.has(extP)) {
            unlinkedPISet.add(extP)
          }
        }
      }
    }

    // Check Knitting unlinked
    for (const k of knittings) {
      if (!k.orderId && k.orderRef) {
        const extracted = extractPISubstrings(k.orderRef)
        for (const extP of extracted) {
          if (piToOrdersMap.has(extP)) {
            unlinkedPISet.add(extP)
          }
        }
      }
    }

    // Build final map
    const journeyMap: Record<string, JourneyPISummary> = {}

    for (const [norm, info] of Array.from(piToOrdersMap.entries())) {
      const extW = extruderWeightMap.get(norm) || 0
      const warpW = warpingWeightMap.get(norm) || 0
      const isUnlinked = unlinkedPISet.has(norm) || (info.subLineCount > 1 && (extW > 0 || warpW > 0))

      journeyMap[info.rawPI] = {
        piNumber: info.rawPI,
        extruderWeightKg: extW,
        warpingWeightKg: warpW,
        hasUnlinkedData: isUnlinked,
        unlinkedReason: isUnlinked
          ? 'Có báo cáo SX ghi PI này nhưng chưa xác định chính xác dòng nào — kiểm tra tay tại tab Warping/Knitting'
          : undefined,
      }
    }

    return NextResponse.json({ success: true, journeyMap })
  } catch (err) {
    console.error('[GET /api/orders/journey-summary]', err)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
