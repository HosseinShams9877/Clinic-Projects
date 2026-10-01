---
description: Check the module boundaries, file sizes, imports and forbidden patterns
allowed-tools: Read, Glob, Grep, Bash
---

Audit the repository against the structural rules in
`docs/knowledge/02-architecture.md` §10 and `docs/knowledge/05-conventions.md`.
Report findings; **do not fix anything** unless asked.

If `src/` does not exist yet, say so in one line and stop — there is nothing to
check. (As of Phase 0 the repository is documentation only, so this is the
expected result.)

Work through each check and report **counts and locations**, not impressions.

## 1. The 1000-line limit

Find every source file over 1000 lines.

```
Glob **/*.{ts,tsx,js,jsx,css}
```

For each file over the limit: its path, its line count, and a suggested split
**by responsibility** — guided by the module's own subfolders (`components/`,
`lib/`, `validation/`, `types/`, `hooks/`, `api/`). **Never propose splitting by
taking the bottom half.**

Report the largest ten files even if all are under the limit — a file at 940
lines is the next finding.

## 2. Cross-module imports

Find deep imports into another module:

```
Grep "@/modules/[a-z-]+/" --glob "src/**"
```

A legal import is `@/modules/<name>` (the barrel). An illegal one is
`@/modules/<name>/lib/...`, `/components/...`, `/types/...` — anything past the
barrel.

Also check the other direction: `src/core/**` importing from `src/modules/**`.
That is forbidden (`core` never depends on `modules`).

For each finding: the importing file, the imported path, and which two modules
are coupled.

## 3. Missing barrels

Every module in `docs/knowledge/02-architecture.md` §7 must have an `index.ts`.
List any module folder without one, and any module in the documents that has no
folder.

## 4. The forbidden patterns

Count and locate each:

| Pattern | Search |
|---|---|
| `any` | `: any`, `<any>`, `as any` |
| `enum` | `^\s*enum ` |
| Empty catch | `catch\s*\([^)]*\)\s*\{\s*\}` |
| `TODO` / `FIXME` | `TODO\|FIXME\|TBD\|coming soon` |
| Physical CSS properties | `margin-left\|margin-right\|padding-left\|padding-right\|text-align:\s*left\|border-left\|border-right` |
| Hard-coded hex | `#[0-9a-fA-F]{3,8}\b` outside the token file |
| Tailwind palette classes | `(bg\|text\|border)-(rose\|gray\|slate\|zinc\|red\|blue\|green)-\d` |
| `console.log` | `console\.(log\|debug\|info)` outside the logger |
| Raw `new Date()` | `new Date\(\)` in `lib/` or `modules/*/lib/` |
| Money as a number | `number` near `price`, `amount`, `balance`, `rial`, `toman` |

For the hex and Tailwind checks, exclude `docs/`, the token definition file, and
`08-ui-design-system.md` — the design system's own values are legitimate there.

## 5. Tenant-scoped queries

For each model in `docs/knowledge/03-data-model.md` that carries a `tenantId`,
check that every query against it either goes through the Prisma client extension
or filters on the tenant. Flag any query that does neither.

This is the highest-severity check in this command. Report it first if it has
findings.

## 6. Report

```
## File size
  Over 1000:  <n>   <paths>
  Largest:    <path> (<n> lines)

## Boundaries
  Deep cross-module imports:  <n>
  core → modules imports:     <n>
  Missing barrels:            <n>

## Forbidden patterns
  <pattern>: <count>   <locations>

## Tenant scope
  Queries without a tenant predicate: <n>
```

Then, for each finding: the file, the line, and **the rule it breaks**, cited by
document and section. A finding without a citation reads as taste.

**Counts, not adjectives.** "Three deep imports" is a report; "the boundaries are
somewhat loose" is not.
