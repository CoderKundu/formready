import type { Upload } from '../presets'
import { cmToPixels, DEFAULT_SIZE_CM, type OutputSize } from '../presets/output-size'
import { maxBytesFor, minBytesFor, toKB } from '../workers/kilobytes'
import { readJpegDpi, readJpegSize } from '../workers/image/jpeg-size'

// The validation report: each of the exam's rules, checked against the
// finished file's own bytes rather than against what the tools were asked
// to make. If a step went wrong, this is where it shows.

export interface Check {
  label: string
  // What the exam asks for.
  rule: string
  // What the file has.
  found: string
  // "info" rows explain something without being a rule, e.g. padding.
  result: 'pass' | 'fail' | 'info'
}

export interface ImageCheckInput {
  bytes: Uint8Array
  name: string
  // The size FormReady aimed for, which says where the size rule came from.
  size?: OutputSize
  // Blank bytes added to reach a minimum size.
  paddedBytes: number
}

export interface PdfCheckInput {
  bytes: Uint8Array
  name: string
  pageSizes: { width: number; height: number }[]
}

// A4 in points (1/72 inch): 210 x 297 mm.
const A4 = { width: 595.28, height: 841.89 }
// Scanners and "print to PDF" round page sizes a little.
const PAGE_TOLERANCE = 0.02
// Centimetre rules: allow the rounding to whole pixels.
const CM_TOLERANCE = 0.05

export function checkImage(upload: Upload, input: ImageCheckInput): Check[] {
  const { bytes } = input
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const checks: Check[] = [
    { label: 'File type', rule: 'JPG', found: isJpeg ? 'JPG' : 'Not a JPG', result: isJpeg ? 'pass' : 'fail' },
    sizeCheck(upload, bytes.length),
  ]
  if (input.paddedBytes > 0) checks.push(paddingCheck(upload, bytes.length, input.paddedBytes))

  const pixels = isJpeg ? readJpegSize(bytes) : undefined
  const dpi = isJpeg ? readJpegDpi(bytes) : undefined
  checks.push(dimensionsCheck(upload, pixels, dpi, input.size))

  const wantedDpi = upload.dimensions?.kind === 'centimetres' || input.size?.basis === 'formready-default'
  if (wantedDpi && input.size) {
    checks.push({
      label: 'Resolution',
      rule: `${input.size.dpi} dpi`,
      found: dpi ? `${dpi} dpi` : 'Not recorded',
      result: dpi === input.size.dpi ? 'pass' : 'fail',
    })
  }

  if (upload.fileName) checks.push(nameCheck(upload, input.name, '.jpg'))
  return checks
}

export function checkPdf(upload: Upload, input: PdfCheckInput): Check[] {
  const { bytes, pageSizes } = input
  const isPdf = String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-'
  const checks: Check[] = [
    { label: 'File type', rule: 'PDF', found: isPdf ? 'PDF' : 'Not a PDF', result: isPdf ? 'pass' : 'fail' },
    sizeCheck(upload, bytes.length),
    {
      label: 'Pages',
      rule: 'Any',
      found: `${pageSizes.length} ${pageSizes.length === 1 ? 'page' : 'pages'}`,
      result: pageSizes.length > 0 ? 'info' : 'fail',
    },
  ]

  if (upload.pageSize === 'A4') {
    const wrong = pageSizes.findIndex((page) => !isA4(page))
    checks.push({
      label: 'Page size',
      rule: 'A4',
      found:
        wrong === -1
          ? pageSizes.length === 1
            ? 'A4'
            : `All ${pageSizes.length} pages A4`
          : `Page ${wrong + 1} is ${toMm(pageSizes[wrong].width)} × ${toMm(pageSizes[wrong].height)} mm`,
      result: wrong === -1 && pageSizes.length > 0 ? 'pass' : 'fail',
    })
  }

  if (upload.fileName) checks.push(nameCheck(upload, input.name, '.pdf'))
  return checks
}

// The byte limits the size check uses, in words, for under the report.
export function sizeRuleNote(upload: Upload): string {
  const { minKB, maxKB } = upload.size
  const max = `at most ${maxBytesFor(maxKB).toLocaleString('en-IN')} bytes`
  const min = minKB ? ` and at least ${minBytesFor(minKB).toLocaleString('en-IN')}` : ''
  return `Portals do not say whether a KB is 1,000 or 1,024 bytes, so the size is checked to pass either way: ${max}${min}.`
}

