// Fitting a JPEG between a minimum and maximum file size, as exam portals
// require (for example a photo of 20 to 50 KB). Pure logic, so it can be
// tested with a fake encoder.

export const MIN_QUALITY = 0.3
export const MAX_QUALITY = 1
// Quality is searched to within this step; finer makes no visible difference.
const QUALITY_PRECISION = 0.02

export interface QualitySearch<T> {
  // Highest quality found whose output is at most maxBytes.
  fitting?: { quality: number; bytes: number; output: T }
  // Output at the lowest quality tried, for reporting how close it got.
  lowest: { quality: number; bytes: number; output: T }
  // Number of encodes performed.
  encodes: number
}

// Binary search for the highest JPEG quality whose output fits in
// `maxBytes`. File size grows with quality, so this needs about 6 encodes.
// Only outputs actually measured under the limit are returned.
export async function searchQuality<T>(
  encode: (quality: number) => Promise<{ bytes: number; output: T }>,
  maxBytes: number,
): Promise<QualitySearch<T>> {
  let encodes = 0
  const run = async (quality: number) => {
    encodes++
    return { quality, ...(await encode(quality)) }
  }

  const best = await run(MAX_QUALITY)
  if (best.bytes <= maxBytes) return { fitting: best, lowest: best, encodes }

  const lowest = await run(MIN_QUALITY)
  if (lowest.bytes > maxBytes) return { lowest, encodes }

  let fitting = lowest
  let low = MIN_QUALITY
  let high = MAX_QUALITY
  while (high - low > QUALITY_PRECISION) {
    const middle = (low + high) / 2
    const result = await run(middle)
    if (result.bytes <= maxBytes) {
      fitting = result.quality > fitting.quality ? result : fitting
      low = middle
    } else {
      high = middle
    }
  }
  return { fitting, lowest, encodes }
}

// Scale factor to try next when even the lowest quality is too big. File
// size grows roughly with pixel count, so scale by the square root of the
// ratio, with a little extra so the next try is likely to fit.
export function nextScale(currentBytes: number, maxBytes: number): number {
  return Math.min(0.95, Math.sqrt(maxBytes / currentBytes) * 0.95)
}

// Largest single JPEG comment segment: 65535 bytes including its 2-byte length.
const MAX_COMMENT_DATA = 65533
const SEGMENT_OVERHEAD = 4 // FF FE marker plus 2-byte length

// Pads a JPEG to exactly `targetBytes` with comment (COM) segments. The
// picture does not change: decoders skip comments. Portals that set a
// minimum file size only check the size, so this lets a small, clean image
// (a signature on white compresses to 2 or 3 KB) meet a 10 KB minimum
// without adding noise to it.
//
// Comments go after the leading APPn segments (JFIF, EXIF), where some
// strict readers expect those to come first.
export function padJpeg(jpeg: Uint8Array, targetBytes: number): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG file.')
  const extra = targetBytes - jpeg.length
  if (extra <= 0) return jpeg
  if (extra < SEGMENT_OVERHEAD) {
    // Too little room for a segment; pad by one more segment's worth.
    return padJpeg(jpeg, jpeg.length + SEGMENT_OVERHEAD)
  }

  // Split the extra bytes into segments of at most MAX_COMMENT_DATA data.
  const segments: Uint8Array[] = []
  let remaining = extra
  while (remaining > 0) {
    let size = Math.min(remaining, MAX_COMMENT_DATA + SEGMENT_OVERHEAD)
    // Never leave a remainder too small for its own segment.
    const after = remaining - size
    if (after > 0 && after < SEGMENT_OVERHEAD) size -= SEGMENT_OVERHEAD
    const segment = new Uint8Array(size).fill(0x20) // spaces
    segment[0] = 0xff
    segment[1] = 0xfe
    segment[2] = ((size - 2) >> 8) & 0xff
    segment[3] = (size - 2) & 0xff
    segments.push(segment)
    remaining -= size
  }

  const at = afterAppSegments(jpeg)
  const out = new Uint8Array(targetBytes)
  out.set(jpeg.subarray(0, at), 0)
  let offset = at
  for (const segment of segments) {
    out.set(segment, offset)
    offset += segment.length
  }
  out.set(jpeg.subarray(at), offset)
  return out
}

// Offset just past the start marker and any APP0 to APP15 segments.
function afterAppSegments(jpeg: Uint8Array): number {
  let offset = 2
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff && jpeg[offset + 1] >= 0xe0 && jpeg[offset + 1] <= 0xef) {
    offset += 2 + ((jpeg[offset + 2] << 8) | jpeg[offset + 3])
  }
  return Math.min(offset, jpeg.length)
}
