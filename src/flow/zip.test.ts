import { describe, expect, it } from 'vitest'
import { buildZip, crc32 } from './zip'

// Reads a stored ZIP back through its central directory, the way unzip
// tools do, so the test checks the offsets and sizes are consistent.
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  // The directory must run exactly up to the end record; unzip tools check.
  expect(at + view.getUint32(end + 12, true)).toBe(end)
  const files = []
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    files.push({ name, data: zip.subarray(start, start + size), crc })
    at += 46 + nameLength
  }
  return files
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('buildZip', () => {
  it('stores files that read back unchanged, in order', () => {
    const photo = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
    const pdf = new TextEncoder().encode('%PDF-1.7 marks')
    const files = readZip(buildZip([
      { name: 'photo.jpg', data: photo },
      { name: 'certificate.pdf', data: pdf },
    ]))
    expect(files.map((file) => file.name)).toEqual(['photo.jpg', 'certificate.pdf'])
    expect([...files[0].data]).toEqual([...photo])
    expect([...files[1].data]).toEqual([...pdf])
    expect(files[1].crc).toBe(crc32(pdf))
  })

  it('makes a valid empty archive', () => {
    expect(readZip(buildZip([]))).toEqual([])
  })

  it('refuses two files with the same name', () => {
    const data = new Uint8Array([1])
    expect(() => buildZip([{ name: 'a.jpg', data }, { name: 'a.jpg', data }])).toThrow('same name')
  })
})
