import type { Rect } from './geometry'

// Pixel maths for cleaning up a phone photo of a signature: find the ink,
// drop paper texture, shadows and the table around the paper, and crop to
// the ink. Works on plain arrays so it can be tested without a canvas.

// Brightness from 0 (black) to 255 (white), from RGBA pixels.
export function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4
    gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2])
  }
  return gray
}

// How much darker than its surroundings a pixel must be to count as ink.
// Paper grain is about 3%; light pencil or ballpoint is about 15 to 30%.
export const INK_CONTRAST = 0.12
// Over this many brightness levels below the threshold, ink fades from
// transparent to solid, which keeps stroke edges smooth.
const EDGE_SOFTNESS = 24

// Ink strength from 0 to 1 for each pixel, using an adaptive threshold
// (Bradley and Roth): a pixel is ink when it is clearly darker than the
// average of the window around it. Comparing with nearby paper instead of
// one fixed level handles shadows and uneven light across a phone photo.
export function inkStrength(gray: Uint8Array, width: number, height: number): Float32Array {
  // Integral image: sum of all pixels above and to the left. A 32-bit sum
  // holds up to 16 million pixels of 255, far more than the working size.
  const integral = new Uint32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x]
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row
    }
  }

  const half = Math.max(4, Math.round(Math.max(width, height) / 16))
  const strength = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - half)
    const bottom = Math.min(height, y + half + 1)
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - half)
      const right = Math.min(width, x + half + 1)
      const sum =
        integral[bottom * (width + 1) + right] -
        integral[top * (width + 1) + right] -
        integral[bottom * (width + 1) + left] +
        integral[top * (width + 1) + left]
      const mean = sum / ((bottom - top) * (right - left))
      const threshold = mean * (1 - INK_CONTRAST)
      const value = (threshold - gray[y * width + x]) / EDGE_SOFTNESS
      strength[y * width + x] = value <= 0 ? 0 : value >= 1 ? 1 : value
    }
  }
  return strength
}

export interface InkComponent {
  area: number
  bounds: Rect
}

// Groups touching ink pixels (strength at least half) into components,
// 8-connected. Returns a label per pixel (0 = no ink) and the components,
// where component n has label n + 1.
export function labelInk(
  strength: Float32Array,
  width: number,
  height: number,
): { labels: Int32Array; components: InkComponent[] } {
  const labels = new Int32Array(width * height)
  const components: InkComponent[] = []
  const stack: number[] = []

  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== 0 || strength[start] < 0.5) continue
    const label = components.length + 1
    let area = 0
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    labels[start] = label
    stack.push(start)
    while (stack.length > 0) {
      const index = stack.pop()!
      const x = index % width
      const y = (index - x) / width
      area++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width || (dx === 0 && dy === 0)) continue
          const next = ny * width + nx
          if (labels[next] === 0 && strength[next] >= 0.5) {
            labels[next] = label
            stack.push(next)
          }
        }
      }
    }
    components.push({
      area,
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    })
  }
  return { labels, components }
}

// Which components are part of the signature. Drops specks (paper grain,
// dust) and large dark areas touching the photo's edge (the table or a
// shadow beside the paper).
export function signatureComponents(components: InkComponent[], width: number, height: number): boolean[] {
  const minArea = Math.max(12, Math.round(width * height * 0.00002))
  return components.map(({ area, bounds }) => {
    if (area < minArea) return false
    const touchesEdge =
      bounds.x === 0 || bounds.y === 0 || bounds.x + bounds.width === width || bounds.y + bounds.height === height
    const spansPhoto = bounds.width > width * 0.5 || bounds.height > height * 0.5
    return !(touchesEdge && spansPhoto)
  })
}

// Ink strength with everything outside the kept components set to 0.
// Soft edge pixels next to a kept component (strength below one half, so
// unlabelled) are kept too, for smooth strokes.
export function keepInk(
  strength: Float32Array,
  labels: Int32Array,
  keep: boolean[],
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(strength.length)
  for (let index = 0; index < strength.length; index++) {
    const label = labels[index]
    if (label !== 0) {
      if (keep[label - 1]) out[index] = strength[index]
      continue
    }
    if (strength[index] === 0) continue
    // An edge pixel: keep it if any neighbour belongs to a kept component.
    const x = index % width
    const y = (index - x) / width
    search: for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        const neighbour = labels[ny * width + nx]
        if (neighbour !== 0 && keep[neighbour - 1]) {
          out[index] = strength[index]
          break search
        }
      }
    }
  }
  return out
}

// Smallest rectangle holding all kept components, plus a margin of
// `marginShare` of its longer side, clipped to the photo. Undefined if
// nothing was kept.
export function inkBounds(
  components: InkComponent[],
  keep: boolean[],
  width: number,
  height: number,
  marginShare = 0.06,
): Rect | undefined {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  components.forEach(({ bounds }, index) => {
    if (!keep[index]) return
    minX = Math.min(minX, bounds.x)
    minY = Math.min(minY, bounds.y)
    maxX = Math.max(maxX, bounds.x + bounds.width)
    maxY = Math.max(maxY, bounds.y + bounds.height)
  })
  if (minX === Infinity) return undefined

  const margin = Math.max(4, Math.round(Math.max(maxX - minX, maxY - minY) * marginShare))
  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  return {
    x,
    y,
    width: Math.min(width, maxX + margin) - x,
    height: Math.min(height, maxY + margin) - y,
  }
}

// Thickens strokes by `radius` pixels in every direction (a square maximum
// filter, done as two passes). Used before shrinking a signature a lot, so
// thin pen lines do not fade to faint grey at portal sizes.
export function thicken(values: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return values.slice()
  const across = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let max = 0
      for (let dx = Math.max(0, x - radius); dx <= Math.min(width - 1, x + radius); dx++) {
        const value = values[y * width + dx]
        if (value > max) max = value
      }
      across[y * width + x] = max
    }
  }
  const out = new Float32Array(values.length)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let max = 0
      for (let dy = Math.max(0, y - radius); dy <= Math.min(height - 1, y + radius); dy++) {
        const value = across[dy * width + x]
        if (value > max) max = value
      }
      out[y * width + x] = max
    }
  }
  return out
}

// How many pixels to thicken strokes by before shrinking by `shrink` times,
// so a typical pen line ends up about one output pixel wide.
export function thickenRadius(shrink: number): number {
  return Math.min(10, Math.max(0, Math.round(shrink * 0.45) - 1))
}
