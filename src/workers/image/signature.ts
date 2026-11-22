import { decodeImage } from './decode'
import { containRect, fitWithin, type Rect } from './geometry'
import { drawScaled, type ResizedImage } from './resize'
import {
  inkBounds,
  inkStrength,
  keepInk,
  labelInk,
  paperBounds,
  signatureComponents,
  thicken,
  thickenRadius,
  toGray,
} from './signature-math'

// Turns a phone photo of a signature on paper into a clean signature on
// white, cropped to the ink and fitted to the portal's size.

// Signatures are thin lines, which fade if the photo is shrunk too far
// before the ink is found. 2400 px keeps a ballpoint line about 2 px wide
// in a 12 MP photo, and the pixel work stays under a second on a laptop.
const WORKING_SIDE = 2400
// Space kept around the signature inside the output, as a share of each side.
const OUTPUT_PADDING = 0.05
// Ink strength is boosted slightly so strokes come out solid, not grey.
const INK_BOOST = 1.3

export interface SignatureOptions {
  // Output size in pixels, e.g. 140 x 60 for IBPS.
  width: number
  height: number
  format?: 'jpeg' | 'png'
  quality?: number
  // "black" redraws the ink in black, as most portals ask for black ink;
  // "original" keeps the pen's colour.
  ink?: 'black' | 'original'
}

export type SignatureProblem =
  // Nothing that looks like ink was found; the output is blank.
  | 'no-ink'
  // The signature is small in the photo, so the result will be soft.
  | 'low-resolution'

export interface SignatureResult extends ResizedImage {
  // Area of the upright photo the signature was found in, in full-size pixels.
  bounds?: Rect
  problems: SignatureProblem[]
}

export async function cleanSignature(blob: Blob, options: SignatureOptions): Promise<SignatureResult> {
  const target = { width: Math.round(options.width), height: Math.round(options.height) }
  if (!(target.width >= 1 && target.height >= 1 && target.width <= 6000 && target.height <= 6000)) {
    throw new Error('Output size must be from 1 to 6000 pixels on each side.')
  }

  const image = await decodeImage(blob)
  let working: OffscreenCanvas
  try {
    const size = fitWithin({ width: image.bitmap.width, height: image.bitmap.height }, WORKING_SIDE)
    working = drawScaled(image.bitmap, { x: 0, y: 0, width: image.bitmap.width, height: image.bitmap.height }, size)
  } finally {
    image.bitmap.close()
  }

  const { width, height } = working
  const context = working.getContext('2d', { willReadFrequently: true })!
  const pixels = context.getImageData(0, 0, width, height)
  const gray = toGray(pixels.data)
  const strength = inkStrength(gray, width, height)
  const { labels, components } = labelInk(strength, width, height)
  const keep = signatureComponents(components, width, height, paperBounds(gray, width, height))
  const ink = keepInk(strength, labels, keep, width, height)
  const bounds = inkBounds(components, keep, width, height)

  const output = new OffscreenCanvas(target.width, target.height)
  const outputContext = output.getContext('2d')!
  outputContext.fillStyle = '#ffffff'
  outputContext.fillRect(0, 0, target.width, target.height)

  const encode = () =>
    output.convertToBlob({
      type: options.format === 'png' ? 'image/png' : 'image/jpeg',
      quality: options.quality ?? 0.92,
    })

  if (!bounds) {
    return { blob: await encode(), ...target, problems: ['no-ink'] }
  }

  // Where the signature goes in the output, centred, with some padding.
  const inner = {
    width: Math.max(1, Math.round(target.width * (1 - 2 * OUTPUT_PADDING))),
    height: Math.max(1, Math.round(target.height * (1 - 2 * OUTPUT_PADDING))),
  }
  const placed = containRect(bounds, inner)
  const shrink = bounds.width / placed.width

  // Ink in the signature area, thickened if it will be shrunk a lot.
  const area = new Float32Array(bounds.width * bounds.height)
  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      area[y * bounds.width + x] = ink[(bounds.y + y) * width + bounds.x + x]
    }
  }
  const strokes = thicken(area, bounds.width, bounds.height, thickenRadius(shrink))

  // Redraw just the signature area: ink on pure white, everything else gone.
  const crop = new ImageData(bounds.width, bounds.height)
  const colour = options.ink === 'original' ? averageInkColour(pixels.data, ink) : [0, 0, 0]
  for (let i = 0; i < strokes.length; i++) {
    const alpha = Math.min(1, strokes[i] * INK_BOOST)
    for (let channel = 0; channel < 3; channel++) {
      crop.data[i * 4 + channel] = Math.round(255 * (1 - alpha) + colour[channel] * alpha)
    }
    crop.data[i * 4 + 3] = 255
  }
  const cleaned = new OffscreenCanvas(bounds.width, bounds.height)
  cleaned.getContext('2d')!.putImageData(crop, 0, 0)

  const drawn = drawScaled(cleaned, { x: 0, y: 0, width: bounds.width, height: bounds.height }, {
    width: Math.max(1, Math.round(placed.width)),
    height: Math.max(1, Math.round(placed.height)),
  })
  outputContext.drawImage(
    drawn,
    Math.round((target.width - drawn.width) / 2),
    Math.round((target.height - drawn.height) / 2),
  )

  const problems: SignatureProblem[] = []
  // Upscaling a small signature gives soft, blurry strokes.
  if (placed.width > bounds.width * 1.25) problems.push('low-resolution')

  const scale = image.original.width / width
  return {
    blob: await encode(),
    ...target,
    bounds: {
      x: bounds.x * scale,
      y: bounds.y * scale,
      width: bounds.width * scale,
      height: bounds.height * scale,
    },
    problems,
  }
}

// The pen's colour: average of the pixels that are clearly ink (strength
// 0.9 or more). One colour for the whole signature, so thickened strokes do
// not pick up the paper colour.
function averageInkColour(rgba: Uint8ClampedArray, ink: Float32Array): [number, number, number] {
  const sum = [0, 0, 0]
  let count = 0
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] < 0.9) continue
    sum[0] += rgba[i * 4]
    sum[1] += rgba[i * 4 + 1]
    sum[2] += rgba[i * 4 + 2]
    count++
  }
  if (count === 0) return [0, 0, 0]
  // Photos make ink look lighter than it is; darken it a little.
  return sum.map((total) => Math.round((total / count) * 0.7)) as [number, number, number]
}
