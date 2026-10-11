/**
 * The shared progress bar — the cycles' «جلسه» cell and the profile's course table.
 *
 * Presentational and deliberately dumb: the caller hands the sessions done and the
 * sessions planned, and the bar draws the ratio. `total === 0` is the unbounded course
 * (`03-data-model.md` §2.4), which has no fraction to draw, so the bar renders empty and
 * the cell's own text names the count.
 */

export interface ProgressBarProps {
  /** How many sessions the course has completed. */
  readonly done: number
  /** How many sessions the course plans, or `0` when it is open-ended. */
  readonly total: number
}

export function ProgressBar({ done, total }: ProgressBarProps) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  return (
    <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken">
      <span className="block h-full rounded-pill bg-brand" style={{ width: `${pct}%` }} />
    </span>
  )
}
