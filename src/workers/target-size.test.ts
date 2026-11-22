import { describe, expect, it } from 'vitest'
import { compressToSize, searchHighestFitting, TARGET_DPI_STEPS, type Attempt } from './target-size'

// Fake compressor: output size in bytes is a function of dpi.
function fake(sizeAt: (dpi: number) => number) {
  const runs: number[] = []
  const run = async (dpi: number) => {
    runs.push(dpi)
    return { bytes: sizeAt(dpi), output: `pdf@${dpi}` }
  }
  return { run, runs }
}

// Roughly how scanned pages behave: size grows with the square of dpi.
const scan = (dpi: number) => Math.round(dpi * dpi * 10)

describe('searchHighestFitting', () => {
  it('picks the highest resolution that fits', async () => {
    const { run } = fake(scan)
    // 120 dpi -> 144,000 bytes fits under 150,000; 150 dpi -> 225,000 does not.
    const result = await searchHighestFitting(TARGET_DPI_STEPS, 150_000, run)
    expect(result.fitting).toMatchObject({ dpi: 120, bytes: 144_000, output: 'pdf@120' })
  })

  it('needs at most four runs for eight steps', async () => {
    for (const limit of [1, 30_000, 60_000, 100_000, 150_000, 250_000, 500_000]) {
      const { run, runs } = fake(scan)
      await searchHighestFitting(TARGET_DPI_STEPS, limit, run)
      expect(runs.length).toBeLessThanOrEqual(4)
      expect(new Set(runs).size).toBe(runs.length)
    }
  })

  it('returns the best quality when everything fits', async () => {
    const { run } = fake(scan)
    const result = await searchHighestFitting(TARGET_DPI_STEPS, 10_000_000, run)
    expect(result.fitting?.dpi).toBe(200)
  })

  it('reports no fit and the smallest size when nothing fits', async () => {
    const { run } = fake(scan)
    const result = await searchHighestFitting(TARGET_DPI_STEPS, 1_000, run)
    expect(result.fitting).toBeUndefined()
    expect(result.smallest).toMatchObject({ dpi: 50, bytes: 25_000 })
  })

  it('never returns an output over the limit when sizes are uneven', async () => {
    // 100 dpi happens to come out larger than 120 dpi.
    const uneven = (dpi: number) => (dpi === 100 ? 200_000 : scan(dpi))
    const { run } = fake(uneven)
    const result = await searchHighestFitting(TARGET_DPI_STEPS, 150_000, run)
    expect(result.fitting).toBeDefined()
    expect(result.fitting!.bytes).toBeLessThanOrEqual(150_000)
  })

  it('reports each attempt as it happens', async () => {
    const { run } = fake(scan)
    const seen: Attempt[] = []
    const result = await searchHighestFitting(TARGET_DPI_STEPS, 150_000, run, (attempt) =>
      seen.push(attempt),
    )
    expect(seen).toEqual(result.attempts)
    expect(seen.length).toBeGreaterThan(0)
  })

  it('works with a single step', async () => {
    const { run } = fake(scan)
    const result = await searchHighestFitting([72], 60_000, run)
    expect(result.fitting?.dpi).toBe(72)
  })
})

describe('compressToSize', () => {
  // Fake compressor: an output of `scan(dpi)` bytes.
  const calls: Array<{ dpi: number; grayscale?: boolean }> = []
  const compress = async (_input: Blob, options: { dpi: number; grayscale?: boolean }) => {
    calls.push(options)
    return new Blob([new Uint8Array(scan(options.dpi))], { type: 'application/pdf' })
  }
  const input = new Blob([new Uint8Array(500_000)], { type: 'application/pdf' })

  it('returns a file under the limit unchanged, without compressing', async () => {
    calls.length = 0
    const result = await compressToSize(compress, input, { maxKB: 600 })
    expect(result.status).toBe('already-fits')
    expect(result.blob).toBe(input)
    expect(calls).toHaveLength(0)
  })

  it('still applies black and white to a file under the limit', async () => {
    calls.length = 0
    const result = await compressToSize(compress, input, { maxKB: 600, grayscale: true })
    expect(result.status).toBe('fits')
    expect(calls.every((call) => call.grayscale)).toBe(true)
  })

  it('compresses to the best quality under the limit', async () => {
    // 150 KB is read as 150,000 bytes; 120 dpi (144,000 bytes) is the best fit.
    const result = await compressToSize(compress, input, { maxKB: 150 })
    expect(result).toMatchObject({ status: 'fits', dpi: 120, bytes: 144_000 })
  })

  it('reads the limit as 1000-byte KB, so it passes either way a portal counts', async () => {
    // 50 KB is read as 50,000 bytes. 72 dpi gives 51,840 bytes, over the
    // limit; 60 dpi gives 36,000 bytes, which fits however the portal counts.
    const result = await compressToSize(compress, input, { maxKB: 50 })
    expect(result.dpi).toBe(60)
    // 52 KB: 51,840 bytes fits 52 x 1000 = 52,000, so 72 dpi is chosen.
    expect((await compressToSize(compress, input, { maxKB: 52 })).dpi).toBe(72)
  })

  it('returns the smallest result when nothing fits', async () => {
    const result = await compressToSize(compress, input, { maxKB: 10 })
    expect(result).toMatchObject({ status: 'too-big', dpi: 50, bytes: 25_000 })
  })

  it('rejects a limit that is not positive', async () => {
    await expect(compressToSize(compress, input, { maxKB: 0 })).rejects.toThrow('above 0 KB')
    await expect(compressToSize(compress, input, { maxKB: Number.NaN })).rejects.toThrow()
  })
})
