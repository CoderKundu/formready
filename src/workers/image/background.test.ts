import { describe, expect, it } from 'vitest'
import { confidenceToAlpha, MASK_HIGH, MASK_LOW } from './background'

describe('confidenceToAlpha', () => {
  it('makes unlikely pixels transparent and likely ones opaque', () => {
    expect([...confidenceToAlpha(new Float32Array([0, MASK_LOW, MASK_HIGH, 1]))]).toEqual([0, 0, 255, 255])
  })

  it('blends smoothly in between, half way at the middle of the band', () => {
    const middle = (MASK_LOW + MASK_HIGH) / 2
    const alpha = confidenceToAlpha(new Float32Array([MASK_LOW + 0.05, middle, MASK_HIGH - 0.05]))
    expect(alpha[0]).toBeGreaterThan(0)
    expect(alpha[1]).toBe(128)
    expect(alpha[2]).toBeLessThan(255)
    expect(alpha[0]).toBeLessThan(alpha[1])
    expect(alpha[1]).toBeLessThan(alpha[2])
  })

  it('never goes outside 0 to 255 for odd model output', () => {
    expect([...confidenceToAlpha(new Float32Array([-0.2, 1.4, Number.NaN]))]).toEqual([0, 255, 0])
  })
})
