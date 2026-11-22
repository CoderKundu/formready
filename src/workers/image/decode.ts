import { readJpegOrientation, withJpegOrientation, type Orientation } from './exif'
import { fitWithin, orientationTransform, orientedSize, type Size } from './geometry'

// Decodes photos into upright bitmaps inside the worker, using
// createImageBitmap and OffscreenCanvas.

// Longest side kept after decoding. A 48-megapixel phone photo is 8000 px
// across; portal photos are a few hundred pixels, so working at full size
// only wastes memory, which low-end phones do not have.
export const MAX_WORKING_SIDE = 3000

export interface DecodedImage {
  bitmap: ImageBitmap
  // Upright size of the original file, before the working-size cap.
  original: Size
  orientation: Orientation
  type: string
}

const SUPPORTED_HINT =
  'Use a JPG or PNG photo. On an iPhone, set Settings > Camera > Formats to Most Compatible, or take a screenshot of the photo.'

let browserRotates: Promise<boolean> | undefined

// Whether createImageBitmap already turns photos upright using EXIF.
// Current browsers do, but older ones do not, so check once with a 2 x 1
// JPEG tagged "turn 90°": if it comes back 1 x 2, the browser rotated it.
export function browserAppliesOrientation(): Promise<boolean> {
  browserRotates ??= (async () => {
    try {
      const canvas = new OffscreenCanvas(2, 1)
      canvas.getContext('2d')!.fillRect(0, 0, 2, 1)
      const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())
      const tagged = new Blob([withJpegOrientation(jpeg, 6) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
      const bitmap = await createImageBitmap(tagged, { imageOrientation: 'from-image' })
      const rotated = bitmap.width === 1 && bitmap.height === 2
      bitmap.close()
      return rotated
    } catch {
      return true
    }
  })()
  return browserRotates
}

export async function decodeImage(blob: Blob): Promise<DecodedImage> {
  const head = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer())
  if (isHeic(head)) {
    throw new Error(`HEIC photos are not supported yet. ${SUPPORTED_HINT}`)
  }
  const orientation = readJpegOrientation(head)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch (error) {
    throw new Error(`This file could not be opened as an image. ${SUPPORTED_HINT}`, { cause: error })
  }

  // Turn the photo upright ourselves if the browser did not.
  if (orientation !== 1 && !(await browserAppliesOrientation())) {
    const stored = { width: bitmap.width, height: bitmap.height }
    const upright = orientedSize(stored, orientation)
    const canvas = new OffscreenCanvas(upright.width, upright.height)
    const context = canvas.getContext('2d')!
    context.setTransform(...orientationTransform(orientation, stored))
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    bitmap = canvas.transferToImageBitmap()
  }

  const original = { width: bitmap.width, height: bitmap.height }
  const working = fitWithin(original, MAX_WORKING_SIDE)
  if (working.width !== original.width) {
    const smaller = await createImageBitmap(bitmap, {
      resizeWidth: working.width,
      resizeHeight: working.height,
      resizeQuality: 'high',
    })
    bitmap.close()
    bitmap = smaller
  }

  return { bitmap, original, orientation, type: blob.type }
}

// HEIC/HEIF files start with an "ftyp" box naming a HEIF brand.
function isHeic(head: Uint8Array): boolean {
  if (head.length < 12) return false
  const box = String.fromCharCode(...head.subarray(4, 12))
  return /^ftyp(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(box)
}
