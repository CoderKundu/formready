import { decodeImage } from './decode'
import { clampRect, containRect, coverCrop, downscaleSteps, type Rect, type Size } from './geometry'

export type { Rect, Size } from './geometry'

export interface ImageInfo {
  // Upright size of the photo, as the user sees it.
  width: number
  height: number
  type: string
  // EXIF orientation found in the file (1 = already upright).
  orientation: number
}

export interface ResizeOptions {
  // Output size in pixels.
  width: number
  height: number
  // "cover" fills the output and crops what does not fit (photos);
  // "contain" shows the whole image with background bars (signatures).
  fit: 'cover' | 'contain'
  // Area of the upright photo to use, in its full-size pixels. Defaults to
  // the whole photo. Face detection will set this to crop around the face.
  crop?: Rect
  format: 'jpeg' | 'png'
  // JPEG quality from 0 to 1.
  quality?: number
  // Fill for transparent areas and "contain" bars. JPEG has no transparency.
  background?: string
}

export interface ResizedImage {
  blob: Blob
  width: number
  height: number
}

export async function inspectImage(blob: Blob): Promise<ImageInfo> {
  const image = await decodeImage(blob)
  image.bitmap.close()
  return {
    width: image.original.width,
    height: image.original.height,
    type: image.type,
    orientation: image.orientation,
  }
}

export async function resizeImage(blob: Blob, options: ResizeOptions): Promise<ResizedImage> {
  const target = { width: Math.round(options.width), height: Math.round(options.height) }
  if (!(target.width >= 1 && target.height >= 1 && target.width <= 6000 && target.height <= 6000)) {
    throw new Error('Output size must be from 1 to 6000 pixels on each side.')
  }

  const image = await decodeImage(blob)
  const working = { width: image.bitmap.width, height: image.bitmap.height }
  // Crops are given in full-size pixels; the bitmap may have been capped.
  const scale = working.width / image.original.width
  const area = clampRect(
    options.crop
      ? {
          x: options.crop.x * scale,
          y: options.crop.y * scale,
          width: options.crop.width * scale,
          height: options.crop.height * scale,
        }
      : { x: 0, y: 0, ...working },
    working,
  )

  const background = options.background ?? '#ffffff'
  try {
    let source: Rect
    let destination: Rect
    if (options.fit === 'cover') {
      const crop = coverCrop(area, target)
      source = { x: area.x + crop.x, y: area.y + crop.y, width: crop.width, height: crop.height }
      destination = { x: 0, y: 0, ...target }
    } else {
      source = area
      destination = containRect(area, target)
    }

    const drawn = drawScaled(image.bitmap, source, {
      width: Math.max(1, Math.round(destination.width)),
      height: Math.max(1, Math.round(destination.height)),
    })

    const canvas = new OffscreenCanvas(target.width, target.height)
    const context = canvas.getContext('2d')!
    context.fillStyle = background
    context.fillRect(0, 0, target.width, target.height)
    context.drawImage(drawn, Math.round(destination.x), Math.round(destination.y))

    const type = options.format === 'png' ? 'image/png' : 'image/jpeg'
    const output = await canvas.convertToBlob({ type, quality: options.quality ?? 0.92 })
    return { blob: output, ...target }
  } finally {
    image.bitmap.close()
  }
}

// Copies `source` from the bitmap at `size`, halving step by step so a big
// reduction stays smooth.
function drawScaled(bitmap: ImageBitmap, source: Rect, size: Size): OffscreenCanvas {
  let canvas = new OffscreenCanvas(Math.round(source.width), Math.round(source.height))
  let context = canvas.getContext('2d')!
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height)

  for (const step of downscaleSteps({ width: canvas.width, height: canvas.height }, size)) {
    const next = new OffscreenCanvas(step.width, step.height)
    context = next.getContext('2d')!
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(canvas, 0, 0, step.width, step.height)
    canvas = next
  }
  return canvas
}
