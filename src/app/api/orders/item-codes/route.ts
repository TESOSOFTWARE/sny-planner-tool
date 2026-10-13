import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { piPrefix, getCatalogItemCodesForPi, FINISHED_GOODS_ITEM_CODES, ItemCodeOption } from '@/lib/orders/itemCodeCatalog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    if (searchParams.has('code')) {
      const code = (searchParams.get('code') ?? '').trim()
      if (!code || code.length > 100) return NextResponse.json([])
      const catalogMatch = FINISHED_GOODS_ITEM_CODES.find(option => option.code.toUpperCase() === code.toUpperCase())
      if (catalogMatch) return NextResponse.json([catalogMatch])
      const orders = await prisma.productionOrder.findMany({
        where: { itemCode: { equals: code, mode: 'insensitive' } },
        select: { itemCode: true, piNumber: true, color: true, colorVersion: true, uvPct: true, meshType: true, mbCode: true, description: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      })
      const latest = orders[0]
      const options: ItemCodeOption[] = latest?.itemCode ? [{
        code: latest.itemCode.trim(),
        label: `${latest.piNumber} · ${latest.color || 'N/A'} · ${latest.description || latest.meshType || 'Lịch sử đơn'}`,
        prefix: piPrefix(latest.piNumber),
        colorName: latest.color || undefined,
        colorVersion: latest.colorVersion || 'STD',
        uvPct: latest.uvPct != null ? Number(latest.uvPct) : undefined,
        meshType: latest.meshType || undefined,
        mbCode: latest.mbCode || undefined,
      }] : []
      return NextResponse.json(options)
    }
    const pi = (searchParams.get('pi') ?? '').trim()
    const prefix = piPrefix(pi)

    // 1. Lấy danh mục 13 mã chuẩn lọc theo prefix (hoặc toàn bộ nếu chưa có PI)
    const catalogOptions = getCatalogItemCodesForPi(pi)

    // 2. Tra cứu lịch sử từ Database nếu có tiền tố PI
    const dbOptions: ItemCodeOption[] = []
    if (prefix) {
      const orders = await prisma.productionOrder.findMany({
        where: {
          itemCode: { not: null },
          piNumber: { startsWith: prefix, mode: 'insensitive' },
        },
        select: {
          itemCode: true,
          piNumber: true,
          color: true,
          colorVersion: true,
          uvPct: true,
          meshType: true,
          mbCode: true,
          description: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      })

      const seenInDb = new Set<string>()
      for (const o of orders) {
        const c = o.itemCode?.trim()
        if (c && !seenInDb.has(c)) {
          seenInDb.add(c)
          dbOptions.push({
            code: c,
            label: `${o.piNumber} · ${o.color || 'N/A'} · ${o.description || o.meshType || 'Lịch sử đơn'}`,
            prefix,
            colorName: o.color || undefined,
            colorVersion: o.colorVersion || 'STD',
            uvPct: o.uvPct != null ? Number(o.uvPct) : undefined,
            meshType: o.meshType || undefined,
            mbCode: o.mbCode || undefined,
          })
          if (dbOptions.length >= 50) break
        }
      }
    }

    // 3. Hợp nhất: DB lịch sử + catalog chuẩn, loại bỏ trùng mã
    const merged: ItemCodeOption[] = []
    const seen = new Set<string>()

    for (const opt of dbOptions) {
      if (!seen.has(opt.code)) {
        seen.add(opt.code)
        merged.push(opt)
      }
    }

    for (const opt of catalogOptions) {
      if (!seen.has(opt.code)) {
        seen.add(opt.code)
        merged.push(opt)
      }
    }

    return NextResponse.json(merged)
  } catch (error) {
    console.error('[API /api/orders/item-codes] Error:', error)
    return NextResponse.json([], { status: 500 })
  }
}
