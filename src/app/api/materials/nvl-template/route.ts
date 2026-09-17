import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'templates', 'nvl-template.xlsx')

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Template file not found.' },
        { status: 404 },
      )
    }

    const fileBuffer = fs.readFileSync(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Template_NVL.xlsx"',
      },
    })
  } catch (error) {
    console.error('[GET /api/materials/nvl-template]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to serve template file.' },
      { status: 500 },
    )
  }
}
