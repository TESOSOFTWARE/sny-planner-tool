import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tx = await prisma.materialTransaction.deleteMany({});
  console.log('Deleted transactions:', tx.count);
  const mt = await prisma.material.deleteMany({});
  console.log('Deleted materials:', mt.count);
  await prisma.$disconnect();
}
main();
