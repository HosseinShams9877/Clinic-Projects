import { Icon } from '@/core/components/icons'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'
import { cx } from '@/core/lib'
import { ADMIN_DEBTS } from '@/app/admin/catalog'

export const DEBT_QUERY_PARAM = 'q'

export interface DebtSearchFormProps {
  readonly basePath: string
  readonly query: string
  readonly doctorId: string
  readonly bucket: string | null
}

export function DebtSearchForm({ basePath, query, doctorId, bucket }: DebtSearchFormProps) {
  return (
    <form action={basePath} className="flex w-full flex-col gap-2 panel:flex-row panel:items-center">
      <div className="relative flex-1">
        <span className="absolute inset-y-0 flex items-center ps-3 text-ink-3" aria-hidden="true">
          <Icon name="search" size="compact" />
        </span>
        <label className="sr-only" htmlFor="admin-debts-search">
          {ADMIN_DEBTS.searchLabel}
        </label>
        <input
          id="admin-debts-search"
          type="search"
          name={DEBT_QUERY_PARAM}
          defaultValue={query}
          placeholder={ADMIN_DEBTS.searchPlaceholder}
          className={cx(CONTROL_CLASSES, 'ps-9 w-full')}
        />
      </div>
      
      <div className="flex items-center gap-2">
        <input type="text" placeholder={ADMIN_DEBTS.amountFrom} className={cx(CONTROL_CLASSES, 'w-24')} />
        <span className="text-ink-3">-</span>
        <input type="text" placeholder={ADMIN_DEBTS.amountTo} className={cx(CONTROL_CLASSES, 'w-24')} />
      </div>

      {doctorId === '' ? null : <input type="hidden" name="doctor" value={doctorId} readOnly />}
      {bucket === null ? null : <input type="hidden" name="bucket" value={bucket} readOnly />}
    </form>
  )
}