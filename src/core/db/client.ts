import { PrismaClient } from '@prisma/client'

import { getEnv } from '@/core/config/env'

import { tenantExtension } from './extension'

/**
 * The client for a URL, with the tenant extension applied.
 */
export function createPrismaClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } }).$extends(tenantExtension) as unknown as PrismaClient
}

/**
 * A client without the tenant extension.
 */
export function createUnscopedClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } })
}

let client: PrismaClient | undefined
let unscoped: PrismaClient | undefined

export function prisma(): PrismaClient {
  client ??= createPrismaClient(getDatabaseUrl())
  return client
}

export function unscopedPrisma(): PrismaClient {
  unscoped ??= createUnscopedClient(getDatabaseUrl())
  return unscoped
}

function getDatabaseUrl(): string {
  return getEnv().databaseUrl
}