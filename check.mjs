import { PrismaClient } from '@prisma/client'
import { verify } from '@node-rs/argon2'

const prisma = new PrismaClient()

const user = await prisma.user.findFirst({
  where: { mobile: '09120000000' },
  include: { memberships: true },
})

if (!user) {
  console.log('USER NOT FOUND')
  process.exit(0)
}

console.log('userId:', user.id)
console.log('tenantId:', user.tenantId)
console.log('isActive:', user.isActive)
console.log('hash:', user.passwordHash.slice(0, 40))
console.log('memberships:', user.memberships.length)
for (const m of user.memberships) {
  console.log('  role:', m.role, 'isActive:', m.isActive)
}

const ok = await verify(user.passwordHash, '12345678')
console.log('verify("12345678"):', ok)

const sessions = await prisma.session.count({ where: { userId: user.id, revokedAt: null } })
console.log('active sessions:', sessions)

await prisma.$disconnect()