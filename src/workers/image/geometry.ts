import type { Orientation } from './exif'

// Pure size and position maths for image processing, kept free of canvas
// code so it can be tested anywhere.

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

// Orientations 5 to 8 turn the image a quarter turn, swapping width and height.
export function swapsSides(orientation: Orientation): boolean {
  return orientation >= 5
}

// Size of the image once turned upright.
export function orientedSize(stored: Size, orientation: Orientation): Size {
  return swapsSides(orientation)
    ? { width: stored.height, height: stored.width }
    : { width: stored.width, height: stored.height }
}

// Canvas transform [a, b, c, d, e, f] that draws a stored image of size
// `stored` upright onto a canvas of orientedSize(stored, orientation).
export function orientationTransform(
  orientation: Orientation,
  stored: Size,
): [number, number, number, number, number, number] {
  const { width: w, height: h } = stored
  switch (orientation) {
    case 2: return [-1, 0, 0, 1, w, 0] // mirrored
    case 3: return [-1, 0, 0, -1, w, h] // upside down
    case 4: return [1, 0, 0, -1, 0, h] // mirrored upside down
    case 5: return [0, 1, 1, 0, 0, 0] // mirrored, quarter turn
    case 6: return [0, 1, -1, 0, h, 0] // quarter turn clockwise
    case 7: return [0, -1, -1, 0, h, w] // mirrored, quarter turn the other way
    case 8: return [0, -1, 1, 0, 0, w] // quarter turn anticlockwise
    default: return [1, 0, 0, 1, 0, 0]
  }
}

// Largest centred rectangle of the target's aspect ratio inside the source,
// for filling the target exactly ("cover").
export function coverCrop(source: Size, target: Size): Rect {
  const sourceRatio = source.width / source.height
  const targetRatio = target.width / target.height
  if (sourceRatio > targetRatio) {
    const width = source.height * targetRatio
    return { x: (source.width - width) / 2, y: 0, width, height: source.height }
  }
  const height = source.width / targetRatio
  return { x: 0, y: (source.height - height) / 2, width: source.width, height }
}

// Where to draw the whole source inside the target without cropping
// ("contain"), centred, leaving bars of background colour.
export function containRect(source: Size, target: Size): Rect {
  const scale = Math.min(target.width / source.width, target.height / source.height)
  const width = source.width * scale
  const height = source.height * scale
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height }
}

// Scales a size down so its longer side is at most `maxSide`, keeping the
// aspect ratio. Sizes already within the limit are returned unchanged.
export function fitWithin(size: Size, maxSide: number): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxSide) return { ...size }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

// Intermediate sizes for shrinking `from` to `to` by halving, so each canvas
// draw shrinks by at most 2x. One large shrink in a single draw samples too
// few pixels and leaves jagged edges and moiré. The last entry is `to`.
export function downscaleSteps(from: Size, to: Size): Size[] {
  const steps: Size[] = []
  let current = { ...from }
  while (current.width / 2 >= to.width && current.height / 2 >= to.height) {
    current = { width: Math.round(current.width / 2), height: Math.round(current.height / 2) }
    if (current.width === to.width && current.height === to.height) break
    steps.push(current)
  }
  steps.push({ ...to })
  return steps
}

// Checks a crop rectangle lies inside the image and has some area.
export function clampRect(rect: Rect, bounds: Size): Rect {
  const x = Math.min(Math.max(0, rect.x), bounds.width - 1)
  const y = Math.min(Math.max(0, rect.y), bounds.height - 1)
  const width = Math.max(1, Math.min(rect.width, bounds.width - x))
  const height = Math.max(1, Math.min(rect.height, bounds.height - y))
  return { x, y, width, height }
}
