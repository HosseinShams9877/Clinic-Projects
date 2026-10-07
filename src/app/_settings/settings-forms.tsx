/**
 * The settings page's six tabs, as the forms the manager submits.
 *
 * The six are one client component because they are one row's own affordances: a tab's
 * form posts to its own server action and re-renders from the row the write left, and
 * the answer a failure carries lands on the form that raised it — the same answer the
 * services catalogue gives and for the same reason (`05-conventions.md` §7).
 *
 * ## Why the fields are plain inputs and not the RHF shell
 *
 * `01-tech-stack.md` §8.5's `Form` shell is for a module form that owns a Zod schema
 * and validates it on the client. A settings tab's fields are the module's own
 * contract, parsed on the server by the same schema (`03-data-model.md` §5), and the
 * tab's job is to post the form and render the sentence the server answered with —
 * so the fields are labelled inputs in the design system's tokens, and the schema is
 * not restated on the client where it would be a second copy.
 *
 * ## Why the toggles do not optimistically flip
 *
 * The eight are enforced server-side, so the checkbox shows the value the row holds
 * until the write landed; a flip that happened before the server agreed would be a
 * toggle the manager believes is set while the write path still refuses it.
 */

'use client'

import { useActionState } from 'react'

import {
  addHolidayAction,
  addOverrideAction,
  addShiftAction,
  removeHolidayAction,
  removeShiftAction,
  removeOverrideAction,
  saveBookingAction,
  saveCycleTabAction,
  saveIdentityAction,
  saveMessagesAction,
  saveTogglesAction,
  type ActionResult,
} from './actions'

/** The tabs' shared field classes, so a field is the same field in every tab. */
const FIELD_CLASS = 'rounded-md border border-line bg-page px-3 py-1.5 text-ink'
const LABEL_CLASS = 'text-xs text-ink-3'

/** The answer the server gives a form it could not save, or nothing when it could. */
function FormAnswer({ result }: { readonly result: ActionResult }) {
  if (result.ok) return null
  return <p className="text-sm font-medium text-danger">{result.message}</p>
}

/** The one button every tab's form submits with. */
function Submit({ label }: { readonly label: string }) {
  return (
    <button
      type="submit"
      className="self-start rounded-md bg-ink px-4 py-1.5 text-sm font-medium text-page"
    >
      {label}
    </button>
  )
}

/** One labelled field, as every tab's grid lays one out. */
function Field({
  label,
  name,
  defaultValue,
  type = 'text',
}: {
  readonly label: string
  readonly name: string
  readonly defaultValue: string
  readonly type?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className={LABEL_CLASS}>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        className={FIELD_CLASS}
      />
    </label>
  )
}

