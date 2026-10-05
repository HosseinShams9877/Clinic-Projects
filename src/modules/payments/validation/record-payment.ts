/**
 * The receipt form's own schema — app-tier validation (`05-conventions.md` §5).
 *
 * A module function receives an already-validated value, and this is the parse the
 * boundary does: the two closed sets (`method`, `kind`) are narrowed here so the
 * module never re-parses a string a form sent. The copy is the module catalog's
 * (`07-localization.md` §7.2 — a form's sentence is the catalog's, not the field's).
 */

import { z } from 'zod'

import { PaymentKind, PaymentMethod, isMember } from '@/core/constants'

import { PAYMENT_FORM_MESSAGES } from '../catalog'

/** The amount as the form collects it — a string, because a Rial input is typed. */
export const paymentAmountField = z
  .string()
  .trim()
  .min(1, { message: PAYMENT_FORM_MESSAGES.amountRequired })
  .refine((value) => /^\d+$/.test(value), { message: PAYMENT_FORM_MESSAGES.amountNotNumber })
  .transform((value) => BigInt(value))

/** The receipt form — the desk's «ثبت پرداخت». */
export const recordPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  amount: paymentAmountField,
  method: z.string().refine((value): value is PaymentMethod => isMember(PaymentMethod, value), {
    message: PAYMENT_FORM_MESSAGES.methodRequired,
  }),
  kind: z.string().refine((value): value is PaymentKind => isMember(PaymentKind, value), {
    message: PAYMENT_FORM_MESSAGES.kindRequired,
  }),
  discountAmount: z
    .string()
    .trim()
    .default('0')
    .transform((value) => BigInt(value || '0')),
  discountReason: z.string().trim().optional().nullable(),
  note: z.string().trim().optional().nullable(),
})

/** The parsed shape a Server Action hands the module. */
export type RecordPaymentForm = z.infer<typeof recordPaymentSchema>

/** A `LocalDate` string a picker collected — the day the debt forms read. */
export const localDateField = z
  .string()
  .trim()
  .min(1, { message: PAYMENT_FORM_MESSAGES.dayRequired })
