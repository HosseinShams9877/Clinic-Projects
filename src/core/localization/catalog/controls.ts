/**
 * The two form controls' own Persian labels.
 *
 * `05-conventions.md` §14 makes a Persian string literal in a component a finding,
 * and the catalog is the closed list `07-localization.md` §7.2 draws. A control is
 * not a surface and has no module, so its labels have nowhere to live except this
 * layer — the same exemption the error sentences of two core modules take in
 * `common.ts` ("a key raised from a second core module still needs a catalog to live
 * in, and `common` is the catalog for messages that belong to no domain module").
 *
 * This file is the controls' equivalent: a date picker's month buttons and its
 * unchosen placeholder are labels that belong to no module, and putting them here is
 * what keeps a control from being a second place Persian copy lives.
 *
 * Nothing here is shared between the two controls. `common.ts` holds the vocabulary
 * every surface uses — the months, the weekdays, the currency — and a label only one
 * control reads is a label that control owns, in the namespace named for it.
 */

/**
 * The Jalali date picker's three labels.
 *
 * `nextMonth` and `previousMonth` are the two month buttons' `aria-label`s, because
 * a bare chevron announces as nothing and the label is what makes the button's
 * purpose reachable from a keyboard and a screen reader (`08-ui-design-system.md`'s
 * icon rule). `chooseDate` is the trigger's accessible name before a date is chosen,
 * so the button announces «انتخاب تاریخ» and not "button".
 */
export const DATE_PICKER_LABELS = {
  nextMonth: 'ماه بعد',
  previousMonth: 'ماه قبل',
  chooseDate: 'انتخاب تاریخ',
} as const

/** One of the date picker's labels, so the control reads its own type and not a string. */
export type DatePickerLabel = (typeof DATE_PICKER_LABELS)[keyof typeof DATE_PICKER_LABELS]
