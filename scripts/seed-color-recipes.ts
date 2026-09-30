// scripts/seed-color-recipes.ts
// Seeds official ProductColorRecipe data for Desert Sand A/B, Dark Green, and Black.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🎨 Seeding product color recipes...')

  const recipes = [
    {
      colorName: 'DESERT SAND',
      colorVersion: 'Version A',
      standardGsm: 240,
      firstBarSpec: 'MF 0.22mm UV 4%',
      middleBarSpec: 'MF 0.22mm UV 4%',
      backBarSpecs: 'BEIGE (DARK BEIGE 3160-2 KOREA)',
      mbRate: 3.0,
      notes: 'Công thức xuất Ả Rập #467 (Bản A - Hạt màu Hàn Quốc theo WI ALTAJ26-4)',
    },
    {
      colorName: 'DESERT SAND',
      colorVersion: 'Version B',
      standardGsm: 240,
      firstBarSpec: 'MF 0.22mm UV 4%',
      middleBarSpec: 'MF 0.22mm UV 4%',
      backBarSpecs: 'BEIGE 8005A (MB ARIRANG)',
      mbRate: 3.0,
      notes: 'Công thức xuất Ả Rập #467 (Bản B - Hạt màu Arirang theo Handover xưởng)',
    },
    {
      colorName: 'DARK GREEN',
      colorVersion: 'STD',
      standardGsm: 180,
      firstBarSpec: 'MF 0.25mm UV 2%',
      middleBarSpec: 'MF 0.25mm UV 2%',
      backBarSpecs: 'GREEN G024 UV 2%',
      mbRate: 2.0,
      notes: 'Lưới xuất EU chống cháy',
    },
    {
      colorName: 'BLACK',
      colorVersion: 'STD',
      standardGsm: 95,
      firstBarSpec: 'MF 0.22mm UV 2%',
      middleBarSpec: 'MF 0.22mm UV 2%',
      backBarSpecs: 'BLACK B045 UV 2%',
      mbRate: 2.0,
      notes: 'Tiêu chuẩn lưới che xây dựng Black Debris',
    },
  ]

  for (const r of recipes) {
    const upserted = await prisma.productColorRecipe.upsert({
      where: {
        colorName_colorVersion: {
          colorName: r.colorName,
          colorVersion: r.colorVersion,
        },
      },
      update: r,
      create: r,
    })
    console.log(`✅ Upserted recipe: ${upserted.colorName} [${upserted.colorVersion}]`)
  }

  console.log('🎉 Seed color recipes completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding color recipes:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
