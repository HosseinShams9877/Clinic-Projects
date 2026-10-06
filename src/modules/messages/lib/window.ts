/**
 * The send window — `02-architecture.md` §6's "the hours the clinic sends in".
 *
 * A message outside the window is **held, not sent** (DoD 5): a customer's phone is
 * not a queue the clinic may discharge at ۳ بامداد, and a message held is a message
 * the window opens for rather than one the clinic has to compose again. The decision
 * is arithmetic on the clinic's local clock, which is why the settings read hands the
 * window edges to this function as `LocalTime` and the comparison never sees a
 * timezone.
 *
 * ## Why the comparison is a string comparison
 *
 * `LocalTime` is `HH:mm`, zero-padded, so lexicographic order and clock order are the
 * same order — «۰۹:۰۰» < «۱۰:۳۰» as strings and as hours, and the brand
 * (`07-localization.md` §4) is what keeps a caller from handing the function a value
 * that is not padded. A window that compared unpadded times would be correct for
 * every hour after ۱۰ and wrong for the two before it, which is the kind of defect a
 * test at ۰۸:۵۹ finds and a review does not.
 *
 * ## Why a window that wraps midnight is not supported
 *
 * A start later than an end is an empty window, and the clinic that configures one
 * has configured a window in which nothing is ever sent. Supporting a wraparound
 * («از ۲۰ شب تا ۸ صبح») would be two comparisons and one more way to be wrong, and
 * the specification's own window is the working day.
 */

import { nowLocalTime } from '@/core/localization'

import type { SendSettings } from '../types'

/**
 * Whether `now` is inside the clinic's sending hours.
 *
 * Edges are inclusive: a window that starts at ۰۸:۰۰ sends a message at ۰۸:۰۰,
 * because the minute the clinic opens is a minute the customer is awake for.
 */
export function isWithinSendWindow(now: Date, settings: SendSettings): boolean {
  const time = nowLocalTime(now)
  return time >= settings.sendWindowStart && time <= settings.sendWindowEnd
}