/** «اطلاعات کلینیک» — the name and the address a customer and the site show. */
export function IdentityForm({
  tenantName,
  clinicName,
  phone,
  address,
  labels,
}: {
  readonly tenantName: string
  readonly clinicName: string
  readonly phone: string
  readonly address: string
  readonly labels: { readonly save: string; readonly [key: string]: string }
}) {
  const [result, action] = useActionState(saveIdentityAction, { ok: true, message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 panel:grid-cols-2">
        <Field label={labels.tenantName} name="tenantName" defaultValue={tenantName} />
        <Field label={labels.clinicName} name="clinicName" defaultValue={clinicName} />
        <Field label={labels.phone} name="phone" defaultValue={phone} />
        <Field label={labels.address} name="address" defaultValue={address} />
      </div>
      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

/** «نوبتدهی» — the booking mode, the lifecycle timings and the two policy values. */
export function BookingForm({
  mode,
  slotDurationMinutes,
  reminderLeadHours,
  bookingHoldMinutes,
  secretaryDiscountCap,
  depositRefundPolicy,
  labels,
  modeLabels,
  refundLabels,
}: {
  readonly mode: string
  readonly slotDurationMinutes: number
  readonly reminderLeadHours: number
  readonly bookingHoldMinutes: number
  readonly secretaryDiscountCap: string
  readonly depositRefundPolicy: string
  readonly labels: { readonly save: string; readonly [key: string]: string }
  readonly modeLabels: Readonly<Record<string, string>>
  readonly refundLabels: Readonly<Record<string, string>>
}) {
  const [result, action] = useActionState(saveBookingAction, { ok: true, message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 panel:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className={LABEL_CLASS}>{labels.mode}</span>
          <select name="mode" defaultValue={mode} className={FIELD_CLASS}>
            {Object.entries(modeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={labels.slotDurationMinutes}
          name="slotDurationMinutes"
          defaultValue={String(slotDurationMinutes)}
          type="number"
        />
        <Field
          label={labels.reminderLeadHours}
          name="reminderLeadHours"
          defaultValue={String(reminderLeadHours)}
          type="number"
        />
        <Field
          label={labels.bookingHoldMinutes}
          name="bookingHoldMinutes"
          defaultValue={String(bookingHoldMinutes)}
          type="number"
        />
        <Field
          label={labels.secretaryDiscountCap}
          name="secretaryDiscountCap"
          defaultValue={secretaryDiscountCap}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className={LABEL_CLASS}>{labels.depositRefundPolicy}</span>
          <select name="depositRefundPolicy" defaultValue={depositRefundPolicy} className={FIELD_CLASS}>
            <option value="">{labels.none}</option>
            {Object.entries(refundLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

/** «ساعات کاری» — the clinic's weekly shifts and its holidays. */
export function WorkingHoursForm({
  shifts,
  holidays,
  labels,
  weekdayLabels,
}: {
  readonly shifts: ReadonlyArray<{
    readonly id: string
    readonly weekday: number
    readonly startTime: string
    readonly endTime: string
  }>
  readonly holidays: ReadonlyArray<{
    readonly id: string
    readonly localDate: string
    readonly title: string
    readonly isOfficial: boolean
  }>
  readonly labels: { readonly save: string; readonly [key: string]: string }
  readonly weekdayLabels: readonly string[]
}) {
  const [shiftResult, shiftAction] = useActionState(addShiftAction, { ok: true, message: null })
  const [holidayResult, holidayAction] = useActionState(addHolidayAction, {
    ok: true,
    message: null,
  })

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{labels.shifts}</caption>
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-3 py-2 text-right font-normal">{labels.weekday}</th>
                <th className="px-3 py-2 text-right font-normal">{labels.startTime}</th>
                <th className="px-3 py-2 text-right font-normal">{labels.endTime}</th>
                <th className="px-3 py-2 font-normal">{labels.remove}</th>
              </tr>
            </thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-ink-3" colSpan={4}>
                    {labels.noShifts}
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id} className="border-b border-line/60 text-ink">
                    <td className="px-3 py-2">{weekdayLabels[shift.weekday]}</td>
                    <td className="px-3 py-2 tabular-nums">{shift.startTime}</td>
                    <td className="px-3 py-2 tabular-nums">{shift.endTime}</td>
                    <td className="px-3 py-2">
                      <RemoveButton action={removeShiftAction} id={shift.id} label={labels.remove} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={shiftAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASS}>{labels.weekday}</span>
            <select name="weekday" defaultValue="0" className={FIELD_CLASS}>
              {weekdayLabels.map((label, index) => (
                <option key={index} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Field label={labels.startTime} name="startTime" defaultValue="09:00" type="time" />
          <Field label={labels.endTime} name="endTime" defaultValue="17:00" type="time" />
          <Submit label={labels.addShift} />
        </form>
        <FormAnswer result={shiftResult} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{labels.holidays}</caption>
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th className="px-3 py-2 text-right font-normal">{labels.holidayDate}</th>
                <th className="px-3 py-2 text-right font-normal">{labels.holidayTitle}</th>
                <th className="px-3 py-2 font-normal">{labels.remove}</th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-ink-3" colSpan={3}>
                    {labels.noHolidays}
                  </td>
                </tr>
              ) : (
                holidays.map((holiday) => (
                  <tr key={holiday.id} className="border-b border-line/60 text-ink">
                    <td className="px-3 py-2 tabular-nums">{holiday.localDate}</td>
                    <td className="px-3 py-2">{holiday.title}</td>
                    <td className="px-3 py-2">
                      <RemoveButton
                        action={removeHolidayAction}
                        id={holiday.id}
                        label={labels.remove}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={holidayAction} className="flex flex-wrap items-end gap-3">
          <Field label={labels.holidayDate} name="localDate" defaultValue="" />
          <Field label={labels.holidayTitle} name="title" defaultValue="" />
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="isOfficial" className="accent-ink" />
            {labels.isOfficial}
          </label>
          <Submit label={labels.addHoliday} />
        </form>
        <FormAnswer result={holidayResult} />
      </section>
    </div>
  )
}

/** A row's removal, as the one button the two tables share. */
function RemoveButton({
  action,
  id,
  label,
}: {
  readonly action: (id: string) => Promise<ActionResult>
  readonly id: string
  readonly label: string
}) {
  return (
    <button
      type="button"
      onClick={() => action(id)}
      className="text-sm font-medium text-danger"
    >
      {label}
    </button>
  )
}

/** «چرخه درمان» — the two defaults `04-roles-permissions.md` §5 keeps with the engine. */
export function CycleForm({
  noShowAddsToContactList,
  rescheduleShiftsDueDates,
  labels,
}: {
  readonly noShowAddsToContactList: boolean
  readonly rescheduleShiftsDueDates: boolean
  readonly labels: { readonly save: string; readonly [key: string]: string }
}) {
  const [result, action] = useActionState(saveCycleTabAction, { ok: true, message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ToggleCheckbox
          name="noShowAddsToContactList"
          label={labels.noShowAddsToContactList}
          checked={noShowAddsToContactList}
        />
        <ToggleCheckbox
          name="rescheduleShiftsDueDates"
          label={labels.rescheduleShiftsDueDates}
          checked={rescheduleShiftsDueDates}
        />
      </div>
      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

/** One labelled checkbox, as the two cycle defaults render it. */
function ToggleCheckbox({
  name,
  label,
  checked,
}: {
  readonly name: string
  readonly label: string
  readonly checked: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      <input type="checkbox" name={name} defaultChecked={checked} className="accent-ink" />
      {label}
    </label>
  )
}

/** «پیام‌ها» — every automatic message's text, and the send policy. */
export function MessagesForm({
  templates,
  sendWindowStart,
  sendWindowEnd,
  dailyMessageCap,
  duplicateWindowDays,
  labels,
  kindLabels,
  channelLabels,
}: {
  readonly templates: ReadonlyArray<{
    readonly kind: string
    readonly channel: string
    readonly text: string
  }>
  readonly sendWindowStart: string
  readonly sendWindowEnd: string
  readonly dailyMessageCap: number
  readonly duplicateWindowDays: number
  readonly labels: { readonly save: string; readonly [key: string]: string }
  readonly kindLabels: Readonly<Record<string, string>>
  readonly channelLabels: Readonly<Record<string, string>>
}) {
  const [result, action] = useActionState(saveMessagesAction, { ok: true, message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 panel:grid-cols-2">
        <Field
          label={labels.sendWindowStart}
          name="sendWindowStart"
          defaultValue={sendWindowStart}
          type="time"
        />
        <Field
          label={labels.sendWindowEnd}
          name="sendWindowEnd"
          defaultValue={sendWindowEnd}
          type="time"
        />
        <Field
          label={labels.dailyMessageCap}
          name="dailyMessageCap"
          defaultValue={String(dailyMessageCap)}
          type="number"
        />
        <Field
          label={labels.duplicateWindowDays}
          name="duplicateWindowDays"
          defaultValue={String(duplicateWindowDays)}
          type="number"
        />
      </div>

      <div className="flex flex-col gap-3">
        {templates.map((template) => (
          <label key={`${template.kind}-${template.channel}`} className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASS}>{`${kindLabels[template.kind] ?? template.kind} — ${channelLabels[template.channel] ?? template.channel}`}</span>
            <textarea
              name={`template:${template.kind}:${template.channel}`}
              defaultValue={template.text}
              rows={2}
              className={FIELD_CLASS}
            />
          </label>
        ))}
      </div>

      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

/** «اختیارات» — the eight toggles, and the overrides this tenant has declared. */
export function OptionsForm({
  toggles,
  toggleLabels,
  overrides,
  labels,
  modules,
}: {
  readonly toggles: Readonly<Record<string, boolean>>
  readonly toggleLabels: Readonly<Record<string, { readonly label: string; readonly description: string }>>
  readonly overrides: ReadonlyArray<{ readonly module: string; readonly implementation: string }>
  readonly labels: { readonly save: string; readonly [key: string]: string }
  readonly modules: readonly string[]
}) {
  const [toggleResult, toggleAction] = useActionState(saveTogglesAction, { ok: true, message: null })
  const [overrideResult, overrideAction] = useActionState(addOverrideAction, {
    ok: true,
    message: null,
  })

  return (
    <div className="flex flex-col gap-6">
      <form action={toggleAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {(Object.keys(toggleLabels) as readonly string[]).map((toggle) => (
            <label
              key={toggle}
              className="flex items-start gap-3 rounded-md border border-line bg-page px-3 py-2"
            >
              <input
                type="checkbox"
                name={toggle}
                defaultChecked={toggles[toggle] ?? false}
                className="mt-0.5 accent-ink"
              />
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-ink">{toggleLabels[toggle].label}</span>
                <span className="text-ink-3">{toggleLabels[toggle].description}</span>
              </span>
            </label>
          ))}
        </div>
        <FormAnswer result={toggleResult} />
        <Submit label={labels.save} />
      </form>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-ink">{labels.overrides}</h3>
        {overrides.length === 0 ? (
          <p className="text-sm text-ink-3">{labels.noOverrides}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overrides.map((override) => (
              <li
                key={override.module}
                className="flex items-center justify-between rounded-md border border-line bg-page px-3 py-2 text-sm text-ink"
              >
                <span>{`${override.module} — ${override.implementation}`}</span>
                <RemoveButton
                  action={removeOverrideAction}
                  id={override.module}
                  label={labels.remove}
                />
              </li>
            ))}
          </ul>
        )}

        <form action={overrideAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className={LABEL_CLASS}>{labels.overrideModule}</span>
            <select name="module" defaultValue="" className={FIELD_CLASS}>
              <option value="">—</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </label>
          <Field label={labels.overrideImplementation} name="implementation" defaultValue="" />
          <Submit label={labels.addOverride} />
        </form>
        <FormAnswer result={overrideResult} />
      </section>
    </div>
  )
}
