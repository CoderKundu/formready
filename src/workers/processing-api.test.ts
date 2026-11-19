import { describe, expect, it } from 'vitest'
import { processingApi } from './processing-api'

describe('processingApi', () => {
  it('reports capabilities as booleans', () => {
    const capabilities = processingApi.getCapabilities()
    expect(Object.values(capabilities).every((value) => typeof value === 'boolean')).toBe(true)
    expect(capabilities.webAssembly).toBe(true)
  })

  it('describes a blob in bytes and kilobytes of 1024 bytes', () => {
    const blob = new Blob([new Uint8Array(20 * 1024 + 512)], { type: 'image/jpeg' })
    expect(processingApi.describeBlob(blob)).toEqual({
      bytes: 20 * 1024 + 512,
      kilobytes: 20.5,
      type: 'image/jpeg',
    })
  })

  it('describes an empty blob', () => {
    expect(processingApi.describeBlob(new Blob([]))).toEqual({ bytes: 0, kilobytes: 0, type: '' })
  })
})
