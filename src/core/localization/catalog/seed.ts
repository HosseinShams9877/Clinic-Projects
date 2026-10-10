/**
 * The development dataset's Persian text — `prisma/seed.ts`'s only source of names.
 *
 * `05-conventions.md` §14 makes a Persian string literal outside the catalog a
 * finding, and the catalog is the closed list `07-localization.md` §7.2 draws:
 * this directory, a module's `catalog.ts`, and `src/app/catalog.ts`. `prisma/seed.ts`
 * is none of them, so the names it writes to the database are declared here and the
 * seed imports them — the rule is what keeps the development database from becoming
 * a second place Persian copy lives, spelled by whoever ran the seed.
 *
 * ## What belongs here, and what does not
 *
 * The **text** of the dataset: the tenants' names, the branches' names, and the
 * people's names. Nothing else. The seed keeps everything that is not Persian —
 * slugs, mobiles, roles, lifecycles, dates — because those are data the seed owns
 * for the same reason the constants module owns the closed sets: they are structure,
 * not copy.
 *
 * The join between the two files is by **key**, not by position. The seed holds its
 * own facts keyed as the records below are keyed, and a key the seed names that this
 * file does not is a runtime error before a single row is written — which is the
 * failure mode a positional join silently gets wrong, pairing a person with another
 * person's mobile.
 *
 * ## Why the staff are listed in role order
 *
 * One manager, three doctors, two secretaries — `installation.md` §5's shape with
 * a third doctor so the reception grid shows three columns like the demo. The seed
 * assigns the role by position, from the canonical list, so a role never appears as
 * a re-typed string in the seed and the two files cannot disagree about which person
 * holds which role.
 *
 * ## The ZWNJ
 *
 * Two of the surnames are compounds — «حسن‌زاده» and «احمد‌زاده» — and both are
 * spelled through the constant rather than as the literal character, for the reason
 * `WEEKDAY_NAMES` in `common.ts` gives at length: U+200C is invisible, survives a
 * copy-paste through a terminal and a formatter with nobody noticing, and the
 * run-together spelling that is left behind reads as a spacing error while being a
 * *different string* from the one the normaliser and the search index agree on. A
 * seeded surname that lost its joiner would be a customer a search for «حسن‌زاده»
 * does not find, which is exactly the defect `normalize.ts` exists to prevent — and
 * here it would be caused by the dataset rather than merely uncaught by it.
 *
 * ## Why the names are invented
 *
 * `09-security.md` §5: "No real clinic data is ever used in development." The four
 * names `admin/staff.html` carries — آرش کیانی, سارا نادری, مریم صالحی, سحر رحیمی —
 * are the demo's, not a clinic's, and they are reused here so the development
 * database and the documented permission matrix (`04-roles-permissions.md` §2.2's
 * live examples) name the same people. The rest are invented, and the two tenants'
 * staff are different people except the one the isolation fixture needs, whom the
 * seed names identically in both.
 */

import { ZWNJ } from '../digits'

/**
 * One person the seed writes, named.
 *
 * `key` is the join to the seed's facts. It is a slug — Latin, kebab-case — because a
 * key the seed reads is not copy and is never rendered.
 */
export interface SeedName {
  readonly key: string
  readonly firstName: string
  readonly lastName: string
}

/**
 * The Persian text of one tenant's development dataset.
 *
 * `staff` is in role order: manager, doctor, doctor, doctor, secretary, secretary.
 * The seed asserts the length, so a seventh person added here is a seed failure
 * rather than a person seeded with another person's role.
 */
export interface SeedTenantText {
  readonly key: string
  /** The tenant's display name, «نام کلینیک». */
  readonly name: string
  /** The one branch the tenant's staff hold their membership in. */
  readonly clinic: string
  readonly staff: readonly SeedName[]
  readonly customers: readonly SeedName[]
}

/** One service name of the development grid dataset, joined to its facts by `key`. */
export interface SeedServiceName {
  readonly key: string
  readonly name: string
}

/**
 * The four services the reception grid dataset books against (`aria` tenant only).
 *
 * Only the Persian names live here; the price, deposit, duration and cycle facts are
 * non-text and stay in `prisma/seed.ts`, joined to these by `key`.
 */
