/**
 * The doctor panel's own extra copy — the dashboard's KPI tiles and the leave form,
 * and the cycles page's KPI tiles.
 *
 * The main app catalog is at its line cap, so the doctor-panel surfaces Task 5 adds
 * keep their Persian here. The lint allowlist covers this per-directory catalog file.
 */

/** The doctor dashboard's three KPI tiles and the «اعلام مرخصی» card. */
export const DOCTOR_DASHBOARD = {
  kpi: {
    today: 'نوبت امروز من',
    doneSoFar: 'انجام‌شده تا این لحظه',
    activeCycles: 'دوره درمان فعال من',
  },
  leave: {
    title: 'اعلام مرخصی',
    lead: 'بازه‌ای که در دسترس نیستید را اعلام کنید؛ پس از تأیید مدیر، نوبت‌دهی آن روزها بسته می‌شود.',
    from: 'از تاریخ',
    to: 'تا تاریخ',
    reason: 'توضیح (اختیاری)',
    submit: 'ثبت درخواست مرخصی',
    sent: 'درخواست مرخصی ثبت شد و برای تأیید مدیر ارسال شد.',
    invalid: 'بازه مرخصی نامعتبر است: تاریخ پایان باید بعد از تاریخ شروع باشد.',
  },
} as const

/** The doctor cycles page's three KPI tiles. */
export const DOCTOR_CYCLES = {
  kpi: {
    active: 'دوره فعال',
    overdue: 'عقب‌افتاده',
    completionRate: 'نرخ تکمیل دوره من',
  },
} as const
