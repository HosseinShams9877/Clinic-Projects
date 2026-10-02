/**
 * The constants module of `docs/knowledge/06-constants.md`.
 *
 * §7 rule 1: every value the specification closes is defined **once**, here, and
 * imported everywhere. §7 rule 2: no value in that document may be duplicated as
 * a literal anywhere else in the codebase — a repeated literal is a defect.
 *
 * The folder exists because §1–§6 do not fit in one file under the 1000-line
 * limit of `05-conventions.md` §4, and §4 says to split by responsibility rather
 * than by taking the bottom half. It is still *one* module: this barrel is its
 * only public surface.
 */

export * from './enums'
export * from './modules'
export * from './numbers'
