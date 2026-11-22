import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import modelUrl from '../../assets/models/selfie_segmenter.tflite?url'
import { createVisionTask, fetchModel, once, visionFileset } from './mediapipe'

// Replaces everything except the person with a plain colour, for exams that
// require a white background. Uses MediaPipe's selfie segmentation model,
// served from this site.

export const loadSegmenter = once(async (): Promise<ImageSegmenter> => {
  const model = await fetchModel(modelUrl)
  return createVisionTask(({ ImageSegmenter }) =>
    ImageSegmenter.createFromOptions(visionFileset, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    }),
  )
})

// Pixels the model is less sure than `low` about become background, more
// sure than `high` stay as the person, and those in between are blended.
// The soft band keeps hair from getting a hard cut-out edge. A lower band
// (0.35 to 0.75) left grey patches around white clothing and smudges from
// people behind the subject, so the band starts at 0.55.
export const MASK_LOW = 0.55
export const MASK_HIGH = 0.9

// Turns person-confidence values (0 to 1) into alpha values (0 to 255).
export function confidenceToAlpha(
  confidence: Float32Array,
  low = MASK_LOW,
  high = MASK_HIGH,
): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(confidence.length)
  const range = high - low
  for (let i = 0; i < confidence.length; i++) {
    const t = Math.min(1, Math.max(0, (confidence[i] - low) / range))
    // Smoothstep, for a gentler fade than a straight line.
    alpha[i] = Math.round(t * t * (3 - 2 * t) * 255)
  }
  return alpha
}

// Returns a new canvas: the person from `image` on a plain `color` background.
export async function replaceBackground(image: OffscreenCanvas, color: string): Promise<OffscreenCanvas> {
  let segmenter: ImageSegmenter
  try {
    segmenter = await loadSegmenter()
  } catch (error) {
    throw new Error('The background tool could not be loaded. Check your connection and try again.', {
      cause: error,
    })
  }

  const { width, height } = image
  const result = segmenter.segment(image)
  try {
    // The selfie model has one output: how likely each pixel is the person.
    const mask = result.confidenceMasks?.[0]
    if (!mask) throw new Error('The background could not be separated from the person.')

    const alpha = confidenceToAlpha(mask.getAsFloat32Array())
    const pixels = new ImageData(mask.width, mask.height)
    for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i]
    const maskCanvas = new OffscreenCanvas(mask.width, mask.height)
    maskCanvas.getContext('2d')!.putImageData(pixels, 0, 0)

    // Keep only the person from the photo, scaling the mask smoothly if the
    // model returned it at a different size.
    const person = new OffscreenCanvas(width, height)
    const personContext = person.getContext('2d')!
    personContext.drawImage(image, 0, 0)
    personContext.globalCompositeOperation = 'destination-in'
    personContext.imageSmoothingEnabled = true
    personContext.imageSmoothingQuality = 'high'
    personContext.drawImage(maskCanvas, 0, 0, width, height)

    const output = new OffscreenCanvas(width, height)
    const context = output.getContext('2d')!
    context.fillStyle = color
    context.fillRect(0, 0, width, height)
    context.drawImage(person, 0, 0)
    return output
  } finally {
    result.close()
  }
}
