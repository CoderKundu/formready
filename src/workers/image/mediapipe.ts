import type { FilesetResolver } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'

// Shared MediaPipe setup for face detection and background segmentation.
// The runtime (14.6 MB, about 2.8 MB compressed) is served from this site
// and loaded once, on first use, by whichever task needs it first.

// MediaPipe does not export its WasmFileset type, so take it from the
// resolver that normally builds one.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

export const visionFileset: WasmFileset = {
  wasmLoaderPath: wasmLoaderUrl,
  wasmBinaryPath: wasmBinaryUrl,
}

type ModuleFactory = (...args: unknown[]) => unknown
const runtime = globalThis as typeof globalThis & { ModuleFactory?: ModuleFactory }

// Loads the MediaPipe task classes, ready to create one task.
//
// MediaPipe's loader script publishes the runtime as a global
// `ModuleFactory` when it is imported, and MediaPipe deletes that global
// after creating a task. Browsers import a module only once, so creating a
// second task (say, background removal after face detection) would find no
// factory and fail. Re-publish it from the cached module before each task.
//
// Tasks are created one at a time, so one creation cannot delete the
// global while another is about to use it.
type Vision = typeof import('@mediapipe/tasks-vision')
let creating: Promise<unknown> = Promise.resolve()

export function createVisionTask<T>(create: (vision: Vision) => Promise<T>): Promise<T> {
  const task = creating.then(async () => {
    const [vision, loader] = await Promise.all([
      import('@mediapipe/tasks-vision'),
      import(/* @vite-ignore */ wasmLoaderUrl) as Promise<{ default: ModuleFactory }>,
    ])
    runtime.ModuleFactory = loader.default
    return create(vision)
  })
  creating = task.catch(() => undefined)
  return task
}

export async function fetchModel(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

// Starts loading once and shares the result; a failed load is not cached,
// so the next call tries again.
export function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined
  return () => {
    if (!pending) {
      pending = load()
      pending.catch(() => {
        pending = undefined
      })
    }
    return pending
  }
}
