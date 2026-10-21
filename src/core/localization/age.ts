import { toPersianDigits } from './digits'

/**
 * محاسبه سن بر اساس تاریخ تولد (به صورت رشته)
 * @param birthDateStr تاریخ تولد (مثلاً "1370/01/01")
 * @returns سن به صورت رشته با اعداد فارسی
 */
export function calculateAge(birthDateStr: string): string {
  try {
    const birth = new Date(birthDateStr)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return toPersianDigits(age)
  } catch {
    return '—'
  }
}