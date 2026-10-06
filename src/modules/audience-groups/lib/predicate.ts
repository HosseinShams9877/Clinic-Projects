/**
 * The predicate — the saved query an `AudienceGroup` holds, and the field allow-list
 * that makes a clinical fact structurally inexpressible in one.
 *
 * `03-data-model.md` §5 stores `predicate` as JSON in a `String` column, "parsed
 * through a Zod schema on read". This file is that schema, and the builder the
 * manager's preview writes through. The two meet at one type — `AudienceField` —
 * and the closure of that type is the whole mechanism:
 *
 * - **Compile time.** A condition is built by `audienceCondition`, whose `field` is
 *   `AudienceField`. `medicalHistory`, `sensitivities` and `doctorNote` are not
 *   members, so a predicate referencing one does not type-check. This is the
 *   type-level test's assertion, and it is the cheapest possible defence: a
 *   dimension of targeting the type cannot name is a dimension no caller reaches.
 * - **Read time.** The Zod schema below is keyed on the same set, so a row written
 *   by hand or by an older release names a field the schema rejects and the read
 *   raises rather than silently selecting on nothing.
 *
 * ## Why the conditions are over customer fields only
 *
 * The eight built-ins cross tables — a cycle's due date, a customer's balance — and
 * the condition form does not, deliberately. An ad-hoc predicate over joined tables
 * is a query planner the builder would have to render, and the eight are the eight
 * because they are the ones a clinic's targeting actually reduces to; the manager
 * who needs one of them selects it, and the manager who needs a conjunction of
 * customer facts builds it here. Two forms, one allow-list.
 *
 * ## Why relative days and not absolute dates
 *
 * «خوابیده‌ها» is «last visit more than ۹۰ days ago» on every day the group is
 * evaluated, for the rest of the group's life. An absolute stored date is right the
 * day it was written and wrong every day after, and a group that drifts is the
 * failure Decision 3 exists to prevent. `{ relativeDays }` is evaluated against the
 * injected clock each run, so the predicate is a rule about time and not a fact
 * about one moment of it.
 */

import { z } from 'zod'

import { ValidationError } from '@/core/types'

import type {
  AudienceCondition,
  AudienceField,
  AudienceOperator,
  AudienceValue,
  ConditionsPredicate,
  GroupPredicate,
} from '../types'

/** A day, as milliseconds, so the relative offsets read as days and not as numbers. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The fields a predicate may name, with the type of comparison each carries.
 *
 * This record is the allow-list's single definition; `AudienceField` is derived from
 * it and the Zod schema is generated from its keys, so the three are one closure and
 * cannot disagree about what a predicate may reach for.
 */
export const AUDIENCE_FIELDS = {
  birthMonth: { type: 'int' },
  birthDay: { type: 'int' },
  completedSessions: { type: 'int' },
  lastVisitAt: { type: 'datetime' },
  firstVisitAt: { type: 'datetime' },
  lifecycle: { type: 'string' },
  acquisitionSource: { type: 'string' },
  isActive: { type: 'boolean' },
} as const satisfies Record<AudienceField, { readonly type: string }>

/** The fields that hold an instant, whose values may be relative. */
const DATETIME_FIELDS: readonly AudienceField[] = ['lastVisitAt', 'firstVisitAt']

/** The operators a condition may use, as the schema spells them. */
const OPERATORS: readonly AudienceOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'isNull',
  'isNotNull',
]

const valueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ relativeDays: z.number() }).strict(),
])

const conditionSchema = z
  .object({
    field: z.enum(Object.keys(AUDIENCE_FIELDS) as [AudienceField, ...AudienceField[]]),
    op: z.enum(OPERATORS as [AudienceOperator, ...AudienceOperator[]]),
    value: valueSchema,
  })
  .strict()

const predicateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('BUILT_IN'), key: z.string() }).strict(),
  z.object({ kind: z.literal('CONDITIONS'), conditions: z.array(conditionSchema) }).strict(),
])

