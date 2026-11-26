import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import type { StagePlanProfile } from '@/lib/excel/parseStagePlanWorkbook'

const stageProfiles: Record<string, StagePlanProfile[]> = {
  extruder: ['extruder-machine', 'fiber-demand-matrix'],
  warping: ['warping-work-order'],
  knitting: [],
  rolling: [],
  packing: ['pallet-dated'],
}

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const stage = request.nextUrl.searchParams.get('stage') ?? ''
  const profiles = stageProfiles[stage]
  if (!profiles) return NextResponse.json({ success: false, error: 'Công đoạn không hợp lệ.' }, { status: 422 })

  try {
    const available = await Promise.all(profiles.map(profile => prisma.productionStagePlanImportBatch.findFirst({
      where: { stage, profile, status: 'CONFIRMED' },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      select: { profile: true, scopeKey: true, fileName: true, confirmedAt: true },
    })))
    return NextResponse.json({
      success: true,
      profiles: available.filter((item): item is NonNullable<typeof item> => item !== null).sort((left, right) => right.confirmedAt.getTime() - left.confirmedAt.getTime()).map(item => ({
        profile: item.profile,
        scopeKey: item.scopeKey,
        fileName: item.fileName,
        confirmedAt: item.confirmedAt.toISOString(),
      })),
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được danh sách kế hoạch đã nhập.' }, { status: 500 })
  }
}
