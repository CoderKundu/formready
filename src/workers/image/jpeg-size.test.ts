import { describe, expect, it } from 'vitest'
import { readJpegOrientation, withJpegOrientation } from './exif'
import { MAX_QUALITY, MIN_QUALITY, nextScale, padJpeg, searchQuality } from './jpeg-size'

// Fake encoder: size grows with quality, like a real JPEG encoder.
function fakeEncoder(bytesAt: (quality: number) => number) {
  const qualities: number[] = []
  const encode = async (quality: number) => {
    qualities.push(quality)
    return { bytes: Math.round(bytesAt(quality)), output: `jpeg@${quality.toFixed(3)}` }
  }
  return { encode, qualities }
}

// A photo: 8 KB at the lowest quality up to 120 KB at the highest.
const photo = (quality: number) => 8_000 + 112_000 * quality ** 2

describe('searchQuality', () => {
  it('finds the highest quality under the limit', async () => {
    const { encode } = fakeEncoder(photo)
    const result = await searchQuality(encode, 50_000)
    expect(result.fitting!.bytes).toBeLessThanOrEqual(50_000)
    // Exact answer: 8000 + 112000 q^2 = 50000 -> q = 0.612.
    expect(result.fitting!.quality).toBeGreaterThan(0.59)
    expect(result.fitting!.quality).toBeLessThanOrEqual(0.613)
  })

  it('needs few encodes', async () => {
    const { encode, qualities } = fakeEncoder(photo)
    await searchQuality(encode, 50_000)
    expect(qualities.length).toBeLessThanOrEqual(8)
  })

  it('uses full quality at once when it already fits (a huge target)', async () => {
    const { encode, qualities } = fakeEncoder(photo)
    const result = await searchQuality(encode, 1_000_000)
    expect(result.fitting!.quality).toBe(MAX_QUALITY)
    expect(qualities).toEqual([MAX_QUALITY])
  })

  it('reports no fit for a tiny target, with the smallest size reached', async () => {
    const { encode } = fakeEncoder(photo)
    const result = await searchQuality(encode, 5_000)
    expect(result.fitting).toBeUndefined()
    expect(result.lowest.quality).toBe(MIN_QUALITY)
    expect(result.lowest.bytes).toBe(Math.round(photo(MIN_QUALITY)))
  })

  it('handles an already-small input that fits at every quality', async () => {
    const { encode } = fakeEncoder(() => 2_500)
    const result = await searchQuality(encode, 20_000)
    expect(result.fitting).toMatchObject({ quality: MAX_QUALITY, bytes: 2_500 })
  })

  it('never returns an output over the limit when sizes are uneven', async () => {
    // Real encoders are not perfectly smooth.
    const { encode } = fakeEncoder((q) => photo(q) + (Math.round(q * 100) % 7 === 0 ? 9_000 : 0))
    const result = await searchQuality(encode, 50_000)
    expect(result.fitting!.bytes).toBeLessThanOrEqual(50_000)
  })
})

describe('nextScale', () => {
  it('scales by a bit under the square root of the size ratio', () => {
    expect(nextScale(400_000, 100_000)).toBeCloseTo(0.475)
  })

  it('always shrinks at least a little', () => {
    expect(nextScale(101_000, 100_000)).toBeLessThanOrEqual(0.95)
  })
})

describe('padJpeg', () => {
  // Start marker, a JFIF APP0 segment, a comment, then start of scan.
  const jpeg = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
    0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9,
  ])

  it('pads to exactly the target size', () => {
    for (const target of [jpeg.length + 4, jpeg.length + 100, 10 * 1024, 70_000, 200_000]) {
      expect(padJpeg(jpeg, target).length).toBe(target)
    }
  })

  it('handles a gap too small for one segment by going slightly over', () => {
    // The smallest comment segment is 4 bytes.
    expect(padJpeg(jpeg, jpeg.length + 2).length).toBe(jpeg.length + 4)
  })

  it('keeps the original bytes in order around the padding', () => {
    const padded = padJpeg(jpeg, 300)
    expect([...padded.subarray(0, 10)]).toEqual([...jpeg.subarray(0, 10)])
    expect([...padded.subarray(padded.length - 8)]).toEqual([...jpeg.subarray(10)])
    // Padding starts with a comment marker right after APP0.
    expect([padded[10], padded[11]]).toEqual([0xff, 0xfe])
  })

  it('writes well-formed comment segments, each at most 65535 bytes long', () => {
    const padded = padJpeg(jpeg, 150_000)
    let offset = 10
    let total = 0
    while (padded[offset] === 0xff && padded[offset + 1] === 0xfe) {
      const length = (padded[offset + 2] << 8) | padded[offset + 3]
      expect(length).toBeLessThanOrEqual(65535)
      expect(length).toBeGreaterThanOrEqual(2)
      total += length + 2
      offset += length + 2
    }
    expect(total).toBe(150_000 - jpeg.length)
    expect([padded[offset], padded[offset + 1]]).toEqual([0xff, 0xda])
  })

  it('leaves EXIF readable', () => {
    const tagged = withJpegOrientation(jpeg, 6)
    expect(readJpegOrientation(padJpeg(tagged, 20_000))).toBe(6)
  })

  it('returns a file that is already big enough unchanged', () => {
    expect(padJpeg(jpeg, 5)).toBe(jpeg)
  })

  it('rejects files that are not JPEGs', () => {
    expect(() => padJpeg(new Uint8Array([0x89, 0x50]), 100)).toThrow('Not a JPEG')
  })
})
