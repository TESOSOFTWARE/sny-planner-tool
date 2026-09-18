// scripts/clear-extruder.ts
// Clear all ExtruderDailyOutput records from DB.

import { prisma } from '../src/lib/db'

async function main() {
  const deleted = await prisma.extruderDailyOutput.deleteMany({})
  console.log(`[clear-extruder] Deleted ${deleted.count} old Extruder records from DB.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
