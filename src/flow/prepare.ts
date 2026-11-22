import { outputSizeFor } from '../presets/output-size'
import type { Upload } from '../presets'
import { minBytesFor } from '../workers/kilobytes'
import { getProcessor, type AutoCropProblem, type SignatureProblem } from '../workers/client'
import { downloadName } from './steps'
import { checkImage, checkPdf, type Check } from './validate'

// Runs one upload through the right tools for its kind and the exam's
// rules, and explains the result in plain language.

export interface Message {
  tone: 'info' | 'warning' | 'error'
  text: string
}

export interface Prepared {
  blob: Blob
  name: string
  bytes: number
  width?: number
  height?: number
  pages?: number
  // "ready": every check passed and nothing needs a look.
  // "needs-attention": a check failed, or see `messages`.
  status: 'ready' | 'needs-attention'
  // The exam's rules checked against the finished file.
  checks: Check[]
  messages: Message[]
}

export interface ImageSettings {
  // Photos: replace a cluttered background with white.
  whiteBackground: boolean
}

const PHOTO_PROBLEMS: Record<AutoCropProblem, Message> = {
  'no-face': {
    tone: 'warning',
    text: 'No face was found, so the photo was cropped from the centre. Use a front-facing photo with your whole face visible.',
  },
  'several-faces': {
    tone: 'warning',
    text: 'More than one face was found; the clearest one was used. Use a photo of only yourself.',
  },
  tilted: { tone: 'warning', text: 'Your head looks tilted. Portals reject tilted photos; hold your head straight.' },
  'head-cut-off': {
    tone: 'warning',
    text: 'Your head is too close to the camera or the edge of the photo to fit fully. Step back a little.',
  },
  'low-resolution': {
    tone: 'warning',
    text: 'Your face is small in this photo, so the result may look blurry. Take the photo closer.',
  },
}

const INK_PROBLEMS: Record<SignatureProblem, Message> = {
  'no-ink': {
    tone: 'error',
    text: 'No writing was found. Photograph the paper straight on, in good light, filling most of the frame.',
  },
  'low-resolution': {
    tone: 'warning',
    text: 'The writing is small in this photo, so it may look soft. Take the photo closer to the paper.',
  },
}

const SIZE_HINT: Message = {
  tone: 'error',
  text: 'This file does not meet the size limit. Try a different photo, or for a PDF, fewer or smaller pages.',
}

function statusOf(checks: Check[], messages: Message[]): Prepared['status'] {
  const passed = checks.every((check) => check.result !== 'fail')
  return passed && messages.every((message) => message.tone === 'info') ? 'ready' : 'needs-attention'
}

export async function prepareImage(upload: Upload, file: Blob, settings: ImageSettings): Promise<Prepared> {
  const processor = getProcessor()
  const messages: Message[] = []
  let source: Blob
  let size = outputSizeFor(upload)
  let allowShrink = false

  if (upload.kind === 'photo') {
    if (!size) throw new Error('No output size for this photo.')
    const crop = await processor.autoCropPortrait(file, {
      width: size.width,
      height: size.height,
      headCoverage: upload.minFaceCoverage,
      whiteBackground: settings.whiteBackground,
      quality: 0.95,
    })
    messages.push(...crop.problems.map((problem) => PHOTO_PROBLEMS[problem]))
    source = crop.blob
  } else if (upload.kind === 'document') {
    // An image document such as a photo ID keeps its own pixel size and
    // only shrinks if it must to fit the file size.
    source = file
    size = undefined
    allowShrink = true
  } else {
    if (!size) throw new Error('No output size for this upload.')
    if (upload.dimensions?.kind === 'pixelRange') {
      // The shape is up to us: find the writing first, then fit it.
      const probe = await processor.cleanSignature(file, { width: 200, height: 200 })
      if (probe.bounds) size = outputSizeFor(upload, { aspect: probe.bounds.width / probe.bounds.height })!
    }
    const clean = await processor.cleanSignature(file, { width: size.width, height: size.height })
    messages.push(...clean.problems.map((problem) => INK_PROBLEMS[problem]))
    source = clean.blob
  }

  const fitted = await processor.fitImageToSize(source, {
    minKB: upload.size.minKB,
    maxKB: upload.size.maxKB,
    dpi: size?.dpi,
    allowShrink,
  })
  if (fitted.status !== 'fits') messages.unshift(SIZE_HINT)
  if (size && size.basis !== 'portal-pixels') messages.push({ tone: 'info', text: size.note })

  const name = downloadName(upload)
  const checks = checkImage(upload, {
    bytes: new Uint8Array(await fitted.blob.arrayBuffer()),
    name,
    size,
    paddedBytes: fitted.paddedBytes,
  })
  return {
    blob: fitted.blob,
    name,
    bytes: fitted.bytes,
    width: fitted.width,
    height: fitted.height,
    status: statusOf(checks, messages),
    checks,
    messages,
  }
}

export async function preparePdf(upload: Upload, files: File[]): Promise<Prepared> {
  const processor = getProcessor()
  const messages: Message[] = []

  // Several files become one PDF, in the order chosen.
  let pdf: Blob
  let pages = 0
  if (files.length === 1) {
    pdf = files[0]
    pages = (await processor.inspectPdf(files[0], files[0].name)).pageCount
  } else {
    const counts = await Promise.all(files.map((file) => processor.inspectPdf(file, file.name)))
    const refs = counts.flatMap(({ pageCount }, source) =>
      Array.from({ length: pageCount }, (_, page) => ({ source, page })),
    )
    pdf = await processor.mergePdfPages(files, refs, files.map((file) => file.name))
    pages = refs.length
    messages.push({ tone: 'info', text: `${files.length} files merged into one PDF of ${pages} pages.` })
  }

  const result = await processor.compressPdfToSize(pdf, { maxKB: upload.size.maxKB })
  if (result.status === 'fits') {
    messages.push({
      tone: 'info',
      text: `Compressed with images at ${result.dpi} dpi to fit the limit.`,
    })
  }
  if (result.status === 'too-big') messages.unshift(SIZE_HINT)
  const belowMin = upload.size.minKB !== undefined && result.bytes < minBytesFor(upload.size.minKB)
  if (belowMin) {
    messages.push({
      tone: 'warning',
      text: `The PDF is under the ${upload.size.minKB} KB minimum. Scan it at a higher resolution, or check whether the portal accepts it.`,
    })
  }

  // Read the finished PDF again, so the report describes the real file.
  const name = downloadName(upload)
  const { pageSizes } = await processor.inspectPdf(result.blob, name)
  const checks = checkPdf(upload, { bytes: new Uint8Array(await result.blob.arrayBuffer()), name, pageSizes })
  if (checks.some((check) => check.label === 'Page size' && check.result === 'fail')) {
    messages.push({
      tone: 'warning',
      text: `The exam asks for ${upload.pageSize} pages. Scan the odd page again at ${upload.pageSize} size, or print it to an ${upload.pageSize} PDF, and choose the files again.`,
    })
  }
  return {
    blob: result.blob,
    name,
    bytes: result.bytes,
    pages,
    status: statusOf(checks, messages),
    checks,
    messages,
  }
}
