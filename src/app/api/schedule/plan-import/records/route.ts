import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'
import type { StagePlanProfile } from '@/lib/excel/parseStagePlanWorkbook'

const profiles = ['extruder-machine', 'fiber-demand-matrix', 'warping-work-order', 'pallet-dated'] as const

export async function GET(request: NextRequest) {
  const denied = await authError('GET', request, 'output.read')
  if (denied) return denied
  const params = request.nextUrl.searchParams
  const stage = params.get('stage') ?? '', profile = params.get('profile') ?? '', scopeKey = params.get('scopeKey') ?? ''
  const rawPage = Number(params.get('page') ?? 1), rawLimit = Number(params.get('limit') ?? 100)
  const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1
  const limit = Number.isInteger(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 100
  const q = (params.get('q') ?? '').trim().slice(0, 150)
  if (!['extruder', 'warping', 'packing'].includes(stage) || !profiles.includes(profile as StagePlanProfile) || !scopeKey) return NextResponse.json({ success: false, error: 'Bộ lọc kế hoạch Excel chưa hợp lệ.' }, { status: 422 })
  const from = params.get('from') ? new Date(`${params.get('from')}T00:00:00.000Z`) : null
  const to = params.get('to') ? new Date(`${params.get('to')}T00:00:00.000Z`) : null
  if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime())) || (from && to && from > to)) return NextResponse.json({ success: false, error: 'Khoảng ngày kế hoạch không hợp lệ.' }, { status: 422 })
  try {
    const batches = await prisma.productionStagePlanImportBatch.findMany({
      where: { stage, profile, scopeKey, status: 'CONFIRMED' },
      orderBy: [{ confirmedAt: 'desc' }, { id: 'desc' }],
      include: { _count: { select: { rows: true } } },
    })
    if (!batches.length) return NextResponse.json({ success: true, batch: null, rows: [], total: 0, history: [] })
    const latest = batches[0]
    let latestSheetsByBatch = new Map<string, Set<string>>()
    if (profile === 'warping-work-order') {
      for (const item of batches) {
        const summary = item.summary && typeof item.summary === 'object' ? item.summary as Record<string, unknown> : {}
        const sourceSheets = Array.isArray(summary.sourceSheets) ? summary.sourceSheets.filter((name): name is string => typeof name === 'string') : []
        for (const sheet of sourceSheets) {
          if (Array.from(latestSheetsByBatch.values()).some(sheetNames => sheetNames.has(sheet))) continue
          const current = latestSheetsByBatch.get(item.id) ?? new Set<string>()
          current.add(sheet)
          latestSheetsByBatch.set(item.id, current)
        }
      }
    }
    const filters: Prisma.ProductionStagePlanImportRowWhereInput[] = []
    if (from && to) filters.push({ OR: [{ planDate: { gte: from, lt: new Date(to.getTime() + 86_400_000) } }, { planDate: null }] })
    if (q) filters.push({ OR: [{ orderRef: { contains: q, mode: 'insensitive' } }, { machineLabel: { contains: q, mode: 'insensitive' } }, { sourceSheet: { contains: q, mode: 'insensitive' } }] })
    const sourceScope: Prisma.ProductionStagePlanImportRowWhereInput = latestSheetsByBatch.size
      ? { OR: Array.from(latestSheetsByBatch, ([batchId, sourceSheets]) => ({ batchId, sourceSheet: { in: Array.from(sourceSheets) } })) }
      : { batchId: latest.id }
    const query: Prisma.ProductionStagePlanImportRowWhereInput = { ...sourceScope, ...(filters.length ? { AND: filters } : {}) }
    const [rows, total, history] = await Promise.all([
      prisma.productionStagePlanImportRow.findMany({ where: query, orderBy: [{ planDate: 'asc' }, { sourceSheet: 'asc' }, { sourceRow: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.productionStagePlanImportRow.count({ where: query }),
      Promise.resolve(batches.slice(0, 10)),
    ])
    return NextResponse.json({
      success: true,
      batch: { id: latest.id, stage: latest.stage, profile: latest.profile, scopeKey: latest.scopeKey, fileName: latest.fileName, summary: latest.summary, createdAt: latest.createdAt.toISOString(), confirmedAt: latest.confirmedAt.toISOString() },
      rows: rows.map(row => ({ ...row, planDate: row.planDate?.toISOString().slice(0, 10) ?? null, createdAt: row.createdAt.toISOString() })),
      total, page, limit,
      history: history.map(item => ({ id: item.id, fileName: item.fileName, createdAt: item.createdAt.toISOString(), rowCount: item._count.rows, summary: item.summary })),
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được kế hoạch Excel.' }, { status: 500 })
  }
}
