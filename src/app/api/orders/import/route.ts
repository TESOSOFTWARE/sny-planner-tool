// src/app/api/orders/import/route.ts
// POST /api/orders/import
// Accepts a multipart/form-data request with a .xlsx file (field name: "file").
// Parses the file with SheetJS and returns every parsed row for preview.
// Does NOT write anything to the database.

import { NextRequest, NextResponse } from 'next/server'
import { classifyOrderImport, parseOrderList } from '@/lib/excel/parseOrderList'
import { findCustomerMatch } from '@/lib/customers/matching'
import { prisma } from '@/lib/db'
import { MAX_IMPORTED_ORDER_ROWS } from '@/lib/validations/order'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

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

  if (rows.length > MAX_IMPORTED_ORDER_ROWS) {
    return NextResponse.json(
      {
        success: false,
        error: `File contains ${rows.length} rows. The maximum supported import is ${MAX_IMPORTED_ORDER_ROWS} rows.`,
      },
      { status: 422 },
    )
  }

  // ── 5. Classify against the current DB state (preview only) ───────────────
  const uniquePis = Array.from(new Set(
    rows
      .map((row) => row.piNumber.trim())
      .filter((pi) => pi && pi !== 'CHƯA_CÓ_PI'),
  ))
  let decisions
  try {
    const existingOrders = uniquePis.length > 0
      ? await prisma.productionOrder.findMany({
          where: { piNumber: { in: uniquePis, mode: 'insensitive' } },
        })
      : []
    decisions = classifyOrderImport(rows, existingOrders)
  } catch (err) {
    console.error('[POST /api/orders/import] DB classification error:', err)
    return NextResponse.json({ success: false, error: 'Không thể kiểm tra dữ liệu đơn hàng hiện tại.' }, { status: 500 })
  }

  const piWarnings = Array.from(new Set(
    decisions
      .filter((decision) => decision.status === 'conflict')
      .flatMap((decision) => decision.reasons.map((reason) => `⚠ Dòng ${decision.rowIndex + 1} (${decision.piNumber} / NO ${decision.subLineIndex}): ${reason}`)),
  ))

  // ── 5b. Classify customer names against existing customers (preview only) ──
  // Read-only: same matching engine as confirm, but surfaces NEEDS_REVIEW /
  // UNMATCHED to the planner BEFORE anything is written.
  const customerNames = Array.from(new Set(
    rows.map((row) => String(row.customer ?? '').trim()).filter(Boolean),
  ))
  let customerWarnings: string[] = []
  let customerReviews: { name: string; suggestedId: string; suggestedName: string; reason: string }[] = []
  let customerNew: string[] = []
  let customerAmbiguous: { name: string; reason: string }[] = []
  try {
    const allCustomers = await prisma.customer.findMany({ select: { id: true, name: true } })
    const seenReview = new Set<string>()
    const seenNew = new Set<string>()
    const seenAmbiguous = new Set<string>()
    for (const name of customerNames) {
      const match = findCustomerMatch(name, allCustomers)
      if (match.status === 'NEEDS_REVIEW' && match.suggested && !seenReview.has(name)) {
        seenReview.add(name)
        customerReviews.push({
          name,
          suggestedId: match.suggested.id,
          suggestedName: match.suggested.name,
          reason: match.reason ?? 'Tên gần giống khách hiện có — cần xác nhận gộp hay tạo mới',
        })
        customerWarnings.push(`⚠ Khách hàng "${name}" gần giống "${match.suggested.name}" — chọn gộp hay tạo mới ở cột Customer trước khi xác nhận.`)
      } else if (match.status === 'AMBIGUOUS' && !seenAmbiguous.has(name)) {
        // B1: surface AMBIGUOUS in preview. The engine never auto-picks when
        // several customers share one normalized name — same rule as confirm.
        seenAmbiguous.add(name)
        customerAmbiguous.push({
          name,
          reason: match.reason ?? `Tên khách hàng "${name}" trùng với nhiều bản ghi — cần dọn danh sách khách`,
        })
      } else if (match.status === 'UNMATCHED' && !seenNew.has(name)) {
        seenNew.add(name)
        customerNew.push(name)
      }
    }
    customerWarnings = Array.from(new Set(customerWarnings))
  } catch (err) {
    console.error('[POST /api/orders/import] customer classification error:', err)
    return NextResponse.json({ success: false, error: 'Không thể kiểm tra danh mục khách hàng hiện tại.' }, { status: 500 })
  }

  // B1: block AMBIGUOUS rows in preview exactly like confirm does.
  // No auto-pick, no silent drop — the planner sees them before confirming.
  if (customerAmbiguous.length > 0) {
    const blockedNames = new Set(customerAmbiguous.map((c) => c.name))
    decisions.forEach((decision, index) => {
      const key = String(rows[index].customer ?? '').trim()
      if (blockedNames.has(key) && decision.status !== 'invalid') {
        decision.status = 'conflict'
        decision.reasons.push('Tên khách hàng trùng với nhiều bản ghi trong hệ thống; không tự chọn bản ghi')
      }
    })
  }

  // ── 6. Return every parsed row and server decisions (no DB write) ─────────
  return NextResponse.json({
    success: true,
    totalParsed: rows.length,
    preview: rows,
    piWarnings,
    customerWarnings,
    customerReviews,
    customerNew,
    customerAmbiguous,
    decisions,
  })
}
