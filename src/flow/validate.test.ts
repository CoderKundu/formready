import { describe, expect, it } from 'vitest'
import type { Upload } from '../presets'
import { outputSizeFor } from '../presets/output-size'
import { readJpegSize, setJpegDpi } from '../workers/image/jpeg-size'
import { checkImage, checkPdf, sizeRuleNote, type Check } from './validate'

// A JPEG skeleton: start, a frame header of the given size, start of scan,
// end. Enough for the checks, which read headers only.
function jpeg(width: number, height: number, dpi?: number, totalBytes?: number): Uint8Array {
  const head = [
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x02,
  ]
  const fill = Math.max(0, (totalBytes ?? 0) - head.length - 2 - (dpi ? 18 : 0))
  const bytes = new Uint8Array([...head, ...new Array<number>(fill).fill(0x55), 0xff, 0xd9])
  return dpi ? setJpegDpi(bytes, dpi) : bytes
}

function upload(overrides: Partial<Upload>): Upload {
  return {
    id: 'photo',
    label: 'Photograph',
    kind: 'photo',
    format: 'jpeg',
    size: { minKB: 20, maxKB: 50 },
    required: 'always',
    rules: [],
    conflicts: [],
    ...overrides,
  }
}

const byLabel = (checks: Check[], label: string) => checks.find((check) => check.label.startsWith(label))

