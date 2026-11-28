// Builds a ZIP file in the browser, so every prepared file can be
// downloaded at once. Files are stored without compression: JPGs and PDFs
// are already compressed, so deflating them again saves almost nothing,
// and storing keeps this small and dependency-free.
// Format: PKWARE APPNOTE.TXT, sections 4.3.7 (local header), 4.3.12
// (central directory) and 4.3.16 (end of central directory).

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// MS-DOS date and time, as ZIP records them (local time, 2-second steps).
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

const VERSION = 20 // 2.0: plain stored files
const UTF8_NAMES = 0x0800 // general purpose flag bit 11

export function buildZip(entries: ZipEntry[], modified = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const stamp = dosDateTime(modified)
  const names = entries.map((entry) => encoder.encode(entry.name))
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) {
    throw new Error('Two files in the ZIP have the same name.')
  }

  const localSize = entries.reduce((sum, entry, i) => sum + 30 + names[i].length + entry.data.length, 0)
  const centralSize = names.reduce((sum, name) => sum + 46 + name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  let at = 0
  const u16 = (value: number) => {
    view.setUint16(at, value, true)
    at += 2
  }
  const u32 = (value: number) => {
    view.setUint32(at, value, true)
    at += 4
  }
  const bytes = (value: Uint8Array) => {
    out.set(value, at)
    at += value.length
  }

  const offsets: number[] = []
  const crcs = entries.map((entry) => crc32(entry.data))
  entries.forEach((entry, i) => {
    offsets.push(at)
    u32(0x04034b50)
    u16(VERSION)
    u16(UTF8_NAMES)
    u16(0) // stored
    u16(stamp.time)
    u16(stamp.date)
    u32(crcs[i])
    u32(entry.data.length)
    u32(entry.data.length)
    u16(names[i].length)
    u16(0) // no extra field
    bytes(names[i])
    bytes(entry.data)
  })

  const centralStart = at
  entries.forEach((entry, i) => {
    u32(0x02014b50)
    u16(VERSION)
    u16(VERSION)
    u16(UTF8_NAMES)
    u16(0)
    u16(stamp.time)
    u16(stamp.date)
    u32(crcs[i])
    u32(entry.data.length)
    u32(entry.data.length)
    u16(names[i].length)
    u16(0) // extra
    u16(0) // comment
    u16(0) // disk
    u16(0) // internal attributes
    u32(0) // external attributes
    u32(offsets[i])
    bytes(names[i])
  })

  const centralLength = at - centralStart
  u32(0x06054b50)
  u16(0) // this disk
  u16(0) // disk where the central directory starts
  u16(entries.length)
  u16(entries.length)
  u32(centralLength)
  u32(centralStart)
  u16(0) // no comment
  return out
}
