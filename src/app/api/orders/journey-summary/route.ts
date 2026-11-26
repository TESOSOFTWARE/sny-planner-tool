import { authError } from '@/lib/auth/session'
// src/app/api/orders/journey-summary/route.ts
// GET /api/orders/journey-summary
// Summarizes production actuals and unresolved PI links for the PI journey view.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// This endpoint reads live production progress and must never be prerendered
// during `next build` or served from a stale cache after an import.
export const dynamic = 'force-dynamic'
export const revalidate = 0

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
  hasExtruderData: boolean
  hasWarpingData: boolean
  knittingMeters: number
  knittingWeightKg: number
  hasKnittingData: boolean
  hasKnittingMetersData: boolean
  hasUnlinkedExtruderData: boolean
  hasUnlinkedWarpingData: boolean
  hasUnlinkedKnittingData: boolean
  hasUnlinkedRollingData: boolean
  hasUnlinkedPackingData: boolean
  rollingMetrics: { metricLabel: string; value: number | null }[]
  packingMetrics: { metricLabel: string; unit: string; value: number }[]
  stages: Record<'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing', { lastUpdatedAt: string; source: string } | null>
  hasUnlinkedData: boolean
  unlinkedReason?: string
}

export async function GET(authRequest: Request) {
  const accessError = await authError('GET', authRequest)
  if (accessError) return accessError

  try {
    // 1. Fetch all ProductionOrders
    const orders = await prisma.productionOrder.findMany({
      select: { id: true, piNumber: true },
    })

    // Map orderId -> piNumber
    const orderIdToPI = new Map<string, string>()
    // Map normalized piNumber -> display value
    const piToOrdersMap = new Map<string, { rawPI: string }>()

    for (const o of orders) {
      orderIdToPI.set(o.id, o.piNumber)
      const norm = normalizePI(o.piNumber)
      if (!norm) continue
      if (!piToOrdersMap.has(norm)) piToOrdersMap.set(norm, { rawPI: o.piNumber })
    }

    // 2. Fetch Extruder outputs
    const extruders = await prisma.extruderDailyOutput.findMany({
      select: { id: true, orderId: true, orderRef: true, weightKgs: true, updatedAt: true, dataSource: true },
    })

    // 3. Fetch Warping outputs
    const warpings = await prisma.warpingDailyOutput.findMany({
      select: { id: true, orderId: true, orderRef: true, weightKgs: true, updatedAt: true, dataSource: true },
    })

    // 4. Fetch Knitting details and PI-level manual packing entries.
    const knittings = await prisma.knittingDailyDetail.findMany({
      select: { orderId: true, orderRef: true, mValue: true, weightKgs: true, updatedAt: true, dataSource: true },
    })
    const packingEntries = await prisma.manualProductionEntry.findMany({
      where: { stage: 'packing' },
      select: { orderId: true, orderRef: true, metricLabel: true, metricValue: true, unit: true, updatedAt: true },
    })
    const rollingEntries = await prisma.rollingDailyMetric.findMany({
      select: { orderId: true, orderRef: true, metricLabel: true, metricValue: true, createdAt: true, dataSource: true },
    })

    const extruderWeightMap = new Map<string, number>()
    const warpingWeightMap = new Map<string, number>()
    const extruderRowsMap = new Map<string, number>()
    const warpingRowsMap = new Map<string, number>()
    const knittingMetersMap = new Map<string, number>()
    const knittingWeightMap = new Map<string, number>()
    const knittingRowsMap = new Map<string, number>()
    const knittingMetersRowsMap = new Map<string, number>()
    const packingMetricsMap = new Map<string, Map<string, number>>()
    const rollingMetricsMap = new Map<string, Map<string, { value: number; hasMissingValue: boolean }>>()
    const unlinkedPISet = new Set<string>()
    const unlinkedExtruderPISet = new Set<string>()
    const unlinkedWarpingPISet = new Set<string>()
    const unlinkedKnittingPISet = new Set<string>()
    const unlinkedRollingPISet = new Set<string>()
    const unlinkedPackingPISet = new Set<string>()
    const stageMetaMap = new Map<string, Record<'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing', { lastUpdatedAt: Date; source: string } | null>>()

    const recordStageMeta = (pi: string, stage: 'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing', lastUpdatedAt: Date, source: string) => {
      const stages = stageMetaMap.get(pi) ?? { extruder: null, warping: null, knitting: null, rolling: null, packing: null }
      if (!stages[stage] || stages[stage]!.lastUpdatedAt < lastUpdatedAt) stages[stage] = { lastUpdatedAt, source }
      stageMetaMap.set(pi, stages)
    }

    const getPIsForOutput = (orderId: string | null, orderRef: string | null) => {
      if (orderId) {
        const pi = orderIdToPI.get(orderId)
        return pi ? [normalizePI(pi)] : []
      }
      return extractPISubstrings(orderRef).filter(pi => piToOrdersMap.has(pi))
    }

    // Accumulate Extruder weights
    for (const e of extruders) {
      const w = Number(e.weightKgs || 0)
      if (e.orderId) {
        const pi = orderIdToPI.get(e.orderId)
        if (pi) {
          const norm = normalizePI(pi)
          extruderWeightMap.set(norm, (extruderWeightMap.get(norm) || 0) + w)
          extruderRowsMap.set(norm, (extruderRowsMap.get(norm) || 0) + 1)
          recordStageMeta(norm, 'extruder', e.updatedAt, e.dataSource)
        }
      } else if (e.orderRef) {
        const extracted = extractPISubstrings(e.orderRef)
        for (const extP of extracted) {
          if (piToOrdersMap.has(extP)) {
            unlinkedPISet.add(extP)
            unlinkedExtruderPISet.add(extP)
            recordStageMeta(extP, 'extruder', e.updatedAt, e.dataSource)
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
          warpingRowsMap.set(norm, (warpingRowsMap.get(norm) || 0) + 1)
          recordStageMeta(norm, 'warping', w.updatedAt, w.dataSource)
        }
      } else if (w.orderRef) {
        const extracted = extractPISubstrings(w.orderRef)
        for (const extP of extracted) {
          if (piToOrdersMap.has(extP)) {
            unlinkedPISet.add(extP)
            unlinkedWarpingPISet.add(extP)
            recordStageMeta(extP, 'warping', w.updatedAt, w.dataSource)
          }
        }
      }
    }

    // Aggregate knitting at PI level; raw PI refs are safe to summarize at PI level,
    // but must remain unassigned at the sub-line level when the PI has multiple lines.
    for (const k of knittings) {
      const pis = getPIsForOutput(k.orderId, k.orderRef)
      for (const pi of pis) {
        knittingMetersMap.set(pi, (knittingMetersMap.get(pi) || 0) + Number(k.mValue || 0))
        knittingWeightMap.set(pi, (knittingWeightMap.get(pi) || 0) + Number(k.weightKgs || 0))
        knittingRowsMap.set(pi, (knittingRowsMap.get(pi) || 0) + 1)
        if (k.mValue != null) knittingMetersRowsMap.set(pi, (knittingMetersRowsMap.get(pi) || 0) + 1)
        recordStageMeta(pi, 'knitting', k.updatedAt, k.dataSource)
        if (!k.orderId) {
          unlinkedPISet.add(pi)
          unlinkedKnittingPISet.add(pi)
        }
      }
    }

    // Direct packing entries have a PI and unit. Preserve each source metric/unit;
    // do not sum rolls, pieces, metres and kilograms together.
    for (const entry of packingEntries) {
      for (const pi of getPIsForOutput(entry.orderId, entry.orderRef)) {
        const byMetric = packingMetricsMap.get(pi) ?? new Map<string, number>()
        const key = `${entry.metricLabel}\u0000${entry.unit}`
        byMetric.set(key, (byMetric.get(key) || 0) + Number(entry.metricValue))
        packingMetricsMap.set(pi, byMetric)
        recordStageMeta(pi, 'packing', entry.updatedAt, 'manual')
        if (!entry.orderId) {
          unlinkedPISet.add(pi)
          unlinkedPackingPISet.add(pi)
        }
      }
    }

    // Keep Rolling's source metric labels verbatim; do not infer SMALL/BIG units.
    for (const entry of rollingEntries) {
      for (const pi of getPIsForOutput(entry.orderId, entry.orderRef)) {
        const byMetric = rollingMetricsMap.get(pi) ?? new Map<string, { value: number; hasMissingValue: boolean }>()
        const current = byMetric.get(entry.metricLabel) ?? { value: 0, hasMissingValue: false }
        if (entry.metricValue == null) current.hasMissingValue = true
        else current.value += Number(entry.metricValue)
        byMetric.set(entry.metricLabel, current)
        rollingMetricsMap.set(pi, byMetric)
        recordStageMeta(pi, 'rolling', entry.createdAt, entry.dataSource)
        if (!entry.orderId) {
          unlinkedPISet.add(pi)
          unlinkedRollingPISet.add(pi)
        }
      }
    }

    // Build final map
    const journeyMap: Record<string, JourneyPISummary> = {}

    for (const [norm, info] of Array.from(piToOrdersMap.entries())) {
      const extW = extruderWeightMap.get(norm) || 0
      const warpW = warpingWeightMap.get(norm) || 0
      const isUnlinked = unlinkedPISet.has(norm)

      journeyMap[info.rawPI] = {
        piNumber: info.rawPI,
        extruderWeightKg: extW,
        warpingWeightKg: warpW,
        knittingMeters: knittingMetersMap.get(norm) || 0,
        knittingWeightKg: knittingWeightMap.get(norm) || 0,
        hasExtruderData: (extruderRowsMap.get(norm) || 0) > 0,
        hasWarpingData: (warpingRowsMap.get(norm) || 0) > 0,
        hasKnittingData: (knittingRowsMap.get(norm) || 0) > 0,
        hasKnittingMetersData: (knittingMetersRowsMap.get(norm) || 0) > 0,
        hasUnlinkedExtruderData: unlinkedExtruderPISet.has(norm),
        hasUnlinkedWarpingData: unlinkedWarpingPISet.has(norm),
        hasUnlinkedKnittingData: unlinkedKnittingPISet.has(norm),
        hasUnlinkedRollingData: unlinkedRollingPISet.has(norm),
        hasUnlinkedPackingData: unlinkedPackingPISet.has(norm),
        rollingMetrics: Array.from(rollingMetricsMap.get(norm)?.entries() ?? []).map(([metricLabel, item]) => ({ metricLabel, value: item.hasMissingValue ? null : item.value })),
        packingMetrics: Array.from(packingMetricsMap.get(norm)?.entries() ?? []).map(([key, value]) => {
          const [metricLabel, unit] = key.split('\u0000')
          return { metricLabel, unit, value }
        }),
        stages: Object.fromEntries(Object.entries(stageMetaMap.get(norm) ?? { extruder: null, warping: null, knitting: null, rolling: null, packing: null }).map(([stage, meta]) => [stage, meta ? { lastUpdatedAt: meta.lastUpdatedAt.toISOString(), source: meta.source } : null])) as JourneyPISummary['stages'],
        hasUnlinkedData: isUnlinked,
        unlinkedReason: isUnlinked
          ? 'Có báo cáo ghi PI này nhưng chưa xác định chính xác dòng hàng; xem bộ lọc chưa liên kết trong Sản lượng.'
          : undefined,
      }
    }

    return NextResponse.json({ success: true, journeyMap })
  } catch (err) {
    console.error('[GET /api/orders/journey-summary]', err)
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 })
  }
}
