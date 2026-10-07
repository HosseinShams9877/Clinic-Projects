/**
 * The override administration surface — the operator path that sets a tenant's
 * override declaration on its settings row (`02-architecture.md` §13, and the
 * mechanism Phase 1 built).
 *
 * This is the one settings write that is not a tab's own value, and it is the one
 * §13.2's three prohibitions are about. The pair is **validated against the build's
 * registry** before the row is touched: a declaration may only ever name an
 * `(module, implementation)` this release compiled and validated, because the
 * difference between that and a string the operator typed is the difference between
 * configuration and code injection (ADR-0019). A name the registry does not hold is
 * refused rather than written-and-ignored, so the operator sees the typo and the row
 * never carries a selection the resolver would fall back from.
 *
 * The write carries an audit entry, because an override is the one setting that
 * changes which code a tenant runs.
 */

import { DomainError } from '@/core/types'
import type { TenantContext } from '@/core/tenant'
import type { TransactionClient } from '@/core/db/scope'
import { REGISTRY, type RegistryKey } from '@/modules/registry'
import { isMember, Module as ModuleConstants, type Module } from '@/core/constants'
import { AuditAction, AuditEntity, recordAudit } from '@/modules/staff'

/** The shape of the audit detail, so a reader of `audit_logs` knows what it holds. */
export interface OverrideAuditDetail {
  readonly module: Module
  readonly implementation: string
}

/**
 * Sets one module's override declaration on the tenant's settings row.
 *
 * @throws DomainError — the module is not one of the twenty, or the pair is not in
 *   this build's registry. Both are refused before any row is written.
 */
export async function setOverrideDeclaration(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly module: string
  readonly implementation: string
}): Promise<OverrideAuditDetail> {
  if (!isMember(ModuleConstants, args.module)) {
    throw new DomainError(`${args.module} is not a module this build has.`, {
      messageKey: 'settings.overrideNotInRegistry',
      detail: { module: args.module },
    })
  }

  const moduleName = args.module as Module
  const key = `${moduleName}/${args.implementation}` as RegistryKey
  const entry = REGISTRY.entries[key]
  if (entry === undefined) {
    throw new DomainError(
      `${moduleName}/${args.implementation} is not in this build's override registry.`,
      {
        messageKey: 'settings.overrideNotInRegistry',
        detail: { module: moduleName, implementation: args.implementation },
      },
    )
  }

  const detail: OverrideAuditDetail = {
    module: moduleName,
    implementation: entry.declaration.implementation,
  }

  const current = await args.tx.tenantSettings.findUnique({
    where: { tenantId: args.ctx.tenantId },
    select: { overrides: true },
  })

  const parsed = safeOverridesObject(current?.overrides ?? null)
  parsed[moduleName] = { implementation: detail.implementation, version: entry.declaration.version }

  await args.tx.tenantSettings.upsert({
    where: { tenantId: args.ctx.tenantId },
    create: { tenantId: args.ctx.tenantId, overrides: JSON.stringify(parsed) },
    update: { overrides: JSON.stringify(parsed) },
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.SettingsOverrideDeclared,
    entity: AuditEntity.TenantSettings,
    entityId: args.ctx.tenantId,
    detail: { module: detail.module, implementation: detail.implementation },
  })

  return detail
}

/**
 * Removes one module's declaration, so the tenant runs the default again.
 *
 * Not a declaration of the default — the row no longer names the module at all,
 * which is §13.4's first row ("no override declared") and the state every tenant
 * starts in.
 */
export async function removeOverrideDeclaration(args: {
  readonly tx: TransactionClient
  readonly ctx: TenantContext
  readonly module: string
}): Promise<void> {
  const current = await args.tx.tenantSettings.findUnique({
    where: { tenantId: args.ctx.tenantId },
    select: { overrides: true },
  })
  if (current === null || current.overrides === null) return

  const parsed = safeOverridesObject(current.overrides)
  if (!(args.module in parsed)) return

  delete parsed[args.module]

  await args.tx.tenantSettings.update({
    where: { tenantId: args.ctx.tenantId },
    data: { overrides: JSON.stringify(parsed) },
  })

  await recordAudit({
    tx: args.tx,
    ctx: args.ctx,
    action: AuditAction.SettingsOverrideRemoved,
    entity: AuditEntity.TenantSettings,
    entityId: args.ctx.tenantId,
    detail: { module: args.module },
  })
}

/** The stored map as a mutable object, so a declaration can be set or unset on it. */
function safeOverridesObject(stored: string | null): Record<string, { implementation: string; version?: string }> {
  if (stored === null) return {}
  try {
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Record<string, { implementation: string; version?: string }>
  } catch {
    return {}
  }
}
