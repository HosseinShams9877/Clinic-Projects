# ADR-0008 — Money as `BigInt` Rial, serialised as a string

> Part of the decision log. Index: [`roadmap/decisions.md`](../decisions.md).

**Status:** Accepted · Phase 0

**Context.** The product handles prices, deposits, payments, discounts and
balances. A floating-point error in a clinic's balance is a customer-visible
dispute.

**Decision.** **All money is `BigInt` in Rial.** Never a float, never a JS
`Number`. Serialised as a **string** across every JSON boundary. Rendered in
Toman (Rial ÷ 10) with Persian digits and the `٬` separator.

**Why Rial and not Toman.** Rial is the unit the payment gateways and the SMS
billing operate in. Storing the display unit and multiplying at the boundary
introduces a rounding decision in a dozen places; storing the base unit
introduces none.

**Why `BigInt` and not `number`.** A JS `number` is a double: it is exact only to
2⁵³. Money arithmetic that is exact today becomes inexact at a scale nobody
watches for, and the failure is a one-Rial difference that compounds. `BigInt`
maps to `INTEGER` on SQLite and `BIGINT` on PostgreSQL, both of which are
portable (ADR-0007).

**Why a string across JSON.** `JSON.stringify` throws on a `BigInt`, and
`JSON.parse` would produce a `number` and silently lose precision. A string is
the only lossless representation both sides understand.

**Consequences accepted.**

- Every arithmetic operation goes through `src/core/lib/money.ts`. Inline `+` on
  an amount is a finding (`05-conventions.md` §8).
- Every formatter and every consumer must expect a string. The type is branded so
  a raw `string` cannot be passed where a money string is expected.
- A `number` appearing near an amount is a review finding, without exception.

**Documented in.** `03-data-model.md` §3.3, `05-conventions.md` §8.
