/**
 * The Persian sentences and labels `injections` raises and renders.
 *
 * The five closed sets of `core/constants/enums.ts` are the vocabulary of the
 * record; this file is the sentence a reader sees for each code in them, plus the
 * three refusals the module itself can raise.
 */

import type {
  InjectionArea,
  InjectionDepth,
  InjectionMaterial,
  InjectionTechnique,
  InjectionUnit,
} from '@/core/constants'

/** Every catalog key this module can raise. */
export type InjectionsMessageKey =
  | 'injection.customerNotFound'
  | 'injection.notFound'
  | 'injection.illegalValue'

export const MESSAGES: Readonly<Record<InjectionsMessageKey, string>> = {
  'injection.customerNotFound': 'این مشتری پیدا نشد.',
  'injection.notFound': 'این تزریق پیدا نشد.',
  'injection.illegalValue': 'مقدار واردشده در فهرست مجاز نیست.',
}

/** The 18 areas, as the form's select and the table's own row name them. */
export const INJECTION_AREA_LABELS: Readonly<Record<InjectionArea, string>> = {
  RIGHT_CHEEK: 'گونه راست',
  LEFT_CHEEK: 'گونه چپ',
  RIGHT_EYE_HOLLOW: 'گودی زیر چشم راست',
  LEFT_EYE_HOLLOW: 'گودی زیر چشم چپ',
  GLABELLA: 'خط اخم',
  FOREHEAD: 'پیشانی',
  RIGHT_CROW_FEET: 'پنجه کلاغی راست',
  LEFT_CROW_FEET: 'پنجه کلاغی چپ',
  UPPER_LIP: 'لب بالا',
  LOWER_LIP: 'لب پایین',
  CHIN: 'چانه',
  RIGHT_JAWLINE: 'خط فک راست',
  LEFT_JAWLINE: 'خط فک چپ',
  RIGHT_TEMPLE: 'شقیقه راست',
  LEFT_TEMPLE: 'شقیقه چپ',
  NOSE_TIP: 'نوک بینی',
  NASOLABIAL_RIGHT: 'خط خنده راست',
  NASOLABIAL_LEFT: 'خط خنده چپ',
}

/** The seven materials. */
export const INJECTION_MATERIAL_LABELS: Readonly<Record<InjectionMaterial, string>> = {
  HYALURONIC_ACID: 'ژل هیالورونیک اسید',
  BOTOX: 'بوتاکس',
  FAT_GRAFT: 'تزریق چربی',
  MESOTHERAPY: 'مزوتراپی',
  THREAD: 'نخ',
  PRP: 'پی‌آر‌پی',
  SCULPTRA: 'اسکالپترا',
}

/** The five depths. */
export const INJECTION_DEPTH_LABELS: Readonly<Record<InjectionDepth, string>> = {
  SUPRA_PERIOSTEAL: 'عمقی (سوپراپریوستئال)',
  SUBCUTANEOUS: 'زیرجلدی',
  MID_DERMIS: 'درم میانی',
  INTRAMUSCULAR: 'داخل عضلانی',
  DEEP_DERMIS: 'درم عمقی',
}

/** The two techniques. */
export const INJECTION_TECHNIQUE_LABELS: Readonly<Record<InjectionTechnique, string>> = {
  CANNULA: 'کانولا',
  NEEDLE: 'سوزن',
}

/** The two units, as the amount cell's suffix reads. */
export const INJECTION_UNIT_LABELS: Readonly<Record<InjectionUnit, string>> = {
  CC: 'سی‌سی',
  UNIT: 'واحد',
}