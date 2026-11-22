import type { GhostscriptModule, GhostscriptModuleFactory } from '@okathira/ghostpdl-wasm'

export { COMPRESSION_LEVELS, type CompressionLevelId } from './compression-levels'

// PDF compression with Ghostscript compiled to WebAssembly.
//
// The WASM file is about 15 MB, so it is fetched and compiled only when the
// user first compresses something, then kept for the rest of the session.
// Each run gets a fresh Ghostscript instance from the compiled module:
// Ghostscript's runtime shuts down when its main() returns, so one instance
// cannot run twice.

export interface CompressOptions {
  // Images above this resolution are downsampled to it.
  dpi: number
  // Convert everything to shades of grey; usually much smaller for scans.
  grayscale?: boolean
}

export type WasmLoader = () => Promise<WebAssembly.Module>

export function compressionArgs({ dpi, grayscale = false }: CompressOptions): string[] {
  if (!Number.isInteger(dpi) || dpi < 36 || dpi > 600) {
    throw new Error(`Image resolution must be a whole number from 36 to 600 dpi, not ${dpi}.`)
  }
  // Black-and-white images stay sharper at a higher resolution and are tiny anyway.
  const monoDpi = Math.max(dpi * 2, 300)
  return [
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.5',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-dQUIET',
    // /ebook sets JPEG compression for photos; the resolutions below override its 150 dpi.
    '-dPDFSETTINGS=/ebook',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    '-dDownsampleColorImages=true',
    '-dColorImageDownsampleType=/Bicubic',
    `-dColorImageResolution=${dpi}`,
    '-dColorImageDownsampleThreshold=1.0',
    '-dDownsampleGrayImages=true',
    '-dGrayImageDownsampleType=/Bicubic',
    `-dGrayImageResolution=${dpi}`,
    '-dGrayImageDownsampleThreshold=1.0',
    '-dDownsampleMonoImages=true',
    '-dMonoImageDownsampleType=/Subsample',
    `-dMonoImageResolution=${monoDpi}`,
    ...(grayscale ? ['-sColorConversionStrategy=Gray', '-dProcessColorModel=/DeviceGray'] : []),
  ]
}

export function createCompressor(loadWasm: WasmLoader) {
  let compiled: Promise<WebAssembly.Module> | undefined
  let factory: Promise<GhostscriptModuleFactory> | undefined

  // Fetches and compiles Ghostscript once. A failed download is not cached,
  // so the next attempt tries again.
  function load(): Promise<WebAssembly.Module> {
    if (!compiled) {
      compiled = loadWasm()
      compiled.catch(() => {
        compiled = undefined
      })
    }
    factory ??= import('@okathira/ghostpdl-wasm').then((module) => module.default)
    return compiled
  }

  async function compress(input: Blob, options: CompressOptions): Promise<Blob> {
    const args = compressionArgs(options)
    const wasm = await load()
    const createGhostscript = await factory!
    const log: string[] = []

    const gs: GhostscriptModule = await createGhostscript({
      instantiateWasm(
        imports: WebAssembly.Imports,
        done: (instance: WebAssembly.Instance) => void,
      ) {
        void WebAssembly.instantiate(wasm, imports).then((instance) => done(instance))
        return {} as WebAssembly.Exports
      },
      print: (line: string) => log.push(line),
      printErr: (line: string) => log.push(line),
    })

    gs.FS.writeFile('/input.pdf', new Uint8Array(await input.arrayBuffer()))

    let exitCode: number
    try {
      exitCode = gs.callMain([...args, '-sOutputFile=/output.pdf', '/input.pdf'])
    } catch (error) {
      // Ghostscript reports some failures by calling exit(), which Emscripten throws.
      const status = (error as { status?: unknown } | null)?.status
      exitCode = typeof status === 'number' ? status : -1
      if (exitCode === 0) exitCode = -1
    }

    let output: Uint8Array | undefined
    try {
      output = gs.FS.readFile('/output.pdf')
    } catch {
      output = undefined
    }

    if (exitCode !== 0 || !output || output.length === 0) {
      const detail = log.filter((line) => line.trim()).slice(-3).join(' ')
      throw new Error(
        `This PDF could not be compressed${detail ? ` (Ghostscript: ${detail})` : ''}.`,
      )
    }

    return new Blob([output as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
  }

  return {
    load: async () => {
      await load()
    },
    compress,
  }
}
