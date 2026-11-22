import { describe, expect, it } from 'vitest'
import { getPreset, presets } from './index'
import { cmToPixels, DEFAULT_DPI, outputSizeFor } from './output-size'
import type { Upload } from './schema'

const upload = (presetId: string, uploadId: string): Upload => {
  const found = getPreset(presetId)?.uploads.find((item) => item.id === uploadId)
  if (!found) throw new Error(`No upload ${presetId}/${uploadId}`)
  return found
}

describe('cmToPixels', () => {
  it('converts the 3.5 x 4.5 cm passport photo at 200 dpi', () => {
    expect(cmToPixels(3.5, 200)).toBe(276)
    expect(cmToPixels(4.5, 200)).toBe(354)
  })

  it('converts at 300 dpi', () => {
    expect(cmToPixels(3.5, 300)).toBe(413)
    expect(cmToPixels(2.54, 300)).toBe(300)
  })
})

describe('outputSizeFor', () => {
  it('uses exact pixels when the portal gives them (IBPS photo)', () => {
    expect(outputSizeFor(upload('ibps-po', 'photo'))).toMatchObject({
      width: 200,
      height: 230,
      basis: 'portal-pixels',
    })
  })

  it('converts centimetres at the default DPI and says FormReady chose it (UPSSSC photo)', () => {
    const size = outputSizeFor(upload('upsssc', 'photo'))!
    expect(size).toMatchObject({ width: 276, height: 354, dpi: DEFAULT_DPI, basis: 'portal-centimetres' })
    expect(size.note).toContain('FormReady uses 200 dpi')
  })

  it('honours a different DPI for centimetre sizes', () => {
    expect(outputSizeFor(upload('ssc-cgl', 'signature'), { dpi: 300 })).toMatchObject({
      width: 709,
      height: 236,
      dpi: 300,
    })
  })

  it('keeps both sides inside a range that names no side (UPSC signature)', () => {
    const signature = upload('upsc', 'signature')
    for (const aspect of [0.3, 0.8, 1, 1.4, 2.5, 6]) {
      const size = outputSizeFor(signature, { aspect })!
      for (const side of [size.width, size.height]) {
        expect(side).toBeGreaterThanOrEqual(350)
        expect(side).toBeLessThanOrEqual(500)
      }
      expect(size.basis).toBe('portal-range')
    }
  })

  it('follows the content shape inside the range where it can', () => {
    // Three signatures stacked: taller than wide.
    expect(outputSizeFor(upload('upsc', 'signature'), { aspect: 0.8 })).toMatchObject({ width: 400, height: 500 })
  })

  it('falls back to standard sizes where the portal gives none (NEET photo and signature)', () => {
    expect(outputSizeFor(upload('nta-neet-ug', 'photo'))).toMatchObject({
      width: 276,
      height: 354,
      basis: 'formready-default',
    })
    expect(outputSizeFor(upload('nta-neet-ug', 'signature'))).toMatchObject({ width: 276, height: 118 })
  })

  it('returns nothing for PDF documents', () => {
    expect(outputSizeFor(upload('upsc', 'board-certificate'))).toBeUndefined()
  })

  it('gives every image upload in every preset a usable size and an explanation', () => {
    for (const preset of presets) {
      for (const item of preset.uploads) {
        const size = outputSizeFor(item)
        if (item.format === 'pdf') {
          expect(size).toBeUndefined()
          continue
        }
        // Image documents such as a photo ID keep their own size.
        if (item.kind === 'document') continue
        expect(size, `${preset.id}/${item.id}`).toBeDefined()
        expect(size!.width).toBeGreaterThanOrEqual(60)
        expect(size!.height).toBeGreaterThanOrEqual(60)
        expect(size!.width).toBeLessThanOrEqual(2000)
        expect(size!.note.length).toBeGreaterThan(10)
      }
    }
  })
})
