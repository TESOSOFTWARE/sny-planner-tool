'use server'

// src/app/schedule/actions.ts
// Server actions for the schedule page.
//
// After AssignModal Sub-line Detail sprint:
//   getUnassignedOrders now returns per-sub-line fields (widthM, gsm, color, meshType, lengthM, qty)
//   so AssignModal can show structured label and detail panel.

import { prisma } from '@/lib/db'

export async function getUnassignedOrders() {
  const orders = await prisma.productionOrder.findMany({
    where: {
      status: { not: 'DONE' },
    },
    select: {
      id: true,
      piNumber: true,
      subLineIndex: true,
      customer: true,
      isDraft: true,
      widthM: true,
      gsm: true,
      color: true,
      meshType: true,
      lengthM: true,
      qty: true,
    },
    // No Prisma orderBy — JS sort below handles numeric piNumber correctly
  })
  // Numeric-aware sort: KTQ26-2 < KTQ26-10 (not string order 1, 10, 2, 20)
  return orders.sort((a, b) =>
    a.piNumber.localeCompare(b.piNumber, undefined, { numeric: true }) ||
    a.subLineIndex - b.subLineIndex
  )
}
