import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const machines = await prisma.machineSpec.findMany({
      select: { machineId: true, widthM: true },
      orderBy: { machineId: 'asc' },
    })
    return NextResponse.json(machines)
  } catch {
    return NextResponse.json({ message: 'Không tải được khổ máy.' }, { status: 500 })
  }
}
