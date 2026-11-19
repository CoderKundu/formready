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
}

export type ProcessingApi = typeof processingApi
