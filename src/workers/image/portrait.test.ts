import { describe, expect, it } from 'vitest'
import { estimateHead, planPortraitCrop, type Face } from './portrait'

// A phone selfie: 3000 x 4000, face box 900 x 1000 in the upper middle.
const image = { width: 3000, height: 4000 }
const face: Face = {
  box: { x: 1050, y: 1200, width: 900, height: 1000 },
  score: 0.95,
  rightEye: { x: 1300, y: 1450 },
  leftEye: { x: 1700, y: 1450 },
}
const passport = { width: 350, height: 450 }

const { top: headTop, bottom: headBottom } = estimateHead(face)
const headHeight = headBottom - headTop

describe('estimateHead', () => {
  it('puts the crown above the eyes and the chin below the face box top', () => {
    expect(headTop).toBeLessThan(face.box.y)
    expect(headBottom).toBeGreaterThan(face.rightEye!.y)
    expect(headHeight).toBeGreaterThan(face.box.height)
  })

  it('falls back to a typical eye position without keypoints', () => {
    const noEyes = estimateHead({ box: face.box, score: 0.9 })
    expect(noEyes.bottom - noEyes.top).toBeCloseTo(headHeight)
  })
})

describe('planPortraitCrop', () => {
  it('sizes the crop so the head fills the requested share of the height', () => {
    const plan = planPortraitCrop(face, image, { output: passport, headCoverage: 0.75 })
    expect(plan.coverage).toBeCloseTo(0.75)
    expect(plan.crop.height).toBeCloseTo(headHeight / 0.75)
    expect(plan.crop.width / plan.crop.height).toBeCloseTo(350 / 450)
    expect(plan.warnings).toEqual([])
  })

  it('uses 70% when no coverage is given', () => {
    expect(planPortraitCrop(face, image, { output: passport }).coverage).toBeCloseTo(0.7)
  })

  it('centres the crop between the eyes and keeps the whole head inside', () => {
    const { crop } = planPortraitCrop(face, image, { output: passport, headCoverage: 0.75 })
    expect(crop.x + crop.width / 2).toBeCloseTo(1500)
    expect(crop.y).toBeLessThan(headTop)
    expect(crop.y + crop.height).toBeGreaterThan(headBottom)
  })

  it('leaves less space above the head than below it', () => {
    const { crop } = planPortraitCrop(face, image, { output: passport, headCoverage: 0.7 })
    const above = headTop - crop.y
    const below = crop.y + crop.height - headBottom
    expect(above).toBeGreaterThan(0)
    expect(above).toBeLessThan(below)
  })

  it('keeps the crop inside the photo when the face is near an edge', () => {
    const nearEdge = { ...face, box: { ...face.box, x: 100 }, rightEye: { x: 350, y: 1450 }, leftEye: { x: 750, y: 1450 } }
    const { crop } = planPortraitCrop(nearEdge, image, { output: passport, headCoverage: 0.75 })
    expect(crop.x).toBe(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(3000)
  })

  it('warns when the face fills the photo so the head cannot fit', () => {
    const close: Face = { box: { x: 200, y: 600, width: 2600, height: 3000 }, score: 0.9 }
    const plan = planPortraitCrop(close, image, { output: passport, headCoverage: 0.75 })
    expect(plan.crop.height).toBeLessThanOrEqual(4000)
    expect(plan.warnings).toContain('head-cut-off')
  })

  it('warns about a tilted head', () => {
    const tilted = { ...face, leftEye: { x: 1700, y: 1550 } }
    const plan = planPortraitCrop(tilted, image, { output: passport })
    expect(plan.tilt).toBeCloseTo(14.0, 0)
    expect(plan.warnings).toContain('tilted')
  })

  it('warns when the face is too small for the output size', () => {
    const tiny: Face = { box: { x: 1450, y: 1900, width: 90, height: 100 }, score: 0.8 }
    expect(planPortraitCrop(tiny, image, { output: passport }).warnings).toContain('low-resolution')
  })

  it('falls back to the box centre without eye positions', () => {
    const noEyes: Face = { box: face.box, score: 0.9 }
    const { crop } = planPortraitCrop(noEyes, image, { output: passport })
    expect(crop.x + crop.width / 2).toBeCloseTo(1500)
  })

  it('rejects a coverage outside (0, 1]', () => {
    expect(() => planPortraitCrop(face, image, { output: passport, headCoverage: 1.2 })).toThrow()
    expect(() => planPortraitCrop(face, image, { output: passport, headCoverage: 0 })).toThrow()
  })
})