describe('readJpegSize', () => {
  it('reads the frame header after other segments', () => {
    expect(readJpegSize(jpeg(200, 230, 200))).toEqual({ width: 200, height: 230 })
  })

  it('returns undefined for a file that is not a JPEG', () => {
    expect(readJpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined()
  })
})

describe('checkImage', () => {
  const exact = upload({ dimensions: { kind: 'pixels', width: 200, height: 230, preferred: false } })

  it('passes a file that meets every rule', () => {
    const checks = checkImage(exact, { bytes: jpeg(200, 230, 200, 30_000), name: 'photo.jpg', paddedBytes: 0 })
    expect(checks.map((check) => check.result)).toEqual(['pass', 'pass', 'pass'])
    expect(byLabel(checks, 'File size')!.rule).toBe('20–50 KB')
  })

  it('fails the wrong pixel size, read from the file', () => {
    const checks = checkImage(exact, { bytes: jpeg(201, 230, 200, 30_000), name: 'photo.jpg', paddedBytes: 0 })
    expect(byLabel(checks, 'Dimensions')).toMatchObject({ result: 'fail', found: '201 × 230 px' })
  })

  it('reads limits so the file passes for 1000- and 1024-byte KB', () => {
    // 50 KB of 1024 bytes would allow 51,200; the check allows only 50,000.
    const over = checkImage(exact, { bytes: jpeg(200, 230, 200, 50_500), name: 'photo.jpg', paddedBytes: 0 })
    expect(byLabel(over, 'File size')!.result).toBe('fail')
    // 20 KB of 1000 bytes would allow 20,000; the check needs 20,480.
    const under = checkImage(exact, { bytes: jpeg(200, 230, 200, 20_200), name: 'photo.jpg', paddedBytes: 0 })
    expect(byLabel(under, 'File size')!.result).toBe('fail')
    expect(sizeRuleNote(exact)).toContain('at most 50,000 bytes and at least 20,480')
  })

  it('states padding plainly', () => {
    const checks = checkImage(exact, { bytes: jpeg(200, 230, 200, 21_000), name: 'photo.jpg', paddedBytes: 9_000 })
    const padding = byLabel(checks, 'Padding')!
    expect(padding.result).toBe('info')
    expect(padding.found).toContain('The picture is 11.7 KB. 8.8 KB of blank data was added')
  })

  it('checks centimetres at the recorded resolution', () => {
    const cm = upload({ dimensions: { kind: 'centimetres', width: 3.5, height: 4.5, approximate: false } })
    const size = outputSizeFor(cm)!
    const good = checkImage(cm, { bytes: jpeg(size.width, size.height, 200, 30_000), name: 'photo.jpg', size, paddedBytes: 0 })
    expect(byLabel(good, 'Size')).toMatchObject({ result: 'pass', found: '276 × 354 px = 3.51 × 4.50 cm' })
    expect(byLabel(good, 'Resolution')).toMatchObject({ result: 'pass', rule: '200 dpi' })

    // Same pixels but no resolution recorded: prints at the wrong size.
    const bare = checkImage(cm, { bytes: jpeg(size.width, size.height, undefined, 30_000), name: 'photo.jpg', size, paddedBytes: 0 })
    expect(byLabel(bare, 'Resolution')).toMatchObject({ result: 'fail', found: 'Not recorded' })
  })

  it('checks a pixel range on both sides when the portal does not say which', () => {
    const range = upload({
      kind: 'signature',
      dimensions: { kind: 'pixelRange', min: 350, max: 500, appliesTo: 'unspecified' },
    })
    const ok = checkImage(range, { bytes: jpeg(500, 380, 200, 30_000), name: 'signature.jpg', paddedBytes: 0 })
    expect(byLabel(ok, 'Dimensions')).toMatchObject({ result: 'pass', rule: '350–500 px each side' })
    const short = checkImage(range, { bytes: jpeg(500, 200, 200, 30_000), name: 'signature.jpg', paddedBytes: 0 })
    expect(byLabel(short, 'Dimensions')!.result).toBe('fail')
  })

  it('checks a required file name', () => {
    const named = upload({ fileName: 'photo', dimensions: { kind: 'pixels', width: 200, height: 230, preferred: false } })
    const checks = checkImage(named, { bytes: jpeg(200, 230, 200, 30_000), name: 'photo.jpg', paddedBytes: 0 })
    expect(byLabel(checks, 'File name')).toMatchObject({ result: 'pass', rule: 'photo.jpg' })
    const renamed = checkImage(named, { bytes: jpeg(200, 230, 200, 30_000), name: 'Photo.jpeg', paddedBytes: 0 })
    expect(byLabel(renamed, 'File name')!.result).toBe('fail')
  })

  it('only describes the size of an image with no size rule', () => {
    const id = upload({ kind: 'document', size: { maxKB: 300 } })
    const checks = checkImage(id, { bytes: jpeg(1200, 800, undefined, 90_000), name: 'id.jpg', paddedBytes: 0 })
    expect(byLabel(checks, 'Dimensions')).toMatchObject({ result: 'info', found: '1200 × 800 px' })
    expect(byLabel(checks, 'File size')!.rule).toBe('Up to 300 KB')
  })

  it('fails a file that is not a JPEG', () => {
    const checks = checkImage(exact, { bytes: new Uint8Array(30_000), name: 'photo.jpg', paddedBytes: 0 })
    expect(byLabel(checks, 'File type')!.result).toBe('fail')
    expect(byLabel(checks, 'Dimensions')).toMatchObject({ result: 'fail', found: 'Could not be read' })
  })
})

describe('checkPdf', () => {
  const certificate = upload({ id: 'certificate', kind: 'document', format: 'pdf', size: { maxKB: 500 }, pageSize: 'A4' })
  const pdfBytes = (length: number) => {
    const bytes = new Uint8Array(length)
    bytes.set([...'%PDF-1.7'].map((char) => char.charCodeAt(0)))
    return bytes
  }
  const a4 = { width: 595.28, height: 841.89 }

  it('passes A4 pages in either orientation', () => {
    const checks = checkPdf(certificate, {
      bytes: pdfBytes(400_000),
      name: 'certificate.pdf',
      pageSizes: [a4, { width: a4.height, height: a4.width }],
    })
    expect(checks.map((check) => check.result)).toEqual(['pass', 'pass', 'info', 'pass'])
    expect(byLabel(checks, 'Page size')!.found).toBe('All 2 pages A4')
  })

  it('names the first page that is not A4', () => {
    const letter = { width: 612, height: 792 }
    const checks = checkPdf(certificate, { bytes: pdfBytes(400_000), name: 'certificate.pdf', pageSizes: [a4, letter] })
    expect(byLabel(checks, 'Page size')).toMatchObject({ result: 'fail', found: 'Page 2 is 216 × 279 mm' })
  })

  it('fails a PDF over the limit', () => {
    const checks = checkPdf(certificate, { bytes: pdfBytes(510_000), name: 'certificate.pdf', pageSizes: [a4] })
    expect(byLabel(checks, 'File size')!.result).toBe('fail')
  })
})
