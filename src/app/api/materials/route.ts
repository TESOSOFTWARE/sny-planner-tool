// src/app/api/materials/route.ts
// GET /api/materials  — return all materials ordered by name
// POST /api/materials — create a new material

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { materialTaxonomyShape, taxonomyMatchesGroup } from '@/lib/materials/taxonomy'
import { baseMaterialSelect, validReportDate } from '@/lib/materials/historyImport'

// ── Zod schema for POST body ──────────────────────────────────────────────────

const createMaterialSchema = z.object({
  ...materialTaxonomyShape,
  name: z
    .string()
    .min(1, 'Tên nguyên liệu là bắt buộc')
    .max(100, 'Tên nguyên liệu tối đa 100 ký tự')
    .transform((v) => v.trim()),

  currentStock: z
    .number({ message: 'Tồn kho phải là số' })
    .min(0, 'Tồn kho không được âm'),

  minThreshold: z
    .number({ message: 'Ngưỡng tối thiểu phải là số' })
    .min(0, 'Ngưỡng tối thiểu không được âm')
    .nullable()
    .optional(),

  unit: z.string().default('kg'),
  
  group: z.enum(['HDPE', 'MB', 'KOREA']).default('KOREA'),
  color: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),

  note: z
    .string()
    .max(200, 'Ghi chú tối đa 200 ký tự')
    .transform((v) => v.trim())
    .nullable()
    .optional(),
})

// ── GET ───────────────────────────────────────────────────────────────────────

// [MoM §3.1] All displayed snapshots use one selected source date.
export async function GET(req: NextRequest) {
  try {
    const requested=req.nextUrl.searchParams.get('reportDate')
    if(requested && !validReportDate(requested)) return NextResponse.json({success:false,error:'Ngày báo cáo không hợp lệ.'},{status:422})
    const hdpe=req.nextUrl.searchParams.get('reportGroup')==='HDPE'
    const dates=await prisma.materialReportSnapshot.findMany({
      where:hdpe?{material:{group:{in:['HDPE','MB']}}}:{},
      select:{reportDate:true},distinct:['reportDate'],orderBy:{reportDate:'desc'},
    })
    const reportDates=dates.map(s=>s.reportDate.toISOString().slice(0,10))
    const reportDate=requested ?? reportDates[0] ?? null
    if(requested && !reportDates.includes(requested)) reportDates.unshift(requested)
    const materials=await prisma.material.findMany({orderBy:{name:'asc'},select:{...baseMaterialSelect,
      reportSnapshots:{where:reportDate?{reportDate:new Date(`${reportDate}T00:00:00Z`)}:{id:'__no_selected_report__'},take:1},
    }})
    let taxonomy: Array<{id:string;subGroup:string|null;lightFastness:string|null}>=[]
    try {
      taxonomy=await prisma.material.findMany({select:{id:true,subGroup:true,lightFastness:true}})
    } catch(error) {
      const detail=error && typeof error==='object' ? error as {code?:unknown;meta?:{column?:unknown}} : null
      const column=String(detail?.meta?.column ?? '').replace(/"/g,'')
      if(detail?.code!=='P2022' || !['subGroup','lightFastness'].includes(column.split('.').pop() ?? '')) throw error
    }
    const taxonomyById=new Map(taxonomy.map(m=>[m.id,m]))
    const serialized=materials.map(({reportSnapshots,...m})=>{
      const snapshot=reportSnapshots[0]
      const payload=snapshot?.payload && typeof snapshot.payload==='object' && !Array.isArray(snapshot.payload)?snapshot.payload as Record<string,unknown>:{}
      const sourceString=(key:string)=>typeof payload[key]==='string'?payload[key] as string:null
      return {...m,currentStock:m.currentStock.toString(),minThreshold:m.minThreshold?.toString() ?? null,
        createdAt:m.createdAt.toISOString(),updatedAt:m.updatedAt.toISOString(),stockReportDate:m.stockReportDate?.toISOString().slice(0,10) ?? null,
        subGroup:taxonomyById.has(m.id) ? taxonomyById.get(m.id)!.subGroup : sourceString('subGroup'),lightFastness:taxonomyById.has(m.id) ? taxonomyById.get(m.id)!.lightFastness : sourceString('lightFastness'),
        color:m.color ?? sourceString('color'),brand:m.brand ?? sourceString('brand'),
        latestReport:snapshot?{reportDate:snapshot.reportDate.toISOString().slice(0,10),payload:snapshot.payload}:null,
      }
    })
    return NextResponse.json({success:true,materials:serialized,reportDate,reportDates})
  }catch(err){
    console.error('[GET /api/materials] Error:',err)
    return NextResponse.json({success:false,error:'Không thể tải danh sách nguyên liệu.'},{status:500})
  }
}
// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  const parsed = createMaterialSchema.safeParse(body)
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((e) => `${String(e.path.join('.'))}: ${e.message}`)
      .join('; ')
    return NextResponse.json(
      { success: false, error: `Validation failed — ${messages}` },
      { status: 422 },
    )
  }

  const data = parsed.data
  if (!taxonomyMatchesGroup(data.group, data)) return NextResponse.json({ success: false, error: 'Phân loại nhựa chỉ dùng cho HDPE; độ bền màu chỉ dùng cho MB.' }, { status: 422 })

  try {
    const material = await prisma.material.create({
      data: {
        name: data.name,
        group: data.group,
        color: data.color || null,
        brand: data.brand || null,
        ...(data.subGroup !== undefined ? { subGroup: data.subGroup } : {}),
        ...(data.lightFastness !== undefined ? { lightFastness: data.lightFastness } : {}),
        currentStock: data.currentStock,
        minThreshold: data.minThreshold,
        unit: data.unit,
        note: data.note || null,
      },
    })

    const serialized = {
      ...material,
      currentStock: material.currentStock.toString(),
      minThreshold: material.minThreshold?.toString() ?? null,
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString(),
    }

    return NextResponse.json({ success: true, material: serialized }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/materials] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Không thể tạo nguyên liệu.' },
      { status: 500 },
    )
  }
}
