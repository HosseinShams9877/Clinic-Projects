#!/usr/bin/env node
/**
 * The localization check — `07-localization.md` §9, `10-testing-strategy.md` §10.
 *
 * §9 states the testing obligations for this layer. Three of them are decided from
 * the source, and this script is where they are decided:
 *
 * | §9 obligation | Where it is enforced |
 * |---|---|
 * | No Persian string literal in a component | this script, rules 1–2 |
 * | No inline formatting (`Intl`, `toLocale*`) | this script, rules 1–2 |
 * | No untranslated keys — every enum member has a label | this script, rule 3 |
 * | No Latin digits in any **rendered** surface | `e2e/`, against the DOM |
 * | No Latin or Gregorian date in the UI | `e2e/`, against the DOM |
 * | Jalali round-trip and anchor tests | `src/core/localization/tests/jalali.test.ts` |
 * | The week starts on Saturday | `src/core/localization/tests/calendar.test.ts` |
 * | Bidi isolation of a phone number | `src/core/localization/tests/format.test.ts` |
 *
 * The two rows that belong to the DOM are there on purpose, and §9 is explicit about
 * why: "a test scans rendered output across the 35 pages and fails on `[0-9]` in
 * user-visible text". A Latin digit in a **string literal** is usually not a
 * violation — a `data-testid`, an `aria-level`, a duration in milliseconds — so a
 * static rule that flagged every one would be noise, and the honest place to catch a
 * Latin digit is the page where it is rendered.
 *
 * ## Why rules 1 and 2 delegate to ESLint rather than to a regular expression
 *
 * Deciding "this is a Persian string literal" needs a parser. A regular expression
 * over the file text cannot tell a Persian word in a **comment** — of which this
 * codebase has hundreds, because citing in Persian is its documentation style — from
 * one in a `title=` attribute. A check that cannot tell those apart is a check that
 * gets switched off, so this script **runs the same selectors `npm run lint` runs**,
 * imported from `eslint.config.mjs`, and keeps the localization findings.
 *
 * One definition, two entry points. `check:i18n` is its own command because a
 * localization regression should be reported as a localization failure with its
 * citations, not as one line among a hundred lint messages — the same reason
 * `eslint-config-next` publishes `core-web-vitals` separately from `recommended`.
 */

import { ESLint } from 'eslint'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LOCALIZATION_SELECTORS, RENDER_FILES } from '../eslint.config.mjs'

/* ── The repository ───────────────────────────────────────────────────────── */

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** A path as this script reports it: relative to the root, always forward-slashed. */
const repoPath = (absolute) => relative(ROOT, absolute).split(sep).join('/')

/* ── Rules 1 and 2: the source rules, run through the real config ─────────── */

/**
 * The exact messages of the localization selectors.
 *
 * Filtering on the message text rather than on a rule id is what keeps this precise:
 * `no-restricted-syntax` carries the clock rule as well, and a read of the ambient
 * clock is not a localization failure. The set is derived from the selector list, so
 * adding a selector adds it here with no second edit.
 */
const LOCALIZATION_MESSAGES = new Set(LOCALIZATION_SELECTORS.map((selector) => selector.message))

/**
 * Lint the render files with `eslint.config.mjs` itself, and keep the findings that
 * came from a localization selector.
 *
 * The real config file is used rather than a synthesized one so that the parser, the
 * ignore list and the scopes are all the ones `npm run lint` uses — a second config
 * would be a second answer to the same question.
 *
 * A file ESLint **could not parse** is reported as a finding of this check too. Its
 * localization rules were never evaluated, so passing it silently would mean the
 * check reports success on exactly the file it could not read.
 */
async function collectSourceFindings() {
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: 'eslint.config.mjs' })
  const results = await eslint.lintFiles(RENDER_FILES)

  const findings = []
  for (const result of results) {
    for (const message of result.messages) {
      const path = repoPath(result.filePath)
      const line = message.line ?? 1
      const column = message.column ?? 1

      if (message.fatal === true) {
        findings.push({
          path,
          line,
          column,
          message: `\`${path}\` could not be parsed (${message.message}), so its localization rules were never evaluated. A file this check cannot read is a failure, not a pass.`,
        })
        continue
      }

      if (message.ruleId !== 'no-restricted-syntax') continue
      if (!LOCALIZATION_MESSAGES.has(message.message)) continue
      findings.push({ path, line, column, message: message.message })
    }
  }
  return findings
}

/* ── Rule 3: every set that is rendered has a complete label record ───────── */

/**
 * The closed sets §9's "no untranslated keys" obligation is enforced for.
 *
 * The list is written here rather than derived, and that is the point: a set belongs
 * on it once something renders it, and everything on it must pass. A closed set that
 * nothing renders yet is added when the module that renders it lands — in the same
 * commit, which is the moment a missing label would otherwise ship.
 *
 * `Role` and `Permission` are on it in Phase 1 because the permission primitive
 * renders both the role a member of staff holds and the capabilities being granted.
 */
