import { describe, expect, it } from 'vitest'
import { getPreset, loadPresets, presets } from './index'

describe('preset files', () => {
  it('loads one preset for each exam, sorted by name', () => {
    expect(presets.map((preset) => preset.id)).toEqual([
      'ibps-po',
      'nta-jee-main',
      'nta-neet-ug',
      'ssc-cgl',
      'upsc',
      'upsssc',
    ])
  })

  it('finds a preset by id', () => {
    expect(getPreset('upsc')?.body).toBe('Union Public Service Commission')
    expect(getPreset('missing')).toBeUndefined()
  })

  it('has no photo upload for SSC, where the photo is captured live', () => {
    const ssc = getPreset('ssc-cgl')
    expect(ssc?.liveCapture).toBe(true)
    expect(ssc?.uploads.some((upload) => upload.kind === 'photo')).toBe(false)
  })

  it('keeps the file names UPSC enforces', () => {
    const names = getPreset('upsc')?.uploads.map((upload) => upload.fileName)
    expect(names).toContain('photo')
    expect(names).toContain('signature')
    expect(names).toContain('id_card')
  })

  it('uses a size range that satisfies both conflicting NEET figures', () => {
    const thumbs = getPreset('nta-neet-ug')?.uploads.find(
      (upload) => upload.id === 'finger-thumb-impressions',
    )
    expect(thumbs?.size).toEqual({ minKB: 50, maxKB: 200 })
    expect(thumbs?.conflicts).toHaveLength(1)
  })
})

describe('loadPresets', () => {
  const valid = {
    id: 'example',
    name: 'Example',
    body: 'Example Board',
    exam: 'Example Exam 2027',
    source: {
      title: 'Example notice',
      url: 'https://example.gov.in/notice.pdf',
      checkedOn: '2026-11-15',
    },
    liveCapture: false,
    uploads: [
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        format: 'jpeg',
        size: { minKB: 10, maxKB: 20 },
        required: 'always',
        rules: [],
        conflicts: [],
      },
    ],
    notes: [],
  }

  const upload = valid.uploads[0]

  it('accepts a valid preset', () => {
    expect(loadPresets({ './example.json': valid })).toHaveLength(1)
  })

  it('rejects an id that does not match the file name', () => {
    expect(() => loadPresets({ './other.json': valid })).toThrow(/must match the file name/)
  })

  it('rejects a misspelt key', () => {
    const typo = { ...valid, uploads: [{ ...upload, maxKb: 20 }] }
    expect(() => loadPresets({ './example.json': typo })).toThrow(/uploads\.0/)
  })

  it('rejects a minimum size above the maximum', () => {
    const inverted = { ...valid, uploads: [{ ...upload, size: { minKB: 30, maxKB: 20 } }] }
    expect(() => loadPresets({ './example.json': inverted })).toThrow(/minKB must not be larger/)
  })

  it('rejects duplicate upload ids', () => {
    const duplicated = { ...valid, uploads: [upload, upload] }
    expect(() => loadPresets({ './example.json': duplicated })).toThrow(/duplicate upload id/)
  })

  it('rejects a source link that is not https', () => {
    const insecure = { ...valid, source: { ...valid.source, url: 'http://example.gov.in' } }
    expect(() => loadPresets({ './example.json': insecure })).toThrow(/source\.url/)
  })

  it('rejects pixel dimensions on a PDF', () => {
    const pdf = {
      ...valid,
      uploads: [
        {
          ...upload,
          format: 'pdf',
          dimensions: { kind: 'pixels', width: 100, height: 100, preferred: false },
        },
      ],
    }
    expect(() => loadPresets({ './example.json': pdf })).toThrow(/PDF uploads use pageSize/)
  })
})
