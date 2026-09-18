const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.knittingDailyOutput.count();
  console.log(`KnittingDailyOutput records: ${count}`);

  if (count > 0) {
    const sample = await prisma.knittingDailyOutput.findFirst();
    console.log('Sample KnittingDailyOutput:', sample);
  }

  const assignmentCount = await prisma.machineAssignment.count();
  console.log(`MachineAssignment records: ${assignmentCount}`);

  if (assignmentCount > 0) {
      const sampleAssign = await prisma.machineAssignment.findFirst({
          include: { order: true }
      });
      console.log('Sample MachineAssignment:', sampleAssign);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
