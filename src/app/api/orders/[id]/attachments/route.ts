import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

const MAX_BYTES = 5 * 1024 * 1024
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

function matchesSignature(type: string, bytes: Uint8Array) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') return bytes.subarray(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  if (type === 'image/webp') return bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80
  if (type === 'application/pdf') return new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-'
  return false
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('GET', request, 'orders.read')
  if (denied) return denied
  try {
    const files = await prisma.productionOrderAttachment.findMany({ where: { orderId: params.id }, orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true } })
    return NextResponse.json({ success: true, files })
  } catch {
    return NextResponse.json({ success: false, error: 'Không tải được danh sách tệp đính kèm.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await authError('POST', request, 'orders.update')
  if (denied) return denied
  try {
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Vui lòng chọn một tệp.' }, { status: 422 })
    if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ success: false, error: 'Tệp phải có dung lượng từ 1 byte đến 5 MB.' }, { status: 422 })
    if (!MIME_TYPES.has(file.type)) return NextResponse.json({ success: false, error: 'Chỉ nhận ảnh JPEG, PNG, WebP hoặc PDF.' }, { status: 415 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!matchesSignature(file.type, bytes)) return NextResponse.json({ success: false, error: 'Nội dung tệp không khớp định dạng đã chọn.' }, { status: 415 })
    const order = await prisma.productionOrder.findUnique({ where: { id: params.id }, select: { id: true } })
    if (!order) return NextResponse.json({ success: false, error: 'Không tìm thấy dòng đơn.' }, { status: 404 })
    const fileName = file.name.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 180) || 'attachment'
    const saved = await prisma.productionOrderAttachment.create({ data: { orderId: order.id, fileName, mimeType: file.type, fileSize: bytes.byteLength, content: Buffer.from(bytes) } })
    return NextResponse.json({ success: true, id: saved.id }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Không lưu được tệp đính kèm.' }, { status: 500 })
  }
}
