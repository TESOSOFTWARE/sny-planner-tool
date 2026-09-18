import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { updateCustomerSchema } from '@/lib/validations/customer'
import { Prisma } from '@prisma/client'

interface RouteParams {
  params: { id: string }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const json = await request.json()
    const parsed = updateCustomerSchema.safeParse(json)
    
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dữ liệu không hợp lệ', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.name && { name: parsed.data.name }),
        ...(parsed.data.address !== undefined && { address: parsed.data.address || null }),
        ...(parsed.data.tel !== undefined && { tel: parsed.data.tel || null }),
        ...(parsed.data.fax !== undefined && { fax: parsed.data.fax || null }),
        ...(parsed.data.contact !== undefined && { contact: parsed.data.contact || null }),
        ...(parsed.data.country !== undefined && { country: parsed.data.country || null }),
        ...(parsed.data.note !== undefined && { note: parsed.data.note || null }),
      }
    })

    return NextResponse.json({ success: true, customer })
  } catch (error) {
    console.error('[PATCH /api/customers/[id]]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ success: false, error: 'Tên khách hàng đã tồn tại' }, { status: 400 })
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 })
      }
    }
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    // Check if customer has orders
    const count = await prisma.productionOrder.count({
      where: { customerId: params.id }
    })

    if (count > 0) {
      return NextResponse.json(
        { success: false, error: 'Không thể xóa khách hàng đang có đơn hàng liên kết' },
        { status: 400 }
      )
    }

    await prisma.customer.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/customers/[id]]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Không tìm thấy khách hàng' }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 })
  }
}
