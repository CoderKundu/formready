// Portals state limits in "KB" without saying whether a KB is 1000 or 1024
// bytes, and they differ. To pass either way, a maximum is read as 1000-byte
// KB (the smaller number of bytes) and a minimum as 1024-byte KB (the
// larger). For "20 to 50 KB" that means 20,480 to 50,000 bytes.

export function maxBytesFor(maxKB: number): number {
  return Math.floor(maxKB * 1000)
}

export function minBytesFor(minKB: number): number {
  return Math.ceil(minKB * 1024)
}

// Size as shown to people: KB of 1024 bytes, one decimal place.
export function toKB(bytes: number): number {
  return Math.round((bytes / 1024) * 10) / 10
}
