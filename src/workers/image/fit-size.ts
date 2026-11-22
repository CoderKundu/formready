import { maxBytesFor, minBytesFor } from '../kilobytes'
import { decodeImage } from './decode'
import { MIN_QUALITY, nextScale, padJpeg, searchQuality } from './jpeg-size'
import { drawScaled } from './resize'

// Re-encodes an image as a JPEG between the portal's minimum and maximum
// file size, keeping the best quality that fits.

export interface FitSizeOptions {
  maxKB: number
  minKB?: number
  // When even the lowest quality is too big, shrink the pixel size and try
  // again. Leave off when the portal fixes the pixel size (e.g. 200 x 230).
  allowShrink?: boolean
}

export interface FitSizeResult {
  // "fits": between the limits. "too-big": over the maximum even at the
  // lowest quality (and smallest allowed size); `blob` is the smallest made.
  status: 'fits' | 'too-big'
  blob: Blob
  bytes: number
  width: number
  height: number
  quality: number
  // Bytes of blank JPEG comment added to reach the minimum; 0 if none.
  paddedBytes: number
}

// Shrinking stops here; smaller images are useless on an exam form.
const MIN_SIDE = 60
const MAX_SHRINKS = 6

export async function fitImageToSize(blob: Blob, options: FitSizeOptions): Promise<FitSizeResult> {
  if (!(options.maxKB > 0)) throw new Error('Enter a maximum size above 0 KB.')
  const maxBytes = maxBytesFor(options.maxKB)
  const minBytes = options.minKB ? minBytesFor(options.minKB) : 0
  if (minBytes > maxBytes) {
    throw new Error(`The minimum (${options.minKB} KB) is above the maximum (${options.maxKB} KB).`)
  }

  const image = await decodeImage(blob)
  const full = { width: image.bitmap.width, height: image.bitmap.height }
  try {
    let scale = 1
    for (let attempt = 0; ; attempt++) {
      const size = {
        width: Math.max(1, Math.round(full.width * scale)),
        height: Math.max(1, Math.round(full.height * scale)),
      }
      const canvas = drawScaled(image.bitmap, { x: 0, y: 0, ...full }, size)
      // JPEG has no transparency; put transparent areas on white, not black.
      const flat = new OffscreenCanvas(size.width, size.height)
      const context = flat.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size.width, size.height)
      context.drawImage(canvas, 0, 0)

      const search = await searchQuality(async (quality) => {
        const output = await flat.convertToBlob({ type: 'image/jpeg', quality })
        return { bytes: output.size, output }
      }, maxBytes)

      if (search.fitting) {
        const { output, quality } = search.fitting
        if (output.size >= minBytes) {
          return { status: 'fits', blob: output, bytes: output.size, ...size, quality, paddedBytes: 0 }
        }
        // Too small even at the best quality that fits: pad with blank
        // comments to a little over the minimum, staying under the maximum.
        const target = Math.min(maxBytes, minBytes + Math.min(1024, Math.floor((maxBytes - minBytes) / 2)))
        const padded = padJpeg(new Uint8Array(await output.arrayBuffer()), target)
        return {
          status: 'fits',
          blob: new Blob([padded as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }),
          bytes: padded.length,
          ...size,
          quality,
          paddedBytes: padded.length - output.size,
        }
      }

      const next = scale * nextScale(search.lowest.bytes, maxBytes)
      const tooSmall = Math.min(full.width, full.height) * next < MIN_SIDE
      if (!options.allowShrink || attempt >= MAX_SHRINKS || tooSmall) {
        const { output } = search.lowest
        return {
          status: 'too-big',
          blob: output,
          bytes: output.size,
          ...size,
          quality: MIN_QUALITY,
          paddedBytes: 0,
        }
      }
      scale = next
    }
  } finally {
    image.bitmap.close()
  }
}
