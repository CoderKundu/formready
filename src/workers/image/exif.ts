// Reads and writes the EXIF Orientation tag in JPEG files.
//
// Phone cameras store photos in the sensor's orientation and record how to
// turn them in this tag (1 = upright, 6 = turn 90° clockwise, and so on).
// Ignoring it gives sideways or upside-down photos.

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const ORIENTATION_TAG = 0x0112

// Returns the orientation of a JPEG, or 1 when the file is not a JPEG, has
// no EXIF data, or the data is malformed.
export function readJpegOrientation(bytes: Uint8Array): Orientation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1

  let offset = 2
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00) return 1
    // Start of scan: image data follows, no more metadata.
    if (marker === 0xffda) return 1
    const length = view.getUint16(offset + 2)
    if (length < 2) return 1

    if (marker === 0xffe1 && offset + 10 <= view.byteLength && isExifHeader(view, offset + 4)) {
      return readTiffOrientation(view, offset + 10, Math.min(offset + 2 + length, view.byteLength))
    }
    offset += 2 + length
  }
  return 1
}

function isExifHeader(view: DataView, at: number): boolean {
  // "Exif\0\0"
  return view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0
}

function readTiffOrientation(view: DataView, tiff: number, end: number): Orientation {
  if (tiff + 8 > end) return 1
  const order = view.getUint16(tiff)
  const little = order === 0x4949 // "II"
  if (!little && order !== 0x4d4d) return 1 // not "MM" either

  const ifd = tiff + view.getUint32(tiff + 4, little)
  if (ifd + 2 > end) return 1
  const count = view.getUint16(ifd, little)

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return 1
    if (view.getUint16(entry, little) === ORIENTATION_TAG) {
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? (value as Orientation) : 1
    }
  }
  return 1
}

// Inserts an EXIF segment holding only the orientation tag right after the
// JPEG start marker. Used to test whether the browser applies orientation,
// and by tests.
export function withJpegOrientation(jpeg: Uint8Array, orientation: Orientation): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG file.')

  // APP1 marker, length, "Exif\0\0", big-endian TIFF header, one IFD entry.
  const segment = new Uint8Array(2 + 2 + 6 + 8 + 2 + 12 + 4)
  const view = new DataView(segment.buffer)
  view.setUint16(0, 0xffe1)
  view.setUint16(2, segment.length - 2)
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4)
  view.setUint16(10, 0x4d4d) // "MM"
  view.setUint16(12, 42)
  view.setUint32(14, 8) // IFD0 starts right after the 8-byte header
  view.setUint16(18, 1) // one entry
  view.setUint16(20, ORIENTATION_TAG)
  view.setUint16(22, 3) // SHORT
  view.setUint32(24, 1) // one value
  view.setUint16(28, orientation)
  view.setUint32(32, 0) // no next IFD

  const out = new Uint8Array(jpeg.length + segment.length)
  out.set(jpeg.subarray(0, 2))
  out.set(segment, 2)
  out.set(jpeg.subarray(2), 2 + segment.length)
  return out
}