const REQUIRED_LABEL_SETS = ['Role', 'Permission']

/** The closed sets, read out of `src/core/constants/enums.ts`. */
function readClosedSets() {
  const source = readFileSync(join(ROOT, 'src/core/constants/enums.ts'), 'utf8')
  const sets = new Map()
  for (const match of source.matchAll(/export const (\w+) = \{([\s\S]*?)\} as const/g)) {
    const [, name, body] = match
    sets.set(name, new Set([...body.matchAll(/'([^']*)'/g)].map((member) => member[1])))
  }
  return sets
}

/** `PERMISSION_LABELS` → `Permission`; `APPOINTMENT_STATUS_LABELS` → `AppointmentStatus`. */
function setForRecord(recordName) {
  return recordName
    .slice(0, -'_LABELS'.length)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

/**
 * Every `*_LABELS` record in every catalog file, keyed by record name.
 *
 * A record is read as text rather than imported because this is a `.mjs` script and
 * the catalogs are TypeScript. That is a real limitation and it is why the record's
 * *shape* is not checked here: `Record<Role, string>` is what makes a missing key a
 * compile error, and the type checker owns that. What text can still get wrong is a
 * key that compiles because the record was typed loosely, or a label added for a
 * member that was since renamed — so that is what rule 3 checks.
 */
function readLabelRecords() {
  const records = new Map()
  const catalogFiles = []

  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'tests') continue
        walk(join(directory, entry.name))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
      if (entry.name.includes('.test.')) continue
      // A catalog is a file named `catalog.ts`, or any file inside a `catalog/`.
      const path = repoPath(join(directory, entry.name))
      if (!/(^|\/)catalog\.ts$|\/catalog\//.test(path)) continue
      catalogFiles.push(path)
    }
  }
  walk(join(ROOT, 'src'))

  for (const path of catalogFiles) {
    const source = readFileSync(join(ROOT, path), 'utf8')
    for (const match of source.matchAll(/export const (\w+_LABELS)\b[^=]*= \{([\s\S]*?)\n\}/g)) {
      const [, name, body] = match
      if (records.has(name)) continue
      records.set(name, {
        path,
        keys: new Set([...body.matchAll(/^\s*(\w+):/gm)].map((key) => key[1])),
      })
    }
  }

  return { records, catalogFiles }
}

/** A missing label, an orphan label, or a check that has drifted from the constants. */
function collectLabelFindings(records) {
  const sets = readClosedSets()
  const findings = []

  const recordFor = (setName) => {
    for (const [recordName, record] of records) {
      if (setForRecord(recordName) === setName) return { recordName, ...record }
    }
    return undefined
  }

  for (const setName of REQUIRED_LABEL_SETS) {
    const members = sets.get(setName)
    if (members === undefined) {
      findings.push({
        path: 'scripts/check-i18n.mjs',
        line: REQUIRED_LABEL_SETS.indexOf(setName) + 1,
        column: 1,
        message: `\`REQUIRED_LABEL_SETS\` names \`${setName}\`, which is not an exported closed set in \`src/core/constants/enums.ts\`. This check is out of step with the constants.`,
      })
      continue
    }

    const record = recordFor(setName)
    if (record === undefined) {
      findings.push({
        path: 'scripts/check-i18n.mjs',
        line: REQUIRED_LABEL_SETS.indexOf(setName) + 1,
        column: 1,
        message: `\`${setName}\` is rendered, so it needs a \`${setName.toUpperCase()}_LABELS\` record in a catalog, and none was found in any catalog file. A set with no labels renders as blanks. (docs/knowledge/07-localization.md §9)`,
      })
      continue
    }

    for (const member of members) {
      if (record.keys.has(member)) continue
      findings.push({
        path: record.path,
        line: 1,
        column: 1,
        message: `\`${record.recordName}\` has no label for \`${member}\`. (docs/knowledge/07-localization.md §9)`,
      })
    }
    for (const key of record.keys) {
      if (members.has(key)) continue
      findings.push({
        path: record.path,
        line: 1,
        column: 1,
        message: `\`${record.recordName}\` labels \`${key}\`, which is not a member of \`${setName}\`. A label with no set member is copy nothing can render. (docs/knowledge/07-localization.md §9)`,
      })
    }
  }

  return findings
}

/* ── The report ───────────────────────────────────────────────────────────── */

const { records, catalogFiles } = readLabelRecords()

const findings = [...(await collectSourceFindings()), ...collectLabelFindings(records)]

if (findings.length === 0) {
  console.log(
    `Localization: clean. ` +
      `${RENDER_FILES.join(', ')} scanned for Persian literals and inline formatting; ` +
      `${catalogFiles.length} catalog file(s) checked for complete labels on ${REQUIRED_LABEL_SETS.join(' and ')}.`,
  )
  process.exit(0)
}

console.error(`Localization: ${findings.length} findings.`)
for (const finding of findings) {
  console.error(`  ${finding.path}:${finding.line}:${finding.column}  ${finding.message}`)
}
process.exit(1)
