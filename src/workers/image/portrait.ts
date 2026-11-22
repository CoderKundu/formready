import type { Rect, Size } from './geometry'

// Plans a passport-style crop around a detected face. Pure maths, so it can
// be tested without a face detector.

export interface Point {
  x: number
  y: number
}

export interface Face {
  // Face box from the detector, in full-size upright image pixels. BlazeFace
  // boxes run from about the eyebrows to the chin, cheek to cheek.
  box: Rect
  // Detector confidence from 0 to 1.
  score: number
  // Eye centres, when the detector found them. "Right" is the person's right
  // eye, which appears on the left of the photo.
  rightEye?: Point
  leftEye?: Point
}

export type PortraitWarning =
  // The head is tilted to one side.
  | 'tilted'
  // The face is so close or so near an edge that the head does not fit the crop.
  | 'head-cut-off'
  // The face is too small in the photo; the result will be blurry.
  | 'low-resolution'

export interface PortraitCrop {
  crop: Rect
  // Share of the crop's height the head fills.
  coverage: number
  // Roll of the eye line in degrees; positive is clockwise.
  tilt: number
  warnings: PortraitWarning[]
}

export interface PortraitOptions {
  // Output size; sets the crop's aspect ratio and the resolution check.
  output: Size
  // Share of the photo's height the head should fill, chin to crown.
  // Exams that give a "face coverage" rule use it here; 0.7 otherwise.
  headCoverage?: number
}

// Head position relative to the eyes, in face-box heights, measured on
// BlazeFace output for real portraits: the box runs from about the eyebrows
// to the chin, but where the eyes sit inside it varies from face to face, so
// the eyes are the steadier anchor. The crown includes the hair.
const CROWN_ABOVE_EYES = 1.0
const CHIN_BELOW_EYES = 0.72
// Where the eyes usually sit in the box, for faces without eye keypoints.
const EYES_IN_BOX = 0.3
// Of the space not filled by the head, the share above it. Less space goes
// above the head than below, where the neck and shoulders are.
const SPACE_ABOVE_SHARE = 0.35
const MAX_TILT_DEGREES = 8

// Estimated top of the hair and bottom of the chin, in image pixels.
export function estimateHead(face: Face): { top: number; bottom: number } {
  const eyeY =
    face.rightEye && face.leftEye
      ? (face.rightEye.y + face.leftEye.y) / 2
      : face.box.y + EYES_IN_BOX * face.box.height
  return {
    top: eyeY - CROWN_ABOVE_EYES * face.box.height,
    bottom: eyeY + CHIN_BELOW_EYES * face.box.height,
  }
}

export function planPortraitCrop(face: Face, image: Size, options: PortraitOptions): PortraitCrop {
  const coverageTarget = options.headCoverage ?? 0.7
  if (!(coverageTarget > 0 && coverageTarget <= 1)) {
    throw new Error('Head coverage must be more than 0 and at most 1.')
  }
  const aspect = options.output.width / options.output.height

  const { top: headTop, bottom: headBottom } = estimateHead(face)
  const headHeight = headBottom - headTop
  const centreX =
    face.rightEye && face.leftEye ? (face.rightEye.x + face.leftEye.x) / 2 : face.box.x + face.box.width / 2

  // Crop sized so the head fills the target share of its height.
  let height = headHeight / coverageTarget
  let width = height * aspect

  // A crop bigger than the photo has to shrink, which makes the head fill
  // more of it than intended.
  const shrink = Math.min(1, image.width / width, image.height / height)
  width *= shrink
  height *= shrink

  let x = centreX - width / 2
  let y = headTop - (height - headHeight) * SPACE_ABOVE_SHARE
  x = Math.min(Math.max(0, x), image.width - width)
  y = Math.min(Math.max(0, y), image.height - height)

  const crop = { x, y, width, height }
  const warnings: PortraitWarning[] = []

  const tilt =
    face.rightEye && face.leftEye
      ? (Math.atan2(face.leftEye.y - face.rightEye.y, face.leftEye.x - face.rightEye.x) * 180) / Math.PI
      : 0
  if (Math.abs(tilt) > MAX_TILT_DEGREES) warnings.push('tilted')

  // Allow a little of the crown estimate to fall outside: it is a guess.
  const slack = 0.05 * headHeight
  const fits =
    headTop >= crop.y - slack &&
    headBottom <= crop.y + crop.height &&
    face.box.x >= crop.x - slack &&
    face.box.x + face.box.width <= crop.x + crop.width + slack
  if (!fits) warnings.push('head-cut-off')

  // Upscaling a small crop gives a soft, blurry photo.
  if (crop.height < options.output.height * 0.9) warnings.push('low-resolution')

  return {
    crop,
    coverage: Math.min(1, headHeight / crop.height),
    tilt: Math.round(tilt * 10) / 10,
    warnings,
  }
}
