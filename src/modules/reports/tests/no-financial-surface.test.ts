/**
 * The reports surface carries no financial figure — Phase 10's second test.
 *
 * `02-architecture.md` §13.4 keeps money out of `reports`, and the property is a
 * property of the module's *surface* before it is a property of any query: a field
 * that is not on the barrel is a figure no screen can render and no caller can ask
 * for. This suite enumerates the barrel and refuses the financial shape on it, so a
 * `revenue` report added next to the seven is a failing test rather than an eighth
 * report nobody noticed was money.
 *
 * The two things it refuses:
 *
 * - a **name** the product only uses for money — `revenue`, `price`, `amount`,
 *   `payment`, `debit`, `balance`, `refund`, `deposit`;
 * - an **eighth report**, which would be a report the specification never closed.
 *
 * The seven reports' own shapes are the compiler's to keep money out of — none has a
 * `bigint`, because `03-data-model.md` §4.1 makes `bigint` the column type of every
 * sum, and a report that needed one would be a report about money.
 */

import { expect, it } from 'vitest'

import * as reportsBarrel from '../index'
import { REPORT_LABELS, REPORT_ORDER, type ReportKey } from '../index'

/** The names the product uses for money and for nothing else. */
const FINANCIAL_NAMES = [
  'revenue',
  'price',
  'amount',
  'payment',
  'payments',
  'debit',
  'balance',
  'refund',
  'deposit',
  'money',
] as const

it('exports the seven reports, the range they share, and nothing financial', () => {
  const names = Object.keys(reportsBarrel).filter(
    (name) => typeof reportsBarrel[name as keyof typeof reportsBarrel] === 'function',
  )

  // The seven the specification closed, plus the three range helpers the surfaces that
  // read a span of days share with them. Anything else on the barrel is a surface the
  // module grew without the specification naming it.
  expect(names).toStrictEqual([
    'localDateWhere',
    'monthStartOf',
    'readReportOffset',
    'toInstantRange',
    'averageSessionsReport',
    'cycleCompletionReport',
    'noShowReport',
    'returnRateReport',
    'dropOffCurveReport',
    'lastVisitDistributionReport',
    'doctorComparisonReport',
  ])

  for (const name of names) {
    const lower = name.toLowerCase()
    for (const financial of FINANCIAL_NAMES) {
      expect(lower).not.toContain(financial)
    }
  }
})

it('closes the set at seven, so an eighth report is a failing test', () => {
  expect(REPORT_ORDER).toHaveLength(7)

  // `REPORT_LABELS` is keyed over the union, so a report without a label is a compile
  // error; the order and the labels naming the same seven is the runtime half of that.
  const labelled = Object.keys(REPORT_LABELS) as readonly ReportKey[]
  expect(labelled).toStrictEqual(REPORT_ORDER)

  for (const key of REPORT_ORDER) {
    const label = REPORT_LABELS[key]
    expect(label.title.trim()).not.toBe('')
    expect(label.lead.trim()).not.toBe('')
  }
})
