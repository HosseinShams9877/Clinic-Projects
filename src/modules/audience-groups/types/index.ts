/**
 * The `audience-groups` module's own vocabulary, and its override contract.
 *
 * `05-conventions.md` §15.5 puts a module's contract in its `types/` as a named,
 * exported interface, and the barrel at `index.ts` is the surface that contract
 * names. The interface is hand-written against the barrel so an override cannot
 * accidentally satisfy it by exporting something adjacent.
 *
 * ## The one idea this module exists for
 *
 * `03-data-model.md` Decision 3: a group is a **query**, not a stored list. The
 * shapes below are that idea as types — a group carries a `predicate`, and the
 * predicate is data that is re-evaluated, because a stored membership would be
 * stale within two weeks and would message people who have already visited.
 *
 * ## What the contract deliberately omits
 *
 * The Prisma client. Every function takes a `TransactionClient` because the caller
 * already opened the tenant scope.
 *
 * A clinical field. `AudienceField` is a closed set that names no column of
 * `medicalHistory`, `sensitivities` or `doctorNote`, and that closure is the whole
 * of the field allow-list: a predicate that cannot spell a clinical fact cannot
 * select on one, and the module's Zod schema is keyed on the same set so a row
 * written by hand fails to parse as well as failing to compile.
 */

import type { AudienceGroupKey } from '@/core/constants'
import type { TransactionClient } from '@/core/db/scope'

import type { AudienceGroupsMessageKey } from '../catalog'

/** A group row, as the builder and the campaign's audience selector read it. */
export interface AudienceGroupRow {
  readonly id: string
  readonly tenantId: string
  /** The stable slug of one of the eight built-ins; `null` for an ad-hoc group. */
  readonly key: string | null
  readonly name: string
  readonly isBuiltIn: boolean
  readonly predicate: GroupPredicate
  readonly predicateVersion: number
  readonly lastRefreshedAt: Date | null
  /** A cache of the predicate's count; membership is computed, never stored. */
  readonly lastCount: number
  readonly isActive: boolean
}

/** A saved query, as `03` §2.7 and §5 store it: JSON in a `String` column. */
export type GroupPredicate = BuiltInPredicate | ConditionsPredicate

/**
 * One of the eight, whose evaluator is index-backed and crosses tables the
 * condition form cannot express (a cycle's due date, a customer's balance).
 */
export interface BuiltInPredicate {
  readonly kind: 'BUILT_IN'
  readonly key: AudienceGroupKey
}

/**
 * A conjunction of conditions over the allow-listed customer fields — the ad-hoc
 * group a manager builds from the preview.
 */
export interface ConditionsPredicate {
  readonly kind: 'CONDITIONS'
  readonly conditions: readonly AudienceCondition[]
}

/**
 * The fields a group predicate may name.
 *
 * This is the **field allow-list**, and it is the whole mechanism: `medicalHistory`,
 * `sensitivities` and `doctorNote` are not members, so a predicate referencing a
 * clinical field does not type-check and does not parse. Adding a field here is the
 * one place a new dimension of targeting becomes expressible, and a clinical one is
 * the one addition this set is structurally incapable of receiving.
 */
export interface AudienceFields {
  /** The Jalali month of birth, ۱–۱۲, as `customer_tenant_birth_idx` reads it. */
  readonly birthMonth: { readonly type: 'int' }
  /** The day of the month of birth, ۱–۳۱. */
  readonly birthDay: { readonly type: 'int' }
  /** Completed sessions across the customer's courses. */
  readonly completedSessions: { readonly type: 'int' }
  /** The customer's most recent visit. */
  readonly lastVisitAt: { readonly type: 'datetime' }
  /** The customer's first visit. */
  readonly firstVisitAt: { readonly type: 'datetime' }
  /** `LEAD` or `CUSTOMER` — the cartable the person is on. */
  readonly lifecycle: { readonly type: 'string' }
  /** How the person found the clinic. */
  readonly acquisitionSource: { readonly type: 'string' }
  /** Whether the record is active. */
  readonly isActive: { readonly type: 'boolean' }
}

/**
 * The closed set of names a condition may carry.
 *
 * Derived from `AudienceFields` and not written out, so a field added to the record
 * is a field a predicate may name, and a field the record does not hold is a name
 * no predicate can spell.
 */
export type AudienceField = keyof AudienceFields

/** The comparisons a condition may make. */
export type AudienceOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'isNull' | 'isNotNull'

/**
 * A condition's value.
 *
 * `{ relativeDays }` is a datetime field's offset from the moment of evaluation, and
 * it is what makes a group re-evaluatable: «خوابیده‌ها» is *always* «last visit more
 * than ۹۰ days ago», and a stored absolute date would be right the day it was written
 * and wrong every day after.
 */
export type AudienceValue = string | number | boolean | null | { readonly relativeDays: number }

/** One clause of an ad-hoc predicate. */
export interface AudienceCondition {
  readonly field: AudienceField
  readonly op: AudienceOperator
  readonly value: AudienceValue
}

/** A campaign's audience question, answered by this module. */
export interface AudienceEvaluation {
  readonly group: AudienceGroupRow
  readonly customerIds: readonly string[]
  /** The count the preview renders, which is `customerIds.length`. */
  readonly count: number
}

/** The module's public surface, as the registry types an override against it. */
export interface AudienceGroupsModule {
  readonly ensureBuiltInGroups: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
  }) => Promise<void>
  readonly listAudienceGroups: (
    tx: TransactionClient,
    tenantId: string,
  ) => Promise<readonly AudienceGroupRow[]>
  readonly previewAudienceGroup: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly predicate: GroupPredicate
    readonly now: Date
  }) => Promise<AudienceEvaluation>
  readonly createAdHocGroup: (args: {
    readonly tx: TransactionClient
    readonly tenantId: string
    readonly name: string
    readonly predicate: GroupPredicate
    readonly now: Date
  }) => Promise<AudienceGroupRow>
}

/** The catalog keys this module can raise, re-exported for the interface's own use. */
export type { AudienceGroupsMessageKey }
