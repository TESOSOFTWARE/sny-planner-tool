const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.machineAssignment.findMany({
    include: { order: true }
  });

  let foundOverlap = false;

  for (const a of assignments) {
    const outputs = await prisma.knittingDailyOutput.findMany({
      where: {
        machineId: a.machineId,
        reportDate: {
          gte: a.startDate,
          lte: a.endDate,
        }
      }
    });

    if (outputs.length > 0) {
      console.log(`Match found for order ${a.order.piNumber} on machine ${a.machineId}`);
      console.log(`Assignment dates: ${a.startDate} to ${a.endDate}`);
      console.log(`Found ${outputs.length} knitting records. Samples:`, outputs.slice(0,2));
      foundOverlap = true;
    }
  }

  if (!foundOverlap) {
    console.log("NO OVERLAP FOUND between MachineAssignment dates and KnittingDailyOutput reportDates on any machine.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
