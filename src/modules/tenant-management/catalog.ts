/**
 * The Persian surface of the tenant administration module.
 *
 * Active only when `MULTI_TENANT=true`; in single-tenant mode the module's routes
 * are unreachable and none of this renders, so the copy is the SaaS operator's
 * rather than a clinic's.
 */

/** The list's columns and the page's own sentences. */
export const TENANT_MANAGEMENT_FIELDS = Object.freeze({
  title: 'مدیریت کلینیک‌ها',
  lead: 'کلینیک‌هایی که این نمونه از پلتفرم را به اشتراک می‌گذارند.',
  slug: 'نام دامنه',
  name: 'نام کلینیک',
  clinics: 'شعبه‌ها',
  members: 'کاربران',
  status: 'وضعیت',
  active: 'فعال',
  suspended: 'معلق',
  provision: 'ایجاد کلینیک جدید',
  suspend: 'تعلیق',
  reactivate: 'فعال‌سازی دوباره',
  branches: 'شعبه‌ها',
  save: 'ذخیره',
  empty: 'هنوز کلینیکی ایجاد نشده است.',
}) satisfies Record<string, string>

export const PROVISION_FIELDS = Object.freeze({
  slug: 'نام دامنه',
  name: 'نام کلینیک',
  managerMobile: 'موبایل مدیر',
  managerFirstName: 'نام مدیر',
  managerLastName: 'نام خانوادگی مدیر',
  temporaryPassword: 'رمز عبور موقت',
  clinicName: 'نام شعبه اصلی',
  submit: 'ایجاد کلینیک',
}) satisfies Record<string, string>

/** The statuses a tenant's row holds, and the label each renders. */
export const TENANT_STATUS_LABELS = Object.freeze({
  ACTIVE: 'فعال',
  SUSPENDED: 'معلق',
}) satisfies Record<string, string>

/** Every message the tenant administration actions can raise. */
export type TenantManagementMessageKey =
  | 'tenant.provisioned'
  | 'tenant.suspended'
  | 'tenant.reactivated'
  | 'tenant.slugTaken'
  | 'tenant.cannotSuspendLastManager'

export const MESSAGES: Readonly<Record<TenantManagementMessageKey, string>> = Object.freeze({
  'tenant.provisioned': 'کلینیک ایجاد شد و مدیر اولیه آن آماده ورود است.',
  'tenant.suspended': 'کلینیک معلق شد. کاربران آن دیگر نمی‌توانند وارد شوند.',
  'tenant.reactivated': 'کلینیک دوباره فعال شد.',
  // The slug is the tenant's address, so a duplicate is an address already served.
  'tenant.slugTaken': 'این نام دامنه قبلاً گرفته شده است.',
  // A tenant with no active manager is a tenant nobody can administer.
  'tenant.cannotSuspendLastManager':
    'این کلینیک فقط یک مدیر فعال دارد و نمی‌تواند معلق شود.',
})