export const SEED_SERVICES: readonly SeedServiceName[] = [
  { key: 'facial', name: 'فیشیال تخصصی' },
  { key: 'meso', name: 'مزوتراپی' },
  { key: 'laser', name: 'لیزر موهای زائد' },
  { key: 'filler', name: 'تزریق ژل و بوتاکس' },
]

/**
 * The two tenants of the development dataset.
 *
 * Two, and not one, because `10-testing-strategy.md` §13 asks for "two tenants
 * minimum in every isolation test, seeded deterministically", and a seed that
 * produced one tenant would produce a suite that could not be written against it.
 * The two are deliberately similar in shape — same staff count, same customer count —
 * so that a query that leaks across tenants returns a recognisable number of rows
 * rather than a number a test has to explain.
 */
export const SEED_TENANTS: readonly SeedTenantText[] = [
  {
    key: 'aria',
    name: 'کلینیک زیبایی آریا',
    clinic: 'مرکزی',
    staff: [
      { key: 'sina-ahmadi', firstName: 'سینا', lastName: 'احمدی' },
      // The shared fixture. This person is seeded in both tenants under the same key
      // and the same mobile, which is the pairing §13's isolation probe is built from.
      { key: 'arash-kiani', firstName: 'آرش', lastName: 'کیانی' },
      { key: 'sara-naderi', firstName: 'سارا', lastName: 'نادری' },
      { key: 'reza-shirazi', firstName: 'رضا', lastName: 'شیرازی' },
      { key: 'maryam-salehi', firstName: 'مریم', lastName: 'صالحی' },
      { key: 'sahar-rahimi', firstName: 'سحر', lastName: 'رحیمی' },
    ],
    customers: [
      { key: 'niloufar-hassanzadeh', firstName: 'نیلوفر', lastName: `حسن${ZWNJ}زاده` },
      { key: 'ali-mohammadrezaei', firstName: 'علی', lastName: 'محمدرضایی' },
      { key: 'fatemeh-karimi', firstName: 'فاطمه', lastName: 'کریمی' },
      { key: 'hossein-setari', firstName: 'حسین', lastName: 'ستاری' },
      { key: 'zahra-mirzadeh', firstName: 'زهرا', lastName: `میر${ZWNJ}زاده` },
      { key: 'mohammad-jafari', firstName: 'محمد', lastName: 'جعفری' },
      // The two leads, so the lead cartable is not empty in development.
      { key: 'arman-noori', firstName: 'آرمان', lastName: 'نوری' },
      { key: 'dara-ghanbari', firstName: 'دارا', lastName: 'قنبری' },
    ],
  },
  {
    key: 'parsian',
    name: 'کلینیک زیبایی پارسیان',
    clinic: 'غرب',
    staff: [
      { key: 'pouya-asadi', firstName: 'پویا', lastName: 'اسدی' },
      { key: 'arash-kiani', firstName: 'آرش', lastName: 'کیانی' },
      { key: 'leila-mousavi', firstName: 'لیلا', lastName: 'موسوی' },
      { key: 'hossein-tehrani', firstName: 'حسین', lastName: 'تهرانی' },
      { key: 'elham-rezaei', firstName: 'الهام', lastName: 'رضایی' },
      { key: 'negar-abdi', firstName: 'نگار', lastName: 'عبدی' },
    ],
    customers: [
      { key: 'parisa-ghaffari', firstName: 'پریسا', lastName: 'غفاری' },
      { key: 'bahrud-mirzaei', firstName: 'بهراد', lastName: 'میرزایی' },
      { key: 'shokoufeh-rostami', firstName: 'شکوفه', lastName: 'رستمی' },
      { key: 'kian-abbasi', firstName: 'کیان', lastName: 'عباسی' },
      { key: 'mahsa-doostdar', firstName: 'مهسا', lastName: 'دوستدار' },
      { key: 'amir-taheri', firstName: 'امیر', lastName: 'طاهری' },
      { key: 'sarina-ahmadzadeh', firstName: 'سارینا', lastName: `احمد${ZWNJ}زاده` },
      { key: 'nima-afshar', firstName: 'نیما', lastName: 'افشار' },
    ],
  },
]