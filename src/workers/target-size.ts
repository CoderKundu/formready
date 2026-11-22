// Finds the highest image resolution whose output fits under a size limit.
//
// Output size falls as resolution falls, so this is a binary search over a
// fixed list of resolutions. With 8 steps it needs at most 4 compression
// runs, which matters on phones where each run can take several seconds.
// Only outputs that were actually measured under the limit are returned, so
// a file that does not shrink smoothly can make the search pick a lower
// resolution than needed, but never a file that is too big.

// Image resolutions to try, best quality first.
export const TARGET_DPI_STEPS = [200, 150, 120, 100, 85, 72, 60, 50] as const

export interface Attempt {
  dpi: number
  bytes: number
}

export interface Measured<T> extends Attempt {
  output: T
}

export interface TargetSearchResult<T> {
  // Highest-resolution output that fits, if any did.
  fitting?: Measured<T>
  // Smallest output produced, to report how close the search got.
  smallest: Measured<T>
  attempts: Attempt[]
}

export async function searchHighestFitting<T>(
  steps: readonly number[],
  maxBytes: number,
  run: (dpi: number) => Promise<{ bytes: number; output: T }>,
  onAttempt?: (attempt: Attempt) => void,
): Promise<TargetSearchResult<T>> {
  if (steps.length === 0) throw new Error('No resolutions to try.')

  const measured = new Map<number, Measured<T>>()
  const attempts: Attempt[] = []

  async function measure(index: number): Promise<Measured<T>> {
    const known = measured.get(index)
    if (known) return known
    const dpi = steps[index]
    const { bytes, output } = await run(dpi)
    const result = { dpi, bytes, output }
    measured.set(index, result)
    attempts.push({ dpi, bytes })
    onAttempt?.({ dpi, bytes })
    return result
  }

  // Smallest index (best quality) whose output fits.
  let low = 0
  let high = steps.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((await measure(middle)).bytes <= maxBytes) high = middle
    else low = middle + 1
  }
  const candidate = await measure(low)

  // Report the best measured fit; prefer the highest resolution.
  const fitting = [...measured.entries()]
    .filter(([, result]) => result.bytes <= maxBytes)
    .sort(([a], [b]) => a - b)[0]?.[1]
  const smallest = [...measured.values()].reduce(
    (best, result) => (result.bytes < best.bytes ? result : best),
    candidate,
  )

  return { fitting, smallest, attempts }
}

export interface SizeTargetOptions {
  // The portal's limit, in KB of 1024 bytes.
  maxKB: number
  grayscale?: boolean
}

export interface SizeTargetResult {
  // "already-fits": the input was under the limit and is returned unchanged.
  // "fits": `blob` is the best quality that fits.
  // "too-big": nothing fit; `blob` is the smallest output produced.
  status: 'already-fits' | 'fits' | 'too-big'
  blob: Blob
  bytes: number
  // Resolution of the returned file, if it was compressed.
  dpi?: number
  attempts: Attempt[]
}

type Compress = (input: Blob, options: { dpi: number; grayscale?: boolean }) => Promise<Blob>

export async function compressToSize(
  compress: Compress,
  input: Blob,
  { maxKB, grayscale = false }: SizeTargetOptions,
  onAttempt?: (attempt: Attempt) => void,
): Promise<SizeTargetResult> {
  if (!Number.isFinite(maxKB) || maxKB <= 0) {
    throw new Error('Enter a size limit above 0 KB.')
  }
  const maxBytes = Math.floor(maxKB * 1024)

  // Recompressing can only lose quality, so leave a file that already fits.
  // Black and white is a change the user asked for, so it is still applied.
  if (input.size <= maxBytes && !grayscale) {
    return { status: 'already-fits', blob: input, bytes: input.size, attempts: [] }
  }

  const search = await searchHighestFitting(
    TARGET_DPI_STEPS,
    maxBytes,
    async (dpi) => {
      const output = await compress(input, { dpi, grayscale })
      return { bytes: output.size, output }
    },
    onAttempt,
  )

  const chosen = search.fitting ?? search.smallest
  return {
    status: search.fitting ? 'fits' : 'too-big',
    blob: chosen.output,
    bytes: chosen.bytes,
    dpi: chosen.dpi,
    attempts: search.attempts,
  }
}