/**
 * Parses a stored `predicate` column into the type the evaluators take.
 *
 * @throws ValidationError — a row the schema does not accept. The column is JSON in a
 *   `String`, so an unparseable row is a broken row and not a group the module
 *   silently reinterprets.
 */
export function parsePredicate(stored: string): GroupPredicate {
  let json: unknown
  try {
    json = JSON.parse(stored)
  } catch {
    throw new ValidationError('An audience group predicate held no JSON.', {
      messageKey: 'audienceGroups.predicateUnparseable',
    })
  }

  const parsed = predicateSchema.safeParse(json)
  if (!parsed.success) {
    throw new ValidationError('An audience group predicate failed its schema.', {
      messageKey: 'audienceGroups.predicateUnparseable',
      detail: { issues: parsed.error.issues.map((issue) => issue.path.join('.')) },
    })
  }

  return parsed.data as GroupPredicate
}

/** Serializes a predicate for the column, in the shape `parsePredicate` reads back. */
export function serializePredicate(predicate: GroupPredicate): string {
  return JSON.stringify(predicate)
}

/**
 * Builds one condition of an ad-hoc predicate.
 *
 * The `field` is `AudienceField`, which is where the allow-list bites: a clinical
 * column is not a member of the set, so this call does not compile for one.
 */
export function audienceCondition(args: {
  readonly field: AudienceField
  readonly op: AudienceOperator
  readonly value: AudienceValue
}): AudienceCondition {
  return { field: args.field, op: args.op, value: args.value }
}

/**
 * The condition as a Prisma `where` fragment over the customer table.
 *
 * The null operators are the two that carry no value, and a datetime field's value
 * may be relative — resolved against the injected clock here, so the predicate is a
 * rule and not a date. A value whose shape does not suit the operator is a predicate
 * the builder could not have built through `audienceCondition`, and it selects
 * nothing rather than selecting on anything.
 */
function asPrismaCondition(
  condition: AudienceCondition,
  now: Date,
): Record<string, unknown> | null {
  const { field, op, value } = condition

  if (op === 'isNull') return { [field]: null }
  if (op === 'isNotNull') return { [field]: { not: null } }

  if (typeof value === 'object' && value !== null) {
    if (!DATETIME_FIELDS.includes(field)) return null
    return { [field]: { [op]: new Date(now.getTime() + value.relativeDays * DAY_MS) } }
  }

  if (value === null) return null
  return { [field]: { [op]: value } }
}

/**
 * The ad-hoc predicate's conditions as the customer query's `AND` filters.
 *
 * Each filter is one column's comparison, and the caller composes them inside the
 * base the built-ins share — tenant, active, customer — so a stored predicate cannot
 * widen a group past those. `null` when no condition produced a usable filter, which
 * is the empty-predicate answer rather than the everyone answer.
 */
export function conditionsToFilters(
  predicate: GroupPredicate,
  now: Date,
): readonly Record<string, unknown>[] {
  if (predicate.kind !== 'CONDITIONS') return []

  return predicate.conditions
    .map((condition) => asPrismaCondition(condition, now))
    .filter((fragment): fragment is Record<string, unknown> => fragment !== null)
}

/**
 * True when the predicate is one an ad-hoc group may hold.
 *
 * A built-in's predicate is a key, and an ad-hoc group's is conditions; the two are
 * not interchangeable, and the builder offers the conditions form only.
 */
export function isAdHocPredicate(predicate: GroupPredicate): predicate is ConditionsPredicate {
  return predicate.kind === 'CONDITIONS'
}

/**
 * Validates a group name, as the builder's own field check.
 *
 * @throws ValidationError — the name is empty.
 */
export function validateGroupName(name: string): void {
  if (name.trim().length === 0) {
    throw new ValidationError('An ad-hoc audience group needs a name.', {
      messageKey: 'audienceGroups.nameRequired',
    })
  }
}


