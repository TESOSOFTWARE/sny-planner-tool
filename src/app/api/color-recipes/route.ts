// src/app/api/color-recipes/route.ts
// GET /api/color-recipes
// Returns list of color recipes (Desert Sand A/B, etc.) to auto-populate bar specs on UI/WI.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const colorName = searchParams.get('colorName')

    const where: any = {}
    if (colorName) {
      where.colorName = { equals: colorName.trim().toUpperCase(), mode: 'insensitive' }
    }

    const recipes = await prisma.productColorRecipe.findMany({
      where,
      orderBy: [{ colorName: 'asc' }, { colorVersion: 'asc' }],
    })

    return NextResponse.json({
      success: true,
      count: recipes.length,
      recipes,
    })
  } catch (err) {
    console.error('[GET /api/color-recipes] Error:', err)
    return NextResponse.json({ success: false, error: 'Lỗi máy chủ khi tải công thức màu.' }, { status: 500 })
  }
}
