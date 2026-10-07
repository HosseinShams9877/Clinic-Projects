/**
 * The Persian surface of the dashboard module.
 *
 * `05-conventions.md` §14 puts every Persian literal in a catalog, and the manager's
 * home is the one surface whose sentences are all counts — a label here names the
 * thing counted, never the thing it is worth.
 */

/** The home's own name and scope, as the page renders them. */
export const DASHBOARD_FIELDS = Object.freeze({
  title: 'داشبورد من',
  lead: 'نگاهی به امروز و این ماهِ کلینیک.',
  today: 'امروز',
  month: 'این ماه',
  todayTotal: 'کل نوبت‌های امروز',
  completed: 'انجام شده',
  noShows: 'عدم حضور',
  awaitingArrival: 'در انتظار ورود',
  newCustomers: 'مشتریان جدید',
  cyclesCompleted: 'دوره‌های کامل شده',
  cyclesAbandoned: 'دوره‌های رها شده',
  /** The queue the overdue sweep raises, as the home's one call to action. */
  overdueCycles: 'دوره‌های عقب افتاده',
  dormantCustomers: 'مشتریان خوابیده',
  overdueLead: 'هشدارها',
}) satisfies Record<string, string>
