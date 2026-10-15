/**
 * The injection map's own geometry — the eighteen points and the seven colours.
 */

import type {
  InjectionArea,
  InjectionMaterial,
} from '@/core/constants'

/** One point on the face, in the SVG's own `120 8 420 534` coordinate space. */
export interface FacePoint {
  readonly x: number
  readonly y: number
}

/**
 * Every area's position on the face.
 *
 * Positions projected into the `120 8 420 534` space used by the inline face
 * (ears at x≈190/505, chin at y≈535, hairline at y≈20).
 *
 * NOTE: اگر تصویر `public/face-map.png` با فریم متفاوتی برش خورده،
 * این مختصات باید دوباره کالیبره بشن.
 */
export const INJECTION_AREA_POINTS: Readonly<Record<InjectionArea, FacePoint>> = {
  // پیشانی — وسط
  FOREHEAD: { x: 330, y: 155 },

  // گلابلا — بین دو ابرو
  GLABELLA: { x: 330, y: 220 },

  // شقیقه‌ها
  RIGHT_TEMPLE: { x: 415, y: 200 },
  LEFT_TEMPLE:  { x: 245, y: 200 },

  // گودی زیر چشم‌ها
  RIGHT_EYE_HOLLOW: { x: 420, y: 320 },
  LEFT_EYE_HOLLOW:  { x: 240, y: 320 },

  // گوشه‌ی خارجی چشم‌ها
  RIGHT_CROW_FEET: { x: 460, y: 285 },
  LEFT_CROW_FEET:  { x: 200, y: 285 },

  // نوک بینی — دست‌نخورده، همون مقداری که Ok بود
  NOSE_TIP: { x: 330, y: 345 },

  // گونه‌ها
  RIGHT_CHEEK: { x: 415, y: 390 },
  LEFT_CHEEK:  { x: 235, y: 390 },

  // چین‌های نازولیبیال (خط خنده)
  NASOLABIAL_RIGHT: { x: 355, y: 400 },
  NASOLABIAL_LEFT:  { x: 255, y: 400 },

  // لب بالا — هم‌راستا با بینی
  UPPER_LIP: { x: 330, y: 400 },

  // لب پایین
  LOWER_LIP: { x: 330, y: 425 },

  // چانه
  CHIN: { x: 330, y: 465 },

  // خط فک
  RIGHT_JAWLINE: { x: 430, y: 440 },
  LEFT_JAWLINE:  { x: 230, y: 440 },
}

export const INJECTION_MATERIAL_COLORS: Readonly<Record<InjectionMaterial, string>> = {
  HYALURONIC_ACID: '#b56b6b',
  BOTOX: '#4f7fa8',
  FAT_GRAFT: '#d99a4e',
  MESOTHERAPY: '#3f8f68',
  THREAD: '#8e4c4c',
  PRP: '#9b6fb0',
  SCULPTRA: '#6e5f5b',
}

/** The colour a material the map does not know is painted with. */
export const MATERIAL_FALLBACK = '#6e5f5b'