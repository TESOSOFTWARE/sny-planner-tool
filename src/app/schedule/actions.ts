'use server'

// src/app/schedule/actions.ts
// Server actions for the schedule page.
//
// After AssignModal Sub-line Detail sprint:
//   getUnassignedOrders now returns per-sub-line fields (widthM, gsm, color, meshType, lengthM, qty)
//   so AssignModal can show structured label and detail panel.

import { prisma } from '@/lib/db'
import { scheduleOrderChoices } from '@/lib/orderStatus'

export async function getUnassignedOrders(includeFinished = false) {
  const orders = await prisma.productionOrder.findMany({
    select: {
      id: true,
      piNumber: true,
      subLineIndex: true,
      customer: true,
      isDraft: true,
      lifecycleStatus: true,
      isPlaceholder: true,
      widthM: true,
      gsm: true,
      color: true,
      meshType: true,
      lengthM: true,
      qty: true,
      assignments: { select: { startDate: true, endDate: true } },
    },
    // No Prisma orderBy — JS sort below handles numeric piNumber correctly
  })
  // Numeric-aware sort: KTQ26-2 < KTQ26-10 (not string order 1, 10, 2, 20)
  const sorted = orders.sort((a, b) =>
    a.piNumber.localeCompare(b.piNumber, undefined, { numeric: true }) ||
    a.subLineIndex - b.subLineIndex
  )
  return scheduleOrderChoices(sorted, includeFinished)
}
