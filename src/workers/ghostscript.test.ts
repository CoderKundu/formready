import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { crc32, deflateSync } from 'node:zlib'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { compressionArgs, createCompressor } from './ghostscript'

// Builds an RGB PNG with a gradient and some noise, like a phone photo of a
// marksheet: large, and hard to compress losslessly.
function makePng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB

  let seed = 1
  const noise = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 24)
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3
      raw[i] = (x * 200) / width + noise()
      raw[i + 1] = (y * 200) / height + noise()
      raw[i + 2] = 150 + noise()
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array()),
  ])
}

// One A4 page filled with a 1240 x 1754 image, about 150 dpi.
async function makeScannedPdf(): Promise<Blob> {
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(makePng(1240, 1754))
  const page = doc.addPage([595, 842])
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  page.drawText('Marksheet', { x: 40, y: 780, size: 24 })
  const bytes = await doc.save()
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
}

async function pageCount(blob: Blob): Promise<number> {
  return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount()
}

const wasmPath = createRequire(import.meta.url).resolve('@okathira/ghostpdl-wasm/gs.wasm')
let compiles = 0
const compressor = createCompressor(async () => {
  compiles++
  return WebAssembly.compile(await readFile(wasmPath))
})

describe('compressionArgs', () => {
  it('sets colour and grey images to the chosen resolution', () => {
    const args = compressionArgs({ dpi: 100 })
    expect(args).toContain('-dColorImageResolution=100')
    expect(args).toContain('-dGrayImageResolution=100')
    expect(args).toContain('-dMonoImageResolution=300')
    expect(args).toContain('-dSAFER')
    expect(args.some((arg) => arg.includes('Gray'))).toBe(true)
    expect(args).not.toContain('-sColorConversionStrategy=Gray')
  })

  it('adds greyscale conversion when asked', () => {
    expect(compressionArgs({ dpi: 150, grayscale: true })).toContain('-sColorConversionStrategy=Gray')
  })

  it('rejects resolutions outside 36 to 600 dpi', () => {
    expect(() => compressionArgs({ dpi: 20 })).toThrow('36 to 600')
    expect(() => compressionArgs({ dpi: 72.5 })).toThrow('whole number')
  })
})

describe('createCompressor', () => {
  let input: Blob

  beforeAll(async () => {
    input = await makeScannedPdf()
  })

  it(
    'shrinks an image-heavy PDF and keeps its pages',
    async () => {
      const output = await compressor.compress(input, { dpi: 72 })
      expect(output.type).toBe('application/pdf')
      expect(output.size).toBeLessThan(input.size / 5)
      expect(await pageCount(output)).toBe(1)
    },
    120_000,
  )

  it(
    'makes a smaller file at a lower resolution',
    async () => {
      const high = await compressor.compress(input, { dpi: 150 })
      const low = await compressor.compress(input, { dpi: 72 })
      expect(low.size).toBeLessThan(high.size)
    },
    120_000,
  )

  it(
    'makes a smaller file in greyscale',
    async () => {
      const colour = await compressor.compress(input, { dpi: 100 })
      const grey = await compressor.compress(input, { dpi: 100, grayscale: true })
      expect(grey.size).toBeLessThan(colour.size)
    },
    120_000,
  )

  it('compiles the WASM only once across runs', () => {
    expect(compiles).toBe(1)
  })

  it(
    'reports a file that is not a PDF',
    async () => {
      await expect(
        compressor.compress(new Blob(['not a pdf']), { dpi: 100 }),
      ).rejects.toThrow('could not be compressed')
    },
    120_000,
  )

  it('retries the download after a failure', async () => {
    let attempts = 0
    const flaky = createCompressor(async () => {
      attempts++
      if (attempts === 1) throw new Error('offline')
      return WebAssembly.compile(await readFile(wasmPath))
    })
    await expect(flaky.load()).rejects.toThrow('offline')
    await expect(flaky.load()).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  }, 120_000)
})

describe('compressToSize with Ghostscript', () => {
  it(
    'fits a scanned page under 100 KB at the best quality that fits',
    async () => {
      const { compressToSize } = await import('./target-size')
      const input = await makeScannedPdf()
      const result = await compressToSize(compressor.compress, input, { maxKB: 100 })
      expect(result.status).toBe('fits')
      expect(result.bytes).toBeLessThanOrEqual(100_000)
      expect(result.attempts.length).toBeLessThanOrEqual(4)
      // Every resolution above the chosen one that was tried came out too big.
      for (const attempt of result.attempts) {
        if (attempt.dpi > result.dpi!) expect(attempt.bytes).toBeGreaterThan(100_000)
      }
      expect(await pageCount(result.blob)).toBe(1)
    },
    240_000,
  )
})
