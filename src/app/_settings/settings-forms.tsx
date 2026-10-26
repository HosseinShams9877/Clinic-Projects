'use client'

import { useActionState, useState, useTransition } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '@/core/components/button'
import { Field as FormField, PersianPhoneInput } from '@/core/components/form'
import { CONTROL_CLASSES } from '@/core/components/form/control-classes'

import { TemplateEditor } from './template-editor'
import {
  addHolidayAction,
  addShiftAction,
  removeHolidayAction,
  removeShiftAction,
  saveBookingAction,
  saveCycleTabAction,
  saveIdentityAction,
  saveMessagesAction,
  uploadClinicAboutAction,
  uploadClinicHeroAction,
  type ActionResult,
  type ClinicImageInput,
  type UploadResult,
} from './actions'
import type {
  BOOKING_FIELDS,
  CYCLE_FIELDS,
  IDENTITY_FIELDS,
  IDENTITY_IMAGES_FIELDS,
  MESSAGES_FIELDS,
  OPTIONS_FIELDS,
  WORKING_HOURS_FIELDS,
} from '@/modules/settings'
import type { Toggle } from '@/modules/roles-permissions'

type FieldLabels<C> = Readonly<Record<keyof C, string>>

const FIELD_CLASS = CONTROL_CLASSES
const LABEL_CLASS = 'text-xs text-ink-3'

function FormAnswer({ result }: { readonly result: ActionResult }) {
  if (result.ok) return null
  return <p className="text-sm font-medium text-danger">{result.message}</p>
}

function Submit({ label }: { readonly label: string }) {
  return (
    <Button type="submit" variant="primary" className="self-start">
      {label}
    </Button>
  )
}

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
      <input name={name} type={type} defaultValue={defaultValue} className={FIELD_CLASS} />
    </label>
  )
}

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
  readonly labels: FieldLabels<typeof IDENTITY_FIELDS>
}) {
  const [result, action] = useActionState(saveIdentityAction, { ok: true, message: null })

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 panel:grid-cols-2">
        <Field label={labels.tenantName} name="tenantName" defaultValue={tenantName} />
        <Field label={labels.clinicName} name="clinicName" defaultValue={clinicName} />
        <FormField label={labels.phone}>
          <PersianPhoneInput name="phone" defaultValue={phone} />
        </FormField>
        <Field label={labels.address} name="address" defaultValue={address} />
      </div>
      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

export function ClinicImagesForm({
  clinicId,
  heroImageUrl,
  heroImageKey,
  heroImageBackend,
  aboutImageUrl,
  aboutImageKey,
  aboutImageBackend,
  labels,
}: {
  readonly clinicId: string | null
  readonly heroImageUrl: string | null
  readonly heroImageKey: string | null
  readonly heroImageBackend: string | null
  readonly aboutImageUrl: string | null
  readonly aboutImageKey: string | null
  readonly aboutImageBackend: string | null
  readonly labels: typeof IDENTITY_IMAGES_FIELDS
}) {
  if (clinicId === null) return null

  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold text-ink">{labels.title}</h2>
        <p className="text-sm text-ink-2">{labels.lead}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 panel:grid-cols-2">
        <ImageUpload
          title={labels.heroImage}
          initialUrl={heroImageUrl}
          initialKey={heroImageKey}
          initialBackend={heroImageBackend}
          action={uploadClinicHeroAction}
          labels={labels}
        />
        <ImageUpload
          title={labels.aboutImage}
          initialUrl={aboutImageUrl}
          initialKey={aboutImageKey}
          initialBackend={aboutImageBackend}
          action={uploadClinicAboutAction}
          labels={labels}
        />
      </div>
    </section>
  )
}

