#!/usr/bin/env node
/**
 * The file-length check of `02-architecture.md` §10 rule 4.
 *
 * > **No file exceeds 1000 lines.** When a file approaches the limit, split by
 * > responsibility, not arbitrarily.
 *
 * Rule 6 says "an ESLint `no-restricted-imports` rule with per-module patterns
 * **plus CI check for file length**. Both are wired in Phase 1", so this is the
 * second half. It is not redundant with the `max-lines` rule in
 * `eslint.config.mjs`: ESLint only sees a file it can **parse**, and a file too
 * large to work with is exactly the file someone is likely to have just broken.
 * This script counts lines in eight lines of code and has no parser at all, so it
 * cannot be the check that fails to run.
 *
 * A third copy of the same limit lives in the `PostToolUse` hook in
 * `.claude/settings.json`, where it stops the file from being written in the first
 * place. Three copies of one number is one copy too many, so the number lives in
 * `06-constants.md` §5 ("Maximum lines per file: **1000**") and is written out
 * here with the citation rather than imported — a check script that could not run
 * because the thing it checks failed to load would be a check that never fails.
 *
 * ## What is checked, and what deliberately is not
 *
 * **Checked:** the source file types the limit was written for — TypeScript,
 * JavaScript, CSS and the Prisma schema. `.css` is included because the design
 * system's token block and a page's module styles are the two files in this
 * repository most likely to grow by accretion.
 *
 * **Not checked:** Markdown. `docs/knowledge/*.md` are the specification's own
 * prose — some are longer than a thousand lines and splitting them would split an
 * argument across two files — and `.claude/settings.json`'s hook excludes `.md`
 * for the same reason. The distinction is stated here rather than left implicit,
 * because "the limit is enforced" and "the limit is enforced on code" are
 * different claims and only the second one is true.
 *
 * **Not checked:** generated files. `prisma/migrations/**` and `src/generated/**`
 * are written by a generator, and a generator's output is not a file anyone is
 * going to split.
 *
 * ## It fails closed
 *
 * A walk that finds nothing is reported as a failure rather than as a pass. A
 * check whose silence means success is a check that reports success when it is
 * pointed at the wrong directory, and this one is run from a script entry point
 * where the working directory is whatever the shell happened to be in.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ── The limit ────────────────────────────────────────────────────────────── */

/** `06-constants.md` §5, and `02-architecture.md` §10 rule 4. */
const MAX_LINES = 1000

/** The repository root, derived from this file's own location. */
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/**
 * Directories never walked: dependencies, build output, caches, and the two
 * tracked source materials.
 */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  '.swc',
  '.cache',
  '.vitest',
  '.vscode',
  '.idea',
  'out',
  'build',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'blob-report',
  'generated',
  'migrations',
  // The UI demo: the product's input, read and never edited.
  'clinic',
  // Agent configuration: prompt text and single-line hook programs.
  '.claude',
])

/** The extensions the limit applies to. See the header. */
const CHECKED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.prisma',
])

/* ── The walk ─────────────────────────────────────────────────────────────── */

/** Every checked file under `directory`, recursively. */
function collectFiles(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      found.push(...collectFiles(join(directory, entry.name)))
      continue
    }
    if (!entry.isFile()) continue
    if (CHECKED_EXTENSIONS.has(extname(entry.name))) {
      found.push(join(directory, entry.name))
    }
  }
  return found
}

/**
 * A file's line count.
 *
 * A trailing newline does not start a new line — a 1000-line file ends with one and
 * must not be reported as 1001. `\r\n` is handled so that the count does not depend
 * on how the file was checked out, which on Windows it otherwise would.
 */
function countLines(contents) {
  const lines = contents.split(/\r\n|\r|\n/)
  if (lines[lines.length - 1] === '') lines.pop()
  return lines.length
}

/* ── The check ────────────────────────────────────────────────────────────── */

const files = collectFiles(ROOT)

if (files.length === 0) {
  console.error(
    `No checked files found under ${ROOT}. The walk is pointed somewhere it cannot see any source, ` +
      `which is a failure rather than an empty pass.`,
  )
  process.exit(1)
}

const overLimit = []
for (const file of files) {
  const lines = countLines(readFileSync(file, 'utf8'))
  if (lines > MAX_LINES) {
    overLimit.push({ path: relative(ROOT, file).split(sep).join('/'), lines })
  }
}

/* ── The report ───────────────────────────────────────────────────────────── */

if (overLimit.length === 0) {
  console.log(`File length: ${files.length} files checked, none over ${MAX_LINES} lines.`)
  process.exit(0)
}

// Worst first: the file that most needs splitting is the one to open first.
overLimit.sort((left, right) => right.lines - left.lines)

console.error(`File length: ${overLimit.length} of ${files.length} files exceed ${MAX_LINES} lines.`)
for (const { path, lines } of overLimit) {
  console.error(`  ${path} — ${lines} lines (${lines - MAX_LINES} over)`)
}
console.error(
  '\nSplit by responsibility, not by taking the bottom half. ' +
    '(docs/knowledge/02-architecture.md §10 rule 4, docs/knowledge/06-constants.md §5)',
)
process.exit(1)
