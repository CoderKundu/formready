import { describe, expect, it } from 'vitest'
import { getPreset, presets } from '../presets'
import { downloadName, isStepId, stepsFor } from './steps'

describe('stepsFor', () => {
  it('always gives three steps in order', () => {
    for (const preset of presets) {
      expect(stepsFor(preset).map((step) => step.id)).toEqual(['photo', 'signature', 'documents'])
    }
  })

  it('puts every upload in exactly one step', () => {
    for (const preset of presets) {
      const placed = stepsFor(preset).flatMap((step) => step.uploads.map((upload) => upload.id))
      expect(placed.sort()).toEqual(preset.uploads.map((upload) => upload.id).sort())
    }
  })

  it('explains that SSC takes the photo live', () => {
    const [photo] = stepsFor(getPreset('ssc-cgl')!)
    expect(photo.uploads).toHaveLength(0)
    expect(photo.emptyNote).toContain('live')
  })

  it('groups IBPS signature, thumb impression and declaration', () => {
    const signature = stepsFor(getPreset('ibps-po')!)[1]
    expect(signature.uploads.map((upload) => upload.kind)).toEqual(['signature', 'thumbImpression', 'declaration'])
    expect(signature.title).toBe('Signature and more')
  })

  it('has no empty note for steps with uploads', () => {
    const steps = stepsFor(getPreset('upsc')!)
    expect(steps.every((step) => step.emptyNote === undefined)).toBe(true)
  })
})

describe('downloadName and isStepId', () => {
  it('uses the portal-required name for UPSC', () => {
    const upsc = getPreset('upsc')!
    expect(downloadName(upsc.uploads.find((upload) => upload.id === 'photo-id')!)).toBe('id_card.jpg')
    expect(downloadName(upsc.uploads.find((upload) => upload.id === 'board-certificate')!)).toBe('board_certificate.pdf')
  })

  it('falls back to the upload id', () => {
    expect(downloadName(getPreset('ibps-po')!.uploads[0])).toBe('photo.jpg')
  })

  it('recognises step ids', () => {
    expect(isStepId('signature')).toBe(true)
    expect(isStepId('payment')).toBe(false)
    expect(isStepId(null)).toBe(false)
  })
})
