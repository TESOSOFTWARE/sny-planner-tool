import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { authError } from '@/lib/auth/session'

type Params = { params: { id: string; attachmentId: string } }

export async function GET(request: NextRequest, { params }: Params) {
  const denied = await authError('GET', request, 'orders.read')
  if (denied) return denied
  try {
    const file = await prisma.productionOrderAttachment.findFirst({ where: { id: params.attachmentId, orderId: params.id }, select: { fileName: true, mimeType: true, content: true } })
    if (!file) return NextResponse.json({ success: false, error: 'Không tìm thấy tệp.' }, { status: 404 })
    const safeName = file.fileName.replace(/["\r\n]/g, '_')
    const body = new Uint8Array(file.content)
    return new NextResponse(body.buffer as ArrayBuffer, { headers: { 'content-type': file.mimeType, 'content-disposition': `inline; filename="${safeName}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ success: false, error: 'Không đọc được tệp đính kèm.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const denied = await authError('DELETE', request, 'orders.update')
  if (denied) return denied
  try {
    const result = await prisma.productionOrderAttachment.deleteMany({ where: { id: params.attachmentId, orderId: params.id } })
    return result.count ? NextResponse.json({ success: true }) : NextResponse.json({ success: false, error: 'Không tìm thấy tệp.' }, { status: 404 })
  } catch {
    return NextResponse.json({ success: false, error: 'Không xóa được tệp đính kèm.' }, { status: 500 })
  }
}
