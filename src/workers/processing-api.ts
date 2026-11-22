// The functions that run inside the processing worker. Heavy work (image
// decoding and encoding, PDF merging, Ghostscript compression) goes here so
// the page stays responsive.
//
// This module has no worker-specific code, so tests can call it directly.
// processing.worker.ts exposes it to the page through Comlink.
//
// Rules for adding a function:
// - Arguments and return values must survive structured clone: plain data,
//   Blob, File, ArrayBuffer, ImageBitmap. No functions or class instances.
// - Large buffers should be passed with `transfer()` from ./client to avoid
//   copying them.

import ghostscriptWasmUrl from '@okathira/ghostpdl-wasm/gs.wasm?url'
import { createCompressor } from './ghostscript'
import { autoCropPortrait } from './image/auto-crop'
import { detectFaces } from './image/face'
import { inspectImage, resizeImage } from './image/resize'
import { cleanSignature } from './image/signature'
import { inspectPdf, mergePdfPages } from './pdf'
import { compressToSize, type Attempt, type SizeTargetOptions } from './target-size'

export type { CompressOptions } from './ghostscript'
export type { AutoCropOptions, AutoCropProblem, AutoCropResult } from './image/auto-crop'
export type { FaceDetection } from './image/face'
export type { Face } from './image/portrait'
export type { ImageInfo, Rect, ResizedImage, ResizeOptions } from './image/resize'
export type { SignatureOptions, SignatureProblem, SignatureResult } from './image/signature'
export type { PageRef, PdfInfo } from './pdf'
export type { Attempt, SizeTargetOptions, SizeTargetResult } from './target-size'

const compressor = createCompressor(async () => {
  let response: Response
  try {
    response = await fetch(ghostscriptWasmUrl)
  } catch (error) {
    throw new Error('The compressor could not be downloaded. Check your connection and try again.', {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new Error(`The compressor could not be downloaded (HTTP ${response.status}). Try again later.`)
  }
  try {
    // Compiles while downloading, but needs the server to send application/wasm.
    return await WebAssembly.compileStreaming(response.clone())
  } catch {
    return WebAssembly.compile(await response.arrayBuffer())
  }
})

export interface Capabilities {
  // Needed to decode and resize images inside the worker.
  offscreenCanvas: boolean
  createImageBitmap: boolean
  // Needed to load the Ghostscript WASM build for PDF compression.
  webAssembly: boolean
}

export interface BlobInfo {
  bytes: number
  kilobytes: number
  type: string
}

export const processingApi = {
  // Reports what the worker environment supports, so the UI can warn on
  // browsers that cannot run a tool before the user tries it.
  getCapabilities(): Capabilities {
    return {
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      createImageBitmap: typeof createImageBitmap === 'function',
      webAssembly: typeof WebAssembly === 'object',
    }
  },

  // Size of a file as exam portals count it (1 KB = 1024 bytes).
  describeBlob(blob: Blob): BlobInfo {
    return {
      bytes: blob.size,
      kilobytes: Math.round((blob.size / 1024) * 10) / 10,
      type: blob.type,
    }
  },

  // Page count of a PDF. Rejects encrypted or unreadable files with a
  // message that can be shown to the user.
  inspectPdf,

  // One PDF from pages of several PDFs, in the given order.
  mergePdfPages,

  // Downloads and compiles Ghostscript (about 15 MB) if it is not loaded
  // yet. Call it first so the UI can say it is downloading.
  loadCompressor: compressor.load,

  // Shrinks a PDF by resampling its images with Ghostscript. Loads
  // Ghostscript first if needed. The result can be larger than the input
  // for files that are already compact; the caller decides which to keep.
  compressPdf: compressor.compress,

  // Compresses to the best image quality that fits under `maxKB`, trying
  // at most four resolutions. Returns the input unchanged if it already
  // fits. `onAttempt` (wrapped with `proxy()` from ./client) hears about
  // each resolution tried, so the UI can show progress.
  compressPdfToSize(
    input: Blob,
    options: SizeTargetOptions,
    onAttempt?: (attempt: Attempt) => void,
  ) {
    return compressToSize(compressor.compress, input, options, onAttempt)
  },

  // Upright size and EXIF orientation of a photo. Rejects HEIC and files
  // that are not images with a message that can be shown to the user.
  inspectImage,

  // Turns a photo upright (using its EXIF orientation), optionally crops it,
  // and scales it to an exact pixel size as JPEG or PNG.
  resizeImage,

  // Faces in a photo, most confident first. Loads MediaPipe (about 2.8 MB
  // compressed) on first use.
  detectFaces,

  // Finds the face and crops a passport-style photo around it, with the
  // head filling `headCoverage` of the height. Falls back to a centre crop
  // when there is no face, and lists anything the user should check.
  autoCropPortrait,

  // Cleans a phone photo of a signature: finds the ink despite shadows and
  // paper texture, drops the background, crops to the ink and fits it to
  // the portal's size on white.
  cleanSignature,
}

export type ProcessingApi = typeof processingApi
