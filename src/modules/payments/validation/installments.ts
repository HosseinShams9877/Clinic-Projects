import { z } from 'zod'

export const installmentPlanSchema = z.object({
  customerId: z.string().min(1),
  appointmentId: z.string().optional(), // بستگی به منطق پروژه‌ت داره
  amount: z.coerce.bigint().positive(),
  sequence: z.coerce.number().int().positive(),
  dueAt: z.string().min(1),
  note: z.string().optional(),
})

export type InstallmentPlanForm = z.infer<typeof installmentPlanSchema>