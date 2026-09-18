import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const isRun = args.includes('--run')

  if (!isDryRun && !isRun) {
    console.log('Vui lòng chỉ định --dry-run hoặc --run')
    process.exit(1)
  }

  console.log(`Bắt đầu chạy seed khách hàng (Chế độ: ${isDryRun ? 'DRY RUN' : 'RUN'})`)

  // 1. Lấy danh sách tên khách hàng độc nhất từ đơn hàng hiện tại
  const uniqueCustomers = await prisma.productionOrder.findMany({
    select: { customer: true },
    distinct: ['customer']
  })

  const customerNames = uniqueCustomers.map(c => c.customer).filter(Boolean)

  if (customerNames.length === 0) {
    console.log('Không có khách hàng nào trong DB đơn hàng.')
    return
  }

  console.log(`Tìm thấy ${customerNames.length} khách hàng độc nhất:`)
  customerNames.forEach(name => console.log(`- ${name}`))

  if (isDryRun) {
    console.log('\n[DRY RUN] Bỏ qua bước tạo khách hàng và cập nhật đơn hàng.')
    return
  }

  // 2. Tạo hoặc tìm khách hàng
  console.log('\nBắt đầu cập nhật...')
  
  let createdCount = 0
  for (const name of customerNames) {
    const trimmed = name.trim()
    let customer = await prisma.customer.findUnique({
      where: { name: trimmed }
    })

    if (!customer) {
      customer = await prisma.customer.create({
        data: { name: trimmed }
      })
      createdCount++
      console.log(`[+] Đã tạo mới: ${trimmed}`)
    } else {
      console.log(`[=] Đã tồn tại: ${trimmed}`)
    }

    // 3. Cập nhật các đơn hàng chưa có customerId
    const updateRes = await prisma.productionOrder.updateMany({
      where: { 
        customer: name,
        customerId: null
      },
      data: {
        customerId: customer.id
      }
    })
    
    if (updateRes.count > 0) {
      console.log(`    -> Cập nhật ${updateRes.count} dòng có tên '${name}'`)
    }
  }

  console.log(`\nHoàn thành! Đã tạo mới ${createdCount} khách hàng.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
