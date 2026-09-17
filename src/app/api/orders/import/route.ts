// src/app/api/orders/import/route.ts
// POST /api/orders/import
// Accepts a multipart/form-data request with a .xlsx file (field name: "file").
// Parses the file with SheetJS and returns the first 20 valid rows as a preview.
// Does NOT write anything to the database.

import { NextRequest, NextResponse } from 'next/server'
import { parseOrderList } from '@/lib/excel/parseOrderList'
import { prisma } from '@/lib/db'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const PREVIEW_LIMIT = 20

export async function POST(req: NextRequest) {
  // ── 1. Read multipart form data ───────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Could not read form data. Ensure the request is multipart/form-data.' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: 'No file uploaded. Send the file in the "file" field.' },
      { status: 400 },
    )
  }

  // ── 2. Validate file type ─────────────────────────────────────────────────
  const fileName = file instanceof File ? file.name : 'upload'
  if (!fileName.toLowerCase().endsWith('.xlsx')) {
    return NextResponse.json(
      { success: false, error: 'Only .xlsx files are accepted. Please export your file as Excel (.xlsx).' },
      { status: 422 },
    )
  }

  // ── 3. Validate file size ─────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: `File must be ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB or smaller.` },
      { status: 422 },
    )
  }

  // ── 4. Parse with SheetJS ─────────────────────────────────────────────────
  let rows
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    rows = parseOrderList(buffer)
  } catch (err) {
    console.error('[POST /api/orders/import] Parse error:', err)
    return NextResponse.json(
      {
        success: false,
        error:
          'Could not parse the Excel file. Make sure it is a valid ORDER_LIST .xlsx file.',
      },
      { status: 422 },
    )
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No valid data rows found in the file. Check the file format and try again.',
      },
      { status: 422 },
    )
  }

  // ── 5. Check PI Number customer conflicts & Duplicate subLineIndex ────────
  const piWarnings: string[] = []

  // Check 5a: Duplicate (piNumber, subLineIndex) in uploaded rows
  const seenKeys = new Set<string>()
  let duplicateCount = 0
  for (const r of rows) {
    if (r.piNumber) {
      const key = `${r.piNumber.trim().toUpperCase()}#${r.subLineIndex}`
      if (seenKeys.has(key)) {
        duplicateCount++
      } else {
        seenKeys.add(key)
      }
    }
  }

  if (duplicateCount > 0) {
    piWarnings.push(
      `⚠ Phát hiện ${duplicateCount} dòng trùng số thứ tự (subLineIndex), có thể bị bỏ qua khi import.`
    )
  }

  // Check 5b: Customer name mismatch for existing PIs
  const piCustomerMap = new Map<string, string>()
  for (const r of rows) {
    if (r.piNumber && r.customer) {
      piCustomerMap.set(r.piNumber.trim().toUpperCase(), r.customer.trim())
    }
  }

  const uniquePis = Array.from(piCustomerMap.keys())
  if (uniquePis.length > 0) {
    const existingOrders = await prisma.productionOrder.findMany({
      where: {
        piNumber: { in: uniquePis, mode: 'insensitive' },
      },
      select: { piNumber: true, customer: true },
    })

    const existingPiMap = new Map<string, Set<string>>()
    for (const o of existingOrders) {
      const key = o.piNumber.trim().toUpperCase()
      const set = existingPiMap.get(key) ?? new Set()
      if (o.customer) set.add(o.customer.trim())
      existingPiMap.set(key, set)
    }

    for (const [piUpper, fileCustomer] of Array.from(piCustomerMap.entries())) {
      const dbCustomers = existingPiMap.get(piUpper)
      if (dbCustomers && dbCustomers.size > 0) {
        const dbCust = Array.from(dbCustomers)[0]
        if (dbCust.toLowerCase() !== fileCustomer.toLowerCase()) {
          piWarnings.push(
            `⚠ PI Number [${piUpper}] đã tồn tại với khách hàng [${dbCust}] — file Excel đang nhập cho khách hàng [${fileCustomer}].`
          )
        }
      }
    }
  }

  // ── 6. Return first PREVIEW_LIMIT rows (no DB write) ─────────────────────
  const preview = rows.slice(0, PREVIEW_LIMIT)

  return NextResponse.json({
    success: true,
    totalParsed: rows.length,
    preview,
    piWarnings,
  })
}
