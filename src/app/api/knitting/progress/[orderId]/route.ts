// src/app/api/knitting/progress/[orderId]/route.ts
// GET /api/knitting/progress/[orderId]
// Returns production progress for one order:
//   - producedMeters: SUM(dailyMeters) across all assigned machines, within assignment date range
//   - remainingMeters: MAX(0, order.lengthM - producedMeters)
//   - avgDailyOutput: AVG(dailyMeters > 0) for last 7 days across assigned machines
//   - remainingDays: ceil(remainingMeters / avgDailyOutput) — null if no output data
//
// totalMeters source: order.lengthM (confirmed: all orders are orderType=meters)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface Params { params: { orderId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const { orderId } = params

  // ── 1. Fetch order ─────────────────────────────────────────────────────────
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    select: { id: true, lengthM: true, isDraft: true },
  })
  if (!order) {
    return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
  }

  if (order.isDraft || order.lengthM == null) {
    return NextResponse.json({
      success: true,
      producedMeters: 0,
      remainingMeters: 0,
      avgDailyOutput: null,
      remainingDays: null,
      hasData: false,
    })
  }

  // ── 2. Fetch all machine assignments for this order ─────────────────────────
  const assignments = await prisma.machineAssignment.findMany({
    where: { orderId },
    select: { machineId: true, startDate: true, endDate: true },
  })

  if (assignments.length === 0) {
    // No assignments — no progress data available
    return NextResponse.json({
      success: true,
      producedMeters: 0,
      remainingMeters: order.lengthM,
      avgDailyOutput: null,
      remainingDays: null,
      hasData: false,
    })
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  // ── 3. Compute producedMeters per assignment ───────────────────────────────
  let totalProduced = 0

  for (const assignment of assignments) {
    const effectiveEnd = assignment.endDate < today ? assignment.endDate : today

    // Skip if assignment hasn't started yet
    if (assignment.startDate > today) continue

    const rows = await prisma.knittingDailyOutput.findMany({
      where: {
        machineId: assignment.machineId,
        reportDate: {
          gte: assignment.startDate,
          lte: effectiveEnd,
        },
      },
      select: { dailyMeters: true },
    })

    for (const r of rows) {
      totalProduced += Number(r.dailyMeters)
    }
  }

  const totalMeters = order.lengthM
  const remaining = Math.max(0, totalMeters - totalProduced)

  // ── 4. Compute avgDailyOutput — last 7 days, across all assigned machines ──
  const machineIds = assignments.map((a) => a.machineId)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  const recentRows = await prisma.knittingDailyOutput.findMany({
    where: {
      machineId: { in: machineIds },
      reportDate: { gte: sevenDaysAgo, lte: today },
      dailyMeters: { gt: 0 }, // exclude idle days from average
    },
    select: { dailyMeters: true },
  })

  let avgDailyOutput: number | null = null
  if (recentRows.length > 0) {
    const sum = recentRows.reduce((acc, r) => acc + Number(r.dailyMeters), 0)
    avgDailyOutput = sum / recentRows.length
  }

  const remainingDays =
    avgDailyOutput && avgDailyOutput > 0
      ? Math.ceil(remaining / avgDailyOutput)
      : null

  return NextResponse.json({
    success: true,
    producedMeters: Math.round(totalProduced * 100) / 100,
    remainingMeters: Math.round(remaining * 100) / 100,
    avgDailyOutput: avgDailyOutput !== null ? Math.round(avgDailyOutput) : null,
    remainingDays,
    hasData: true,
  })
}
