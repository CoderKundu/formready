import { describe, expect, it } from 'vitest'
import {
  inkBounds,
  inkStrength,
  keepInk,
  labelInk,
  signatureComponents,
  thicken,
  thickenRadius,
  toGray,
} from './signature-math'

// Builds a grey image: paper lit from the left (bright on the left, darker
// on the right, like a phone shadow), with `draw` adding ink.
function scene(
  width: number,
  height: number,
  draw: (set: (x: number, y: number, value: number) => void) => void,
): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) gray[y * width + x] = Math.round(235 - (x / width) * 110)
  }
  draw((x, y, value) => {
    if (x >= 0 && y >= 0 && x < width && y < height) gray[y * width + x] = value
  })
  return gray
}

const W = 200
const H = 100

// A stroke 3 px thick from (x1, y) to (x2, y).
const stroke = (set: (x: number, y: number, v: number) => void, x1: number, x2: number, y: number, value: number) => {
  for (let x = x1; x <= x2; x++) for (let dy = 0; dy < 3; dy++) set(x, y + dy, value)
}

describe('toGray', () => {
  it('weights green most, as eyes do', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    expect([...toGray(rgba)]).toEqual([76, 150, 29, 255])
  })
})

describe('inkStrength', () => {
  it('finds dark ink on bright paper and faint ink in the shadow', () => {
    const gray = scene(W, H, (set) => {
      stroke(set, 10, 60, 40, 40) // dark ink, bright side
      stroke(set, 140, 190, 40, 95) // grey ink on the shadowed side
    })
    const strength = inkStrength(gray, W, H)
    expect(strength[41 * W + 30]).toBe(1)
    // Counts as ink (0.5 or more), though fainter than the dark stroke.
    expect(strength[41 * W + 165]).toBeGreaterThanOrEqual(0.5)
  })

  it('ignores the shadow itself, though it is darker than the faint ink', () => {
    const gray = scene(W, H, (set) => stroke(set, 140, 190, 40, 95))
    const strength = inkStrength(gray, W, H)
    // Shadowed paper (about 130) is darker than bright-side ink would need to be, but not ink.
    expect(strength[80 * W + 190]).toBe(0)
    expect(strength[80 * W + 20]).toBe(0)
  })
})

describe('labelInk and signatureComponents', () => {
  it('drops specks and keeps strokes, including a dot that is big enough', () => {
    const gray = scene(W, H, (set) => {
      stroke(set, 20, 120, 50, 30)
      set(150, 20, 30) // single-pixel speck
      for (let y = 70; y < 75; y++) for (let x = 150; x < 155; x++) set(x, y, 30) // a 5 x 5 dot
    })
    const strength = inkStrength(gray, W, H)
    const { components } = labelInk(strength, W, H)
    const keep = signatureComponents(components, W, H)
    const kept = components.filter((_, i) => keep[i])
    expect(kept.map((c) => c.area).sort((a, b) => a - b)).toEqual([25, 303])
  })

  it('drops a dark table edge along the side of the photo', () => {
    const gray = scene(W, H, (set) => {
      stroke(set, 40, 120, 50, 30)
      for (let y = 0; y < H; y++) for (let x = 0; x < 8; x++) set(x, y, 20) // table at the left edge
    })
    const strength = inkStrength(gray, W, H)
    const { components } = labelInk(strength, W, H)
    const keep = signatureComponents(components, W, H)
    expect(components.filter((_, i) => keep[i]).map((c) => c.bounds.x)).toEqual([40])
  })
})

describe('keepInk and inkBounds', () => {
  const gray = scene(W, H, (set) => {
    stroke(set, 50, 150, 40, 30)
    stroke(set, 60, 140, 60, 30)
    set(5, 5, 30) // speck
  })
  const strength = inkStrength(gray, W, H)
  const { labels, components } = labelInk(strength, W, H)
  const keep = signatureComponents(components, W, H)

  it('clears removed specks and keeps the strokes', () => {
    const ink = keepInk(strength, labels, keep, W, H)
    expect(ink[5 * W + 5]).toBe(0)
    expect(ink[41 * W + 100]).toBe(1)
  })

  it('crops to the strokes with a margin', () => {
    const bounds = inkBounds(components, keep, W, H)!
    // Strokes span x 50 to 150 and y 40 to 62; margin 6% of 101 = 6.
    expect(bounds).toEqual({ x: 44, y: 34, width: 113, height: 35 })
  })

  it('reports no bounds when there is no ink', () => {
    const blank = inkStrength(scene(W, H, () => {}), W, H)
    const result = labelInk(blank, W, H)
    expect(inkBounds(result.components, signatureComponents(result.components, W, H), W, H)).toBeUndefined()
  })
})

describe('thicken and thickenRadius', () => {
  it('spreads each pixel to its neighbours within the radius, keeping the strongest value', () => {
    const values = new Float32Array(7 * 5)
    values[2 * 7 + 3] = 1
    values[0] = 0.4
    const out = thicken(values, 7, 5, 1)
    // The centre pixel becomes a 3 x 3 block.
    for (let y = 1; y <= 3; y++) for (let x = 2; x <= 4; x++) expect(out[y * 7 + x]).toBe(1)
    expect(out[1]).toBeCloseTo(0.4) // row 0, column 1
    expect(out[4 * 7 + 6]).toBe(0)
  })

  it('leaves values unchanged with radius 0', () => {
    const values = new Float32Array([0, 1, 0.5])
    expect([...thicken(values, 3, 1, 0)]).toEqual([...values])
  })

  it('thickens more for bigger shrinks, within limits', () => {
    expect(thickenRadius(1)).toBe(0)
    expect(thickenRadius(4)).toBe(1)
    expect(thickenRadius(15)).toBe(6)
    expect(thickenRadius(100)).toBe(10)
  })
})
