import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const toDelete = await prisma.productionOrder.findMany({
    where: {
      NOT: {
        orderDate: {
          gte: new Date('2026-07-01T00:00:00.000Z'),
          lte: new Date('2026-07-15T23:59:59.999Z')
        }
      }
    },
    select: { id: true }
  });
  const ids = toDelete.map(o => o.id);
  const delAssign = await prisma.machineAssignment.deleteMany({ where: { orderId: { in: ids } } });
  console.log('Deleted assignments:', delAssign.count);
  const delOrders = await prisma.productionOrder.deleteMany({ where: { id: { in: ids } } });
  console.log('Deleted orders:', delOrders.count);
  const remaining = await prisma.productionOrder.count();
  console.log('Orders còn lại:', remaining);
  await prisma.$disconnect();
}
main();
