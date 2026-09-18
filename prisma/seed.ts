// prisma/seed.ts
// Seed 5 realistic SNY production orders.
// Uses upsert keyed on (piNumber, subLineIndex) so it's safe to run multiple times.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database with sample SNY production orders...')

  // PI-2024-001 — Single line order (polyester black, wide roll)
  await prisma.productionOrder.upsert({
    where: { piNumber_subLineIndex: { piNumber: 'PI-2024-001', subLineIndex: 0 } },
    update: {},
    create: {
      piNumber: 'PI-2024-001',
      subLineIndex: 0,
      customer: 'ADIDAS VIETNAM',
      orderDate: new Date('2024-03-10'),
      widthM: 4.0,
      lengthM: 12000,
      gsm: 165,
      color: 'BLACK',
      status: 'DONE',
    },
  })

  // PI-2024-002 — Two sub-lines: same PI, different fabric specs
  await prisma.productionOrder.upsert({
    where: { piNumber_subLineIndex: { piNumber: 'PI-2024-002', subLineIndex: 0 } },
    update: {},
    create: {
      piNumber: 'PI-2024-002',
      subLineIndex: 0,
      customer: 'NIKE TRADING (VIETNAM)',
      orderDate: new Date('2024-04-05'),
      widthM: 3.2,
      lengthM: 8500,
      gsm: 180,
      color: 'WHITE',
      status: 'IN_PRODUCTION',
    },
  })

  await prisma.productionOrder.upsert({
    where: { piNumber_subLineIndex: { piNumber: 'PI-2024-002', subLineIndex: 1 } },
    update: {},
    create: {
      piNumber: 'PI-2024-002',
      subLineIndex: 1,
      customer: 'NIKE TRADING (VIETNAM)',
      orderDate: new Date('2024-04-05'),
      widthM: 3.2,
      lengthM: 4200,
      gsm: 200,
      color: 'NAVY BLUE',
      status: 'PENDING',
    },
  })

  // PI-2024-003 — Standard order, medium width
  await prisma.productionOrder.upsert({
    where: { piNumber_subLineIndex: { piNumber: 'PI-2024-003', subLineIndex: 0 } },
    update: {},
    create: {
      piNumber: 'PI-2024-003',
      subLineIndex: 0,
      customer: 'PUMA SE GERMANY',
      orderDate: new Date('2024-05-20'),
      widthM: 4.5,
      lengthM: 15000,
      gsm: 140,
      color: 'RED',
      status: 'PENDING',
    },
  })

  // PI-2024-004 — Wide roll, high GSM
  await prisma.productionOrder.upsert({
    where: { piNumber_subLineIndex: { piNumber: 'PI-2024-004', subLineIndex: 0 } },
    update: {},
    create: {
      piNumber: 'PI-2024-004',
      subLineIndex: 0,
      customer: 'DECATHLON VIETNAM',
      orderDate: new Date('2024-06-01'),
      widthM: 4.2,
      lengthM: 9800,
      gsm: 195,
      color: 'GREY MELANGE',
      status: 'PENDING',
    },
  })

  console.log('✅ Seeding complete. 5 orders upserted (including 1 PI with 2 sub-lines).')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
