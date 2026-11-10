// One-time production Admin bootstrap. Requires the approved release migration first.
// Run only from an approved environment with a verified PostgreSQL 18 backup.
// Example: node --env-file=.env --import tsx scripts/bootstrap-production-admin.ts admin@example.com
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { PERMISSIONS } from '../src/lib/auth/permissions'
import { hashPassword } from '../src/lib/auth/password'

const prisma = new PrismaClient()

function assertApprovedTarget() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  const expectedHost = process.env.SNY_PRODUCTION_DATABASE_HOST?.trim().toLowerCase()
  const expectedDatabase = process.env.SNY_PRODUCTION_DATABASE_NAME?.trim()
  if (!expectedHost || url.hostname.toLowerCase() !== expectedHost || !expectedHost.endsWith('.neon.tech') || ['localhost', '127.0.0.1'].includes(expectedHost)) {
    throw new Error('Refusing bootstrap: DATABASE_URL host must exactly match the approved SNY_PRODUCTION_DATABASE_HOST.')
  }
  if (!expectedDatabase || decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase) {
    throw new Error('Refusing bootstrap: set SNY_PRODUCTION_DATABASE_NAME to the approved production DB name.')
  }
  if (process.env.SNY_PRODUCTION_CHANGE_APPROVED !== 'YES') {
    throw new Error('Refusing bootstrap: SNY_PRODUCTION_CHANGE_APPROVED=YES is required after lead approval.')
  }
  if (!process.env.SNY_PRODUCTION_BACKUP_REF?.trim()) {
    throw new Error('Refusing bootstrap: provide SNY_PRODUCTION_BACKUP_REF for the verified PostgreSQL 18 backup.')
  }
  return { host: url.hostname, database: expectedDatabase }
}

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY) throw new Error('Run in an interactive terminal so the temporary password is not echoed.')
  stdout.write(prompt)
  return new Promise((resolve, reject) => {
    let value = ''
    const read = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0003') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', read)
          stdout.write('\n')
          if (char === '\u0003') reject(new Error('Cancelled.'))
          else resolve(value)
          return
        }
        if (char === '\u007f') value = value.slice(0, -1)
        else if (value.length < 129) value += char
      }
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.on('data', read)
  })
}

async function main() {
  const target = assertApprovedTarget()
  const email = process.argv[2]?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Pass the customer-approved Admin email as the first argument.')
  }
  if (!stdin.isTTY) throw new Error('Run in an interactive terminal to enter the temporary password securely.')

  const actual = await prisma.$queryRaw<Array<{ database: string; version: string }>>`
    SELECT current_database() AS database, current_setting('server_version') AS version
  `
  if (actual[0]?.database !== target.database || !actual[0]?.version.startsWith('18.')) {
    throw new Error('Connected database identity/version does not match the approved production target (PostgreSQL 18).')
  }

  const [existingUser, adminRole, permissions] = await Promise.all([
    prisma.snyUser.findUnique({ where: { email }, select: { id: true } }),
    prisma.snyRole.findUnique({ where: { name: 'Admin' }, select: { id: true, isSystem: true } }),
    prisma.snyPermission.findMany({ select: { key: true } }),
  ])
  if (existingUser) throw new Error('Account email already exists; refusing to reset or reuse an existing account.')
  if (!adminRole?.isSystem) throw new Error('System Admin role is missing; apply the approved migration first.')
  const permissionKeys = new Set(permissions.map(permission => permission.key))
  if (PERMISSIONS.some(permission => !permissionKeys.has(permission))) throw new Error('Permission catalog is incomplete; stop before creating an Admin account.')
  const assignedPermissions = await prisma.snyRolePermission.count({ where: { roleId: adminRole.id, permissionKey: { in: [...PERMISSIONS] } } })
  if (assignedPermissions !== PERMISSIONS.length) throw new Error('System Admin role is missing permissions; stop before creating an account.')

  const password = await readHidden('Temporary password (16–128 chars, input hidden): ')
  const confirmation = await readHidden('Confirm temporary password (input hidden): ')
  if (password.length < 16 || password.length > 128 || password !== confirmation) {
    throw new Error('Passwords must match and contain 16–128 characters.')
  }
  const passwordHash = await hashPassword(password)
  await prisma.$transaction(async tx => {
    await tx.snyUser.create({
      data: {
        email,
        passwordHash,
        roles: { create: { roleId: adminRole.id } },
      },
    })
  })
  console.log(`Created dedicated Admin account for ${email} on ${target.database}. Password and hash were not logged.`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Production Admin bootstrap failed.')
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
