import { describe, expect, it } from 'vitest'
import { readJpegOrientation, withJpegOrientation, type Orientation } from './exif'
import {
  clampRect,
  containRect,
  coverCrop,
  downscaleSteps,
  fitWithin,
  orientationTransform,
  orientedSize,
} from './geometry'

// Smallest byte sequence that looks like a JPEG to the parser: start marker,
// a comment segment, then start of scan.
const bareJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xfe, 0x00, 0x04, 0x68, 0x69, 0xff, 0xda])

describe('readJpegOrientation', () => {
  it('reads every orientation written by withJpegOrientation', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
      expect(readJpegOrientation(withJpegOrientation(bareJpeg, orientation))).toBe(orientation)
    }
  })

  it('reads little-endian EXIF too', () => {
    const exif = withJpegOrientation(bareJpeg, 6)
    // Rewrite the TIFF header and the entry as little-endian ("II").
    const view = new DataView(exif.buffer)
    view.setUint16(12, 0x4949)
    view.setUint16(14, 42, true)
    view.setUint32(16, 8, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 0x0112, true)
    view.setUint16(24, 3, true)
    view.setUint32(26, 1, true)
    view.setUint16(30, 6, true)
    expect(readJpegOrientation(exif)).toBe(6)
  })

  it('returns 1 for a JPEG without EXIF', () => {
    expect(readJpegOrientation(bareJpeg)).toBe(1)
  })

  it('returns 1 for files that are not JPEGs or are cut short', () => {
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1)
    expect(readJpegOrientation(new Uint8Array())).toBe(1)
    expect(readJpegOrientation(withJpegOrientation(bareJpeg, 6).subarray(0, 20))).toBe(1)
  })

  it('ignores an orientation value outside 1 to 8', () => {
    const exif = withJpegOrientation(bareJpeg, 6)
    new DataView(exif.buffer).setUint16(30, 9)
    expect(readJpegOrientation(exif)).toBe(1)
  })
})

describe('orientation geometry', () => {
  const stored = { width: 4000, height: 3000 }

  it('swaps width and height for quarter turns only', () => {
    expect(orientedSize(stored, 1)).toEqual({ width: 4000, height: 3000 })
    expect(orientedSize(stored, 3)).toEqual({ width: 4000, height: 3000 })
    expect(orientedSize(stored, 6)).toEqual({ width: 3000, height: 4000 })
    expect(orientedSize(stored, 8)).toEqual({ width: 3000, height: 4000 })
  })

  // Applies a canvas transform to a point.
  const apply = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a * x + c * y + e, b * x + d * y + f]

  it('maps every stored corner onto a corner of the upright canvas', () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8] as Orientation[]) {
      const transform = orientationTransform(orientation, stored)
      const size = orientedSize(stored, orientation)
      const corners = [
        [0, 0],
        [stored.width, 0],
        [0, stored.height],
        [stored.width, stored.height],
      ].map(([x, y]) => apply(transform, x, y).join(','))
      expect(new Set(corners)).toEqual(
        new Set([`0,0`, `${size.width},0`, `0,${size.height}`, `${size.width},${size.height}`]),
      )
    }
  })

  it('turns the top-left of a sideways photo to the top-right (orientation 6)', () => {
    // Orientation 6: the stored image must turn 90° clockwise.
    expect(apply(orientationTransform(6, stored), 0, 0)).toEqual([3000, 0])
  })
})

describe('coverCrop and containRect', () => {
  it('crops the sides of a wide photo for a portrait target', () => {
    // 3.5 x 4.5 cm passport photo from a 4000 x 3000 landscape photo.
    const crop = coverCrop({ width: 4000, height: 3000 }, { width: 350, height: 450 })
    expect(crop.height).toBe(3000)
    expect(crop.width).toBeCloseTo((3000 * 350) / 450)
    expect(crop.x).toBeCloseTo((4000 - crop.width) / 2)
    expect(crop.y).toBe(0)
  })

  it('crops top and bottom of a tall photo for a wide target', () => {
    const crop = coverCrop({ width: 3000, height: 4000 }, { width: 140, height: 60 })
    expect(crop.width).toBe(3000)
    expect(crop.height).toBeCloseTo((3000 * 60) / 140)
  })

  it('fits the whole image inside the target, centred', () => {
    expect(containRect({ width: 200, height: 100 }, { width: 100, height: 100 })).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    })
  })
})

describe('fitWithin, downscaleSteps and clampRect', () => {
  it('shrinks only images over the limit, keeping the aspect ratio', () => {
    expect(fitWithin({ width: 8000, height: 6000 }, 4000)).toEqual({ width: 4000, height: 3000 })
    expect(fitWithin({ width: 1000, height: 500 }, 4000)).toEqual({ width: 1000, height: 500 })
  })

  it('halves until within 2x, then lands exactly on the target', () => {
    expect(downscaleSteps({ width: 4000, height: 3000 }, { width: 350, height: 262 })).toEqual([
      { width: 2000, height: 1500 },
      { width: 1000, height: 750 },
      { width: 500, height: 375 },
      { width: 350, height: 262 },
    ])
  })

  it('draws once when shrinking by less than half', () => {
    expect(downscaleSteps({ width: 600, height: 400 }, { width: 400, height: 300 })).toEqual([
      { width: 400, height: 300 },
    ])
  })

  it('does not repeat the target when halving lands on it exactly', () => {
    expect(downscaleSteps({ width: 800, height: 600 }, { width: 400, height: 300 })).toEqual([
      { width: 400, height: 300 },
    ])
  })

  it('keeps a crop rectangle inside the image', () => {
    expect(clampRect({ x: -10, y: 50, width: 500, height: 500 }, { width: 300, height: 300 })).toEqual({
      x: 0,
      y: 50,
      width: 300,
      height: 250,
    })
  })
})
