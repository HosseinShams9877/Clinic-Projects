/**
 * The settings page — `02-architecture.md` §9's `admin/settings.html`.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

import { prisma, runInTenantScope } from '@/core/db'
import { Permission } from '@/core/constants'
import { toPersianDigits } from '@/core/localization'
import { cx } from '@/core/lib'

import { requireStaffPanel } from '@/app/_shell/session'
import {
  BookingForm,
  ClinicImagesForm,
  CycleForm,
  IdentityForm,
  MessagesForm,
  OptionsForm,
  WorkingHoursForm,
} from '@/app/_settings/settings-forms'
import {
  AUTOMATIC_KIND_LABELS,
  BOOKING_FIELDS,
  BOOKING_MODE_LABELS,
  CYCLE_FIELDS,
  DEPOSIT_REFUND_LABELS,
  IDENTITY_FIELDS,
  IDENTITY_IMAGES_FIELDS,
  MESSAGES_FIELDS,
  OPTIONS_FIELDS,
  SETTINGS_FIELDS,
  SETTINGS_TAB_LABELS,
  SETTINGS_TAB_LEADS,
  TOGGLE_LABELS,
  WEEKDAY_LABELS,
  WORKING_HOURS_FIELDS,
  readSettingsSurface,
} from '@/modules/settings'
import { SETTINGS_TABS, SettingsTab } from '@/modules/settings'
import { CHANNEL_LABELS, TEMPLATE_PLACEHOLDERS } from '@/modules/messages'
import { requirePermission } from '@/modules/roles-permissions'

export const metadata: Metadata = { title: SETTINGS_FIELDS.title }

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireStaffPanel('admin')
  requirePermission(session.permissions, Permission.ManageClinicSettings)

  const params = await searchParams
  const tab = resolveTab(params)

  const surface = await runInTenantScope(session.permissions, prisma(), (tx) =>
    readSettingsSurface(tx, session.tenantId),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-ink">{SETTINGS_FIELDS.title}</h1>
        <p className="text-sm text-ink-2">{SETTINGS_FIELDS.lead}</p>
      </div>

      <nav className="flex items-center gap-2 max-panel:flex-nowrap max-panel:overflow-x-auto panel:flex-wrap">
        {SETTINGS_TABS.map((each) => {
          const active = each === tab
          return (
            <Link
              key={each}
              href={`/admin/settings?tab=${each}`}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'shrink-0 rounded-xs border px-3 py-[6px] text-xs font-semibold no-underline',
                active
                  ? 'border-transparent bg-brand-50 text-brand-700'
                  : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {SETTINGS_TAB_LABELS[each]}
            </Link>
          )
        })}
      </nav>

      <p className="text-sm text-ink-3">{SETTINGS_TAB_LEADS[tab]}</p>

      {tab === SettingsTab.Identity ? (
        <div className="flex flex-col gap-8">
          <IdentityForm
            tenantName={surface.identity.tenantName}
            clinicName={surface.identity.clinicName}
            phone={surface.identity.phone ?? ''}
            address={surface.identity.address ?? ''}
            labels={IDENTITY_FIELDS}
          />
          <ClinicImagesForm
            clinicId={surface.images.clinicId}
            heroImageUrl={surface.images.heroImageUrl}
            heroImageKey={surface.images.heroImageKey}
            heroImageBackend={surface.images.heroImageBackend}
            aboutImageUrl={surface.images.aboutImageUrl}
            aboutImageKey={surface.images.aboutImageKey}
            aboutImageBackend={surface.images.aboutImageBackend}
            labels={IDENTITY_IMAGES_FIELDS}
          />
        </div>
      ) : null}

      {tab === SettingsTab.Booking ? (
        <BookingForm
          mode={surface.booking.mode}
          slotDurationMinutes={surface.booking.timings.slotDurationMinutes}
          reminderLeadHours={surface.booking.timings.reminderLeadHours}
          bookingHoldMinutes={surface.booking.timings.bookingHoldMinutes}
          secretaryDiscountCap={
            surface.booking.secretaryDiscountCap === null
              ? ''
              : toPersianDigits(surface.booking.secretaryDiscountCap)
          }
          depositRefundPolicy={surface.booking.depositRefundPolicy ?? ''}
          debtGraceDays={
            surface.booking.debtGraceDays === null ? '' : toPersianDigits(surface.booking.debtGraceDays)
          }
          labels={BOOKING_FIELDS}
          modeLabels={BOOKING_MODE_LABELS}
          refundLabels={DEPOSIT_REFUND_LABELS}
        />
      ) : null}

      {tab === SettingsTab.WorkingHours ? (
        <WorkingHoursForm
          shifts={surface.workingHours.shifts}
          holidays={surface.workingHours.holidays}
          labels={WORKING_HOURS_FIELDS}
          weekdayLabels={WEEKDAY_LABELS}
        />
      ) : null}

      {tab === SettingsTab.Cycle ? (
        <CycleForm
          noShowAddsToContactList={surface.cycle.noShowAddsToContactList}
          rescheduleShiftsDueDates={surface.cycle.rescheduleShiftsDueDates}
          labels={CYCLE_FIELDS}
        />
      ) : null}

      {tab === SettingsTab.Messages ? (
        <MessagesForm
          templates={surface.messages.templates}
          sendWindowStart={surface.messages.sendWindowStart}
          sendWindowEnd={surface.messages.sendWindowEnd}
          dailyMessageCap={surface.messages.dailyMessageCap}
          duplicateWindowDays={surface.messages.duplicateWindowDays}
          labels={MESSAGES_FIELDS}
          kindLabels={AUTOMATIC_KIND_LABELS}
          channelLabels={CHANNEL_LABELS}
          placeholders={TEMPLATE_PLACEHOLDERS}
        />
      ) : null}

      {tab === SettingsTab.Options ? (
        <OptionsForm
          toggles={surface.options.toggles}
          toggleLabels={TOGGLE_LABELS}
          labels={OPTIONS_FIELDS}
        />
      ) : null}
    </div>
  )
}

/** The tab the query string names, or the first one when it names none or a stranger. */
function resolveTab(params: Record<string, string | string[] | undefined>): SettingsTab {
  const value = Array.isArray(params.tab) ? params.tab[0] : params.tab
  if (value !== undefined && (SETTINGS_TABS as readonly string[]).includes(value)) {
    return value as SettingsTab
  }
  return SettingsTab.Identity
}