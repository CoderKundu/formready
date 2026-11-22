import type { Upload, UploadKind } from './schema'

// Turns a preset's size rule into an exact pixel size for the output file.
// Portals state sizes as exact pixels, as centimetres (usually without a
// DPI), as a pixel range that does not say which side it means, or not at
// all. Where the portal leaves a choice, FormReady makes it and says so.

// 200 dpi: what IBPS and UPSSSC name for scanning, and sharp enough for a
// passport photo printed on an admit card.
export const DEFAULT_DPI = 200

// Physical sizes used when a portal gives none: the common Indian passport
// photo and the usual signature, thumb and declaration boxes.
export const DEFAULT_SIZE_CM: Partial<Record<UploadKind, { width: number; height: number }>> = {
  photo: { width: 3.5, height: 4.5 },
  signature: { width: 3.5, height: 1.5 },
  thumbImpression: { width: 3, height: 3 },
  declaration: { width: 10, height: 5 },
}

export interface OutputSize {
  width: number
  height: number
  // Resolution to record in the file, so it prints at the intended size.
  dpi: number
  // Where the size came from: the portal's own numbers, or FormReady's choice.
  basis: 'portal-pixels' | 'portal-centimetres' | 'portal-range' | 'formready-default'
  // Plain-language explanation for the validation report.
  note: string
}

export function cmToPixels(cm: number, dpi: number): number {
  return Math.max(1, Math.round((cm / 2.54) * dpi))
}

export interface OutputSizeOptions {
  // Resolution when the portal gives centimetres but no DPI.
  dpi?: number
  // Width / height of the content, e.g. a cropped signature, used to pick a
  // shape when the portal only gives a pixel range.
  aspect?: number
}

// Pixel size for an image upload; undefined for PDF documents.
export function outputSizeFor(upload: Upload, options: OutputSizeOptions = {}): OutputSize | undefined {
  if (upload.format !== 'jpeg') return undefined
  const dpi = options.dpi ?? DEFAULT_DPI
  const dimensions = upload.dimensions

  if (dimensions?.kind === 'pixels') {
    return {
      width: dimensions.width,
      height: dimensions.height,
      dpi,
      basis: 'portal-pixels',
      note: `${dimensions.width} x ${dimensions.height} pixels${dimensions.preferred ? ', as the portal prefers' : ', as the portal requires'}.`,
    }
  }

  if (dimensions?.kind === 'centimetres') {
    const used = dimensions.dpi ?? dpi
    return {
      width: cmToPixels(dimensions.width, used),
      height: cmToPixels(dimensions.height, used),
      dpi: used,
      basis: 'portal-centimetres',
      note:
        `${formatCm(dimensions.width)} x ${formatCm(dimensions.height)} cm` +
        (dimensions.dpi ? ` at ${used} dpi.` : ` at ${used} dpi. The portal names no resolution, so FormReady uses ${used} dpi.`),
    }
  }

  if (dimensions?.kind === 'pixelRange') {
    const { min, max, appliesTo } = dimensions
    const aspect = options.aspect ?? defaultAspect(upload.kind)
    let width: number
    let height: number
    if (appliesTo === 'width') {
      width = max
      height = Math.max(1, Math.round(max / aspect))
    } else if (appliesTo === 'height') {
      height = max
      width = Math.max(1, Math.round(max * aspect))
    } else {
      // Unclear which side the range is for, so keep both sides inside it.
      const wide = aspect >= 1
      const long = max
      const short = clamp(Math.round(wide ? max / aspect : max * aspect), min, max)
      width = wide ? long : short
      height = wide ? short : long
    }
    return {
      width,
      height,
      dpi,
      basis: 'portal-range',
      note:
        appliesTo === 'unspecified'
          ? `${width} x ${height} pixels: both sides are within the portal's ${min} to ${max} pixels, which it does not tie to a side.`
          : `${width} x ${height} pixels, within the portal's ${min} to ${max} pixel ${appliesTo}.`,
    }
  }

  const cm = DEFAULT_SIZE_CM[upload.kind]
  if (!cm) return undefined
  return {
    width: cmToPixels(cm.width, dpi),
    height: cmToPixels(cm.height, dpi),
    dpi,
    basis: 'formready-default',
    note: `The portal gives no size, so FormReady uses ${formatCm(cm.width)} x ${formatCm(cm.height)} cm at ${dpi} dpi.`,
  }
}

function defaultAspect(kind: UploadKind): number {
  const cm = DEFAULT_SIZE_CM[kind]
  return cm ? cm.width / cm.height : 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatCm(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}
