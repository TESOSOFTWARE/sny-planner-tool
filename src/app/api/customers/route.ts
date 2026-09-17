import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { customerSchema } from '@/lib/validations/customer'
import { Prisma } from '@prisma/client'

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { orders: true }
        }
      }
    })
    return NextResponse.json(customers)
  } catch (error) {
    console.error('[GET /api/customers]', error)
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json()
    const parsed = customerSchema.safeParse(json)
    
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Dữ liệu không hợp lệ', details: parsed.error.format() },
        { status: 400 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address || null,
        tel: parsed.data.tel || null,
        fax: parsed.data.fax || null,
        contact: parsed.data.contact || null,
        country: parsed.data.country || null,
        note: parsed.data.note || null,
      }
    })

    return NextResponse.json({ success: true, customer }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/customers]', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'Tên khách hàng đã tồn tại' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 })
  }
}
