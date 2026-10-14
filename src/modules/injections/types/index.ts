/**
 * The `injections` module's own vocabulary.
 *
 * A new module, and the first one whose surface is a clinical record. The
 * contract is written here for the same reason every other module's is
 * (`05-conventions.md` §15.5): an override must reproduce it, and a caller must
 * reach it only through the barrel.
 */

import type { TenantContext, TransactionClient } from '@/core/db/scope'
import type { InjectionsMessageKey } from '../catalog'

/** One row of the record, shaped as the profile's table renders it. */
export interface InjectionRow {
  readonly id: string
  readonly customerId: string
  readonly doctorId: string
  readonly doctorName: string
  readonly area: string
  readonly material: string
  readonly brand: string | null
  readonly amount: string | null
  readonly amountUnit: string | null
  readonly depth: string | null
  readonly technique: string | null
  readonly batchNumber: string | null
  readonly note: string | null
  /** The UTC instant the session was performed. */
  readonly sessionAt: Date
  /** The Jalali `YYYY-MM-DD` day, as the table's own date cell reads it. */
  readonly localDate: string
  /** When the row itself was written, which the table's order falls back to. */
  readonly createdAt: Date
}

/** The four counts the profile's KPI band shows above the table. */
export interface InjectionCounts {
  readonly total: number
  readonly sessions: number
  readonly totalCc: number
  readonly totalUnits: number
}

/** What the create write takes — every field the form collects. */
export interface CreateInjectionInput {
  readonly customerId: string
  readonly area: string
  readonly material: string
  readonly brand?: string
  readonly amount?: string
  readonly amountUnit?: string
  readonly depth?: string
  readonly technique?: string
  readonly batchNumber?: string
  readonly note?: string
  readonly sessionAt: Date
  readonly localDate: string
}

/** This module's public surface, as a contract an override must reproduce. */
export interface InjectionsModule {
  /** The customer's injections, newest first. */
  readonly customerInjections: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
  }) => Promise<readonly InjectionRow[]>

  /** The four KPI numbers the profile band shows. */
  readonly injectionCounts: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly customerId: string
  }) => Promise<InjectionCounts>

  /** The write path — one injection row, with the doctor taken from the context. */
  readonly recordInjection: (args: {
    readonly tx: TransactionClient
    readonly ctx: TenantContext
    readonly input: CreateInjectionInput
  }) => Promise<InjectionRow>

  /** The module's own sentences. */
  readonly MESSAGES: Readonly<Record<InjectionsMessageKey, string>>
}