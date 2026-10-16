/**
 * The injection map's own geometry — the eighteen points and the seven colours.
 */

import type {
  InjectionArea,
  InjectionMaterial,
} from '@/core/constants'

/** One point on the face, in the SVG's own `400 85 650 900` coordinate space. */
export interface FacePoint {
  readonly x: number
  readonly y: number
}


export const INJECTION_AREA_POINTS: Readonly<Record<InjectionArea, FacePoint>> = {
  FOREHEAD: { x: 725, y: 260 },
  GLABELLA: { x: 725, y: 430 },
  RIGHT_TEMPLE: { x: 890, y: 350 },
  LEFT_TEMPLE:  { x: 560, y: 350 },
  RIGHT_EYE_HOLLOW: { x: 815, y: 530 },
  LEFT_EYE_HOLLOW:  { x: 635, y: 530 },
  RIGHT_CROW_FEET: { x: 920, y: 470 },
  LEFT_CROW_FEET:  { x: 530, y: 470 },
  NOSE_TIP: { x: 725, y: 600 },
  RIGHT_CHEEK: { x: 850, y: 590 },
  LEFT_CHEEK:  { x: 640, y: 590 },
  NASOLABIAL_RIGHT: { x: 820, y: 680 },
  NASOLABIAL_LEFT:  { x: 630, y: 680 },
  UPPER_LIP: { x: 725, y: 680 },
  LOWER_LIP: { x: 725, y: 730 },
  CHIN: { x: 725, y: 820 },
  RIGHT_JAWLINE: { x: 855, y: 745 },
  LEFT_JAWLINE:  { x: 595, y: 745 },
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