function sizeCheck(upload: Upload, bytes: number): Check {
  const { minKB, maxKB } = upload.size
  const fits = bytes <= maxBytesFor(maxKB) && (minKB === undefined || bytes >= minBytesFor(minKB))
  return {
    label: 'File size',
    rule: minKB ? `${minKB}–${maxKB} KB` : `Up to ${maxKB} KB`,
    found: `${toKB(bytes)} KB (${bytes.toLocaleString('en-IN')} bytes)`,
    result: fits ? 'pass' : 'fail',
  }
}

function paddingCheck(upload: Upload, bytes: number, padded: number): Check {
  return {
    label: 'Padding',
    rule: `At least ${upload.size.minKB} KB`,
    found: `The picture is ${toKB(bytes - padded)} KB. ${toKB(padded)} KB of blank data was added inside the file to reach the minimum; the picture is unchanged.`,
    result: 'info',
  }
}

function dimensionsCheck(
  upload: Upload,
  pixels: { width: number; height: number } | undefined,
  dpi: number | undefined,
  size: OutputSize | undefined,
): Check {
  const found = pixels ? `${pixels.width} × ${pixels.height} px` : 'Could not be read'
  const dimensions = upload.dimensions

  if (!pixels) return { label: 'Dimensions', rule: ruleText(upload, size), found, result: 'fail' }

  if (dimensions?.kind === 'pixels') {
    const exact = pixels.width === dimensions.width && pixels.height === dimensions.height
    return {
      label: 'Dimensions',
      rule: `${dimensions.width} × ${dimensions.height} px${dimensions.preferred ? ' (preferred)' : ''}`,
      found,
      result: exact ? 'pass' : 'fail',
    }
  }

  if (dimensions?.kind === 'pixelRange') {
    const { min, max, appliesTo } = dimensions
    const within = (value: number) => value >= min && value <= max
    const ok =
      appliesTo === 'width'
        ? within(pixels.width)
        : appliesTo === 'height'
          ? within(pixels.height)
          : within(pixels.width) && within(pixels.height)
    return { label: 'Dimensions', rule: ruleText(upload, size), found, result: ok ? 'pass' : 'fail' }
  }

  const cm = dimensions?.kind === 'centimetres' ? dimensions : size ? DEFAULT_SIZE_CM[upload.kind] : undefined
  if (cm) {
    // Physical size is pixels at the recorded resolution.
    const at = dpi ?? size?.dpi
    const physical = at ? `${toCm(pixels.width, at)} × ${toCm(pixels.height, at)} cm` : 'unknown cm'
    const ok =
      at !== undefined &&
      Math.abs((pixels.width / at) * 2.54 - cm.width) <= CM_TOLERANCE + 2.54 / at &&
      Math.abs((pixels.height / at) * 2.54 - cm.height) <= CM_TOLERANCE + 2.54 / at
    return {
      label: size?.basis === 'formready-default' ? 'Size (FormReady’s choice)' : 'Size',
      rule: ruleText(upload, size),
      found: `${found} = ${physical}`,
      result: ok ? 'pass' : 'fail',
    }
  }

  // No size rule, e.g. a photo ID: show what it is.
  return { label: 'Dimensions', rule: 'Any', found, result: 'info' }
}

function ruleText(upload: Upload, size: OutputSize | undefined): string {
  const dimensions = upload.dimensions
  if (dimensions?.kind === 'pixels') return `${dimensions.width} × ${dimensions.height} px`
  if (dimensions?.kind === 'pixelRange') {
    const side = { width: 'wide', height: 'tall', both: 'each side', unspecified: 'each side' }[dimensions.appliesTo]
    return `${dimensions.min}–${dimensions.max} px ${side}`
  }
  if (dimensions?.kind === 'centimetres') {
    return `${formatCm(dimensions.width)} × ${formatCm(dimensions.height)} cm${dimensions.approximate ? ' (about)' : ''}`
  }
  const cm = DEFAULT_SIZE_CM[upload.kind]
  if (cm && size) {
    return `${formatCm(cm.width)} × ${formatCm(cm.height)} cm (${cmToPixels(cm.width, size.dpi)} × ${cmToPixels(cm.height, size.dpi)} px)`
  }
  return 'Any'
}

function nameCheck(upload: Upload, name: string, extension: string): Check {
  const wanted = `${upload.fileName}${extension}`
  return {
    label: 'File name',
    rule: wanted,
    found: name,
    result: name === wanted ? 'pass' : 'fail',
  }
}

function isA4(page: { width: number; height: number }): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) <= b * PAGE_TOLERANCE
  return (
    (close(page.width, A4.width) && close(page.height, A4.height)) ||
    (close(page.width, A4.height) && close(page.height, A4.width))
  )
}

function toMm(points: number): number {
  return Math.round((points / 72) * 25.4)
}

function toCm(pixels: number, dpi: number): string {
  return ((pixels / dpi) * 2.54).toFixed(2)
}

function formatCm(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}
