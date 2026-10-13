import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
const querySchema = z.object({
  field: z.enum(['color', 'meshType', 'description']),
  q: z.string().trim().max(200),
  // contains: khớp "chứa" + q trống trả top dùng nhiều (SuggestCombobox). Mặc định giữ hành vi cũ "bắt đầu bằng".
  match: z.enum(['prefix', 'contains']).default('prefix'),
})

const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => '\\' + c)

const SUGGESTION_LIMIT = 20

async function containsSuggestions(field: 'color' | 'meshType' | 'description', q: string): Promise<string[]> {
  // field đã qua z.enum nên ghép tên cột an toàn; q luôn là tham số.
  const col = Prisma.raw(`"${field}"`)
  const escaped = escapeLike(q)
  // Gộp biến thể (khoảng trắng đầu/cuối, hoa/thường) + ưu tiên khớp đầu + đếm tần suất đều TRƯỚC LIMIT,
  // để giá trị khớp đầu nhưng ít dùng không bị loại khi có nhiều nhóm (review Codex P-01, 13/10).
  const rows = await prisma.$queryRaw<{ value: string }[]>(Prisma.sql`
    WITH variants AS (
      SELECT btrim(${col}) AS value, count(*)::int AS n
      FROM production_orders
      WHERE ${col} IS NOT NULL AND btrim(${col}) <> ''
        AND (${q} = '' OR ${col} ILIKE ${`%${escaped}%`})
      GROUP BY btrim(${col})
    ), grouped AS (
      SELECT (array_agg(value ORDER BY n DESC, value ASC))[1] AS value, sum(n)::int AS total
      FROM variants
      GROUP BY upper(value)
    )
    SELECT value FROM grouped
    ORDER BY (${q} <> '' AND value ILIKE ${`${escaped}%`}) DESC, total DESC, value ASC
    LIMIT ${SUGGESTION_LIMIT}`)
  return rows.map(row => row.value)
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const parsed = querySchema.safeParse({ field: params.get('field'), q: params.get('q') ?? '', match: params.get('match') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: 'Trường gợi ý hoặc nội dung tìm kiếm không hợp lệ.' }, { status: 422 })
  const { field, q, match } = parsed.data
  if (match === 'contains') {
    try { return NextResponse.json(await containsSuggestions(field, q)) }
    catch { return NextResponse.json({ error: 'Không thể tải gợi ý đã dùng.' }, { status: 500 }) }
  }
  if (!q) return NextResponse.json([])
  try {
    const rows = await prisma.productionOrder.findMany({
      where: { [field]: { startsWith: q, mode: 'insensitive', not: null } },
      select: { color: field === 'color', meshType: field === 'meshType', description: field === 'description' },
      distinct: [field],
      orderBy: { [field]: 'asc' },
      take: 20,
    })
    const values = rows.map(row => row[field]).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    // distinct của Prisma phân biệt hoa/thường ("SHADE NET M+T" vs "Shade net M+T") → giữ bản gặp đầu
    const seen = new Set<string>()
    return NextResponse.json(values.filter(value => !seen.has(value.toUpperCase()) && seen.add(value.toUpperCase())).slice(0, 20))
  } catch {
    return NextResponse.json({ error: 'Không thể tải gợi ý đã dùng.' }, { status: 500 })
  }
}
