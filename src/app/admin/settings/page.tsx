/**
 * The settings page — `02-architecture.md` §9's `admin/settings.html`.
 *
 * Six tabs, one row: the clinic's identity, the booking mode and the appointment
 * lifecycle timings, the working hours and holidays, the cycle engine's two defaults,
 * every automatic message's text, and the eight toggles beside the overrides the
 * tenant has declared. The tab is the query string's `?tab=`, so a manager lands on
 * the tab a link named and the tab bar is six links rather than six pages.
 *
 * ## Why the page reads all six tabs at once
 *
 * The tab bar renders the six names from the constants' own order, and the tab it
 * renders is one of the six the surface read — a second read for the bar would be a
 * second place the six are listed, and a tab the surface did not read is a tab the
 * switch would render empty. The five reads the surface does not use are cheap: they
 * are the tenant's own row and the two small tables that hang off it.
 */

import type { Metadata } from 'next'

import { prisma, runInTenantScope } from '@/core/db'
import { Permission, MODULES } from '@/core/constants'
import { toPersianDigits } from '@/core/localization'

import { requireStaffPanel } from '@/app/_shell/session'
import {
  BookingForm,
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
import { CHANNEL_LABELS } from '@/modules/messages'
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

      <nav className="flex flex-wrap gap-2">
        {SETTINGS_TABS.map((each) => (
          <a
            key={each}
            href={`/admin/settings?tab=${each}`}
            className={
              each === tab
                ? 'rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-page'
                : 'rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2'
            }
          >
            {SETTINGS_TAB_LABELS[each]}
          </a>
        ))}
      </nav>

      <p className="text-sm text-ink-3">{SETTINGS_TAB_LEADS[tab]}</p>

      {tab === SettingsTab.Identity ? (
        <IdentityForm
          tenantName={surface.identity.tenantName}
          clinicName={surface.identity.clinicName}
          phone={surface.identity.phone ?? ''}
          address={surface.identity.address ?? ''}
          labels={IDENTITY_FIELDS}
        />
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
        />
      ) : null}

      {tab === SettingsTab.Options ? (
        <OptionsForm
          toggles={surface.options.toggles}
          toggleLabels={TOGGLE_LABELS}
          overrides={surface.options.overrides}
          labels={OPTIONS_FIELDS}
          modules={MODULES}
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
