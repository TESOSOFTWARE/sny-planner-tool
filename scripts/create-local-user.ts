// [MoM 30/10 §4] Run: node --env-file=.env.local --import tsx scripts/create-local-user.ts
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55432' || target.pathname !== '/sny_planner_local') throw new Error('Chỉ tạo tài khoản trên sny_planner_local ở localhost:55432.')
  if (!stdin.isTTY) throw new Error('Chạy trong terminal tương tác để nhập mật khẩu ẩn.')
  const rl = createInterface({ input: stdin, output: stdout })
  const email = (await rl.question('Email: ')).trim().toLowerCase()
  rl.close()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Email không hợp lệ.')
  stdout.write('Mật khẩu (12–128 ký tự, nhập ẩn): ')
  const password = await new Promise<string>((resolve, reject) => {
    let value = ''
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    const read = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', read); stdout.write('\n')
          if (char === '\u0003') reject(new Error('Đã hủy.')); else resolve(value)
          return
        }
        if (char === '\u007f') value = value.slice(0, -1)
        else if (value.length < 129) value += char
      }
    }
    stdin.on('data', read)
  })
  if (password.length < 12 || password.length > 128) throw new Error('Mật khẩu phải từ 12 đến 128 ký tự.')
  const prisma = new PrismaClient()
  try {
    await prisma.snyUser.create({ data: { email, passwordHash: await hashPassword(password) } })
    console.log('Đã tạo tài khoản local. Đăng nhập bằng email vừa nhập.')
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error(error?.code === 'P2002' ? 'Email đã tồn tại.' : 'Không tạo được tài khoản: ' + error.message); process.exitCode = 1 })
