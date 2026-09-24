import { PrismaClient } from '@prisma/client'
import { findCustomerMatch } from '../src/lib/customers/matching'

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

  const customerNames = Array.from(
    new Map(
      uniqueCustomers
        .map(c => c.customer?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => [name.toUpperCase(), name]),
    ).values(),
  )

  if (customerNames.length === 0) {
    console.log('Không có khách hàng nào trong DB đơn hàng.')
    return
  }

  console.log(`Tìm thấy ${customerNames.length} khách hàng độc nhất (không phân biệt hoa thường):`)
  customerNames.forEach(name => console.log(`- ${name}`))

  // 2. Tạo hoặc tìm khách hàng bằng matching module an toàn
  console.log('\nBắt đầu cập nhật...')
  
  const allExistingCustomers = await prisma.customer.findMany()

  let createdCount = 0
  let linkedCount = 0
  for (const name of customerNames) {
    const trimmed = name.trim()
    const match = findCustomerMatch(trimmed, allExistingCustomers)

    let customer: { id: string; name: string } | null = null

    if (match.status === 'MATCHED') {
      customer = match.customer
    } else if (match.status === 'AMBIGUOUS') {
      console.warn(`[!] Trùng tên mơ hồ (${trimmed}): ${match.reason} -> Bỏ qua, yêu cầu xử lý thủ công!`)
      continue
    }

    const unlinkedWhere = {
      customer: { equals: trimmed, mode: 'insensitive' as const },
      customerId: null,
    }
    const unlinkedCount = await prisma.productionOrder.count({ where: unlinkedWhere })

    if (isDryRun) {
      console.log(customer
        ? `[=] ${trimmed} → đã có khách hàng ${customer.name}; ${unlinkedCount} dòng sẽ được nối`
        : `[+] ${trimmed} → sẽ tạo khách hàng mới; ${unlinkedCount} dòng sẽ được nối`)
      continue
    }

    const linkedCustomer = customer ?? await prisma.customer.create({
      data: { name: trimmed },
    })
    if (!customer) {
      createdCount++
      console.log(`[+] Đã tạo mới: ${trimmed}`)
    } else {
      console.log(`[=] Đã tồn tại: ${trimmed}`)
    }

    // 3. Cập nhật các đơn hàng chưa có customerId, không phân biệt hoa thường
    const updateRes = await prisma.productionOrder.updateMany({
      where: unlinkedWhere,
      data: { customerId: linkedCustomer.id },
    })

    linkedCount += updateRes.count
    if (updateRes.count > 0) {
      console.log(`    -> Cập nhật ${updateRes.count} dòng có tên '${name}'`)
    }
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] Không tạo khách hàng và không cập nhật đơn hàng.')
  } else {
    console.log(`\nHoàn thành! Đã tạo mới ${createdCount} khách hàng, nối ${linkedCount} dòng đơn hàng.`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