function ImageUpload({
  title,
  initialUrl,
  initialKey,
  initialBackend,
  action,
  labels,
}: {
  readonly title: string
  readonly initialUrl: string | null
  readonly initialKey: string | null
  readonly initialBackend: string | null
  readonly action: (input: ClinicImageInput) => Promise<UploadResult>
  readonly labels: typeof IDENTITY_IMAGES_FIELDS
}) {
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(initialUrl)
  const [answer, setAnswer] = useState<UploadResult | null>(null)

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null
    setChosen(file)
    setAnswer(null)
    if (file !== null) setPreview(URL.createObjectURL(file))
  }

  function submit() {
    if (chosen === null) {
      setAnswer({ ok: false, message: labels.noFile })
      return
    }
    startTransition(async () => {
      const bytes = new Uint8Array(await chosen.arrayBuffer())
      const outcome = await action({
        filename: chosen.name,
        contentType: chosen.type,
        bytes,
        previousKey: initialKey ?? undefined,
        previousBackend:
          initialBackend === 'vercel-blob' || initialBackend === 'public'
            ? initialBackend
            : undefined,
      })
      setAnswer(outcome)
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
      <span className="text-sm font-bold text-ink">{title}</span>
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line-2 bg-surface p-2">
        {preview === null ? (
          <span className="text-xs text-ink-3">{labels.empty}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={title} className="max-h-full max-w-full rounded-md object-contain" />
        )}
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={onPick}
        className="block inline-size-full cursor-pointer rounded-md border border-line-2 bg-surface px-2 py-1.5 text-xs"
      />
      {answer !== null && !answer.ok ? (
        <p className="text-xs text-danger">{answer.message}</p>
      ) : null}
      <Button type="button" variant="primary" loading={pending} onClick={submit}>
        {labels.save}
      </Button>
    </div>
  )
}

export function BookingForm({
  mode,
  slotDurationMinutes,
  reminderLeadHours,
  bookingHoldMinutes,
  secretaryDiscountCap,
  depositRefundPolicy,
  debtGraceDays,
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
  readonly debtGraceDays: string
  readonly labels: FieldLabels<typeof BOOKING_FIELDS>
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
        <Field
          label={labels.debtGraceDays}
          name="debtGraceDays"
          defaultValue={debtGraceDays}
          type="number"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className={LABEL_CLASS}>{labels.depositRefundPolicy}</span>
          <select
            name="depositRefundPolicy"
            defaultValue={depositRefundPolicy}
            className={FIELD_CLASS}
          >
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
  readonly labels: FieldLabels<typeof WORKING_HOURS_FIELDS>
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
                      <RemoveButton
                        action={removeShiftAction}
                        id={shift.id}
                        label={labels.remove}
                      />
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
    <button type="button" onClick={() => action(id)} className="text-sm font-medium text-danger">
      {label}
    </button>
  )
}

export function CycleForm({
  noShowAddsToContactList,
  rescheduleShiftsDueDates,
  labels,
}: {
  readonly noShowAddsToContactList: boolean
  readonly rescheduleShiftsDueDates: boolean
  readonly labels: FieldLabels<typeof CYCLE_FIELDS>
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

export function MessagesForm({
  templates,
  sendWindowStart,
  sendWindowEnd,
  dailyMessageCap,
  duplicateWindowDays,
  labels,
  kindLabels,
  channelLabels,
  placeholders,
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
  readonly labels: FieldLabels<typeof MESSAGES_FIELDS>
  readonly kindLabels: Readonly<Record<string, string>>
  readonly channelLabels: Readonly<Record<string, string>>
  readonly placeholders: Readonly<Record<string, readonly string[]>>
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
          <TemplateEditor
            key={`${template.kind}-${template.channel}`}
            name={`template:${template.kind}:${template.channel}`}
            label={`${kindLabels[template.kind] ?? template.kind} — ${
              channelLabels[template.channel] ?? template.channel
            }`}
            defaultValue={template.text}
            placeholders={placeholders[template.kind] ?? []}
          />
        ))}
      </div>

      <FormAnswer result={result} />
      <Submit label={labels.save} />
    </form>
  )
}

export function OptionsForm({
  toggles,
  toggleLabels,
  labels,
}: {
  readonly toggles: Readonly<Record<string, boolean>>
  readonly toggleLabels: Readonly<
    Record<Toggle, { readonly label: string; readonly description: string }>
  >
  readonly labels: FieldLabels<typeof OPTIONS_FIELDS>
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {(Object.keys(toggleLabels) as readonly Toggle[]).map((toggle) => {
          const labelText = toggleLabels[toggle]?.label ?? ''
          const toggleStr = String(toggle) // 👈 برای جلوگیری از ارور TypeScript

          // 👈 اگر لیبل شامل کلمه "پزشک" یا "قیمت" بود، همیشه بدون تیک نشون بده
          const forceUncheck = 
            labelText.includes('پزشک') || 
            labelText.includes('قیمت') || 
            toggleStr === 'doctorCanBookOwn' || 
            toggleStr === 'doctorCanBlockHours' || 
            toggleStr === 'secretaryCanEditPrice'

          const isChecked = forceUncheck ? false : (toggles[toggle] ?? false)

          return (
            <div
              key={toggle}
              className="flex items-start gap-3 rounded-md border border-line bg-surface-2 px-3 py-2 opacity-80"
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled
                className="mt-0.5 accent-ink cursor-not-allowed"
              />
              <span className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-ink">{toggleLabels[toggle].label}</span>
                <span className="text-ink-3">{toggleLabels[toggle].description}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}