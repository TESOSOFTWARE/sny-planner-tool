// src/app/api/materials/import-transactions/route.ts
// POST /api/materials/import-transactions
// Accepts .xlsx upload, parses with parseMaterialReport, matches materials, returns preview.
// Does NOT write to DB — preview only.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseMaterialReport, type ParsedMaterialRow } from '@/lib/excel/parseMaterialReport'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export interface PreviewRow extends ParsedMaterialRow {
  matchedMaterialId: string | null
  matchedMaterialName: string | null
  isNew: boolean
}

export async function POST(req: NextRequest) {
  // ── 1. Parse multipart ─────────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Không đọc được form data.' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: 'Chưa tải file lên. Gửi file trong field "file".' },
      { status: 400 },
    )
  }

  const groupStr = formData.get('group')
  const group = (groupStr === 'HDPE' || groupStr === 'MB' || groupStr === 'KOREA') ? groupStr : 'HDPE'

  const fileName = file instanceof File ? file.name : 'upload'
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json(
      { success: false, error: 'Chỉ chấp nhận file .xlsx.' },
      { status: 422 },
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { success: false, error: 'File phải nhỏ hơn 10 MB.' },
      { status: 422 },
    )
  }

  // ── 2. Parse Excel ─────────────────────────────────────────────────────────
  let parsed: ParsedMaterialRow[]
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    parsed = parseMaterialReport(buf, group)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Lỗi đọc file Excel.'
    return NextResponse.json({ success: false, error: msg }, { status: 422 })
  }

  if (parsed.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Không tìm thấy dòng dữ liệu nào trong file.' },
      { status: 422 },
    )
  }

  // ── 3. Find matching materials in DB (only for this group) ───────────────
  const dbMaterials = await prisma.material.findMany({
    where: { group },
    select: { id: true, name: true, color: true, brand: true },
  })

  // Basic normalization for matching
  const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ')

  const previewRows: PreviewRow[] = parsed.map((p) => {
    let matchedId = null
    let matchedName = null

    // For MB, we might want to check name, color and brand? 
    // The parser returns materialName. We just match the DB name.
    const pName = norm(p.materialName)
    const match = dbMaterials.find((db) => norm(db.name) === pName)
    
    if (match) {
      matchedId = match.id
      matchedName = match.name
    }

    return {
      ...p,
      matchedMaterialId: matchedId,
      matchedMaterialName: matchedName,
      isNew: !matchedId,
    }
  })

  const matched   = previewRows.filter((r) => !r.isNew).length
  const unmatched = previewRows.filter((r) => r.isNew).length

  return NextResponse.json({
    success: true,
    rows: previewRows,
    parsed: previewRows.length,
    matched,
    unmatched,
  })
}
