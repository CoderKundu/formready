import { proxy, releaseProxy, transfer, wrap, type Remote } from 'comlink'
import type { ProcessingApi } from './processing-api'

// `proxy` wraps a callback so the worker can call it, e.g. for progress.
export { proxy, transfer }
export type {
  Attempt,
  AutoCropOptions,
  AutoCropProblem,
  AutoCropResult,
  Face,
  FaceDetection,
  BlobInfo,
  Capabilities,
  CompressOptions,
  ImageInfo,
  PageRef,
  PdfInfo,
  ProcessingApi,
  Rect,
  ResizedImage,
  ResizeOptions,
  SignatureOptions,
  SignatureProblem,
  SignatureResult,
  SizeTargetOptions,
  SizeTargetResult,
} from './processing-api'
export { COMPRESSION_LEVELS, type CompressionLevelId } from './compression-levels'

// Every call on the returned object is async and runs in the worker:
//
//   const processor = getProcessor()
//   const info = await processor.describeBlob(file)
//
// The worker starts on first use and is shared by the whole app.
export type Processor = Remote<ProcessingApi>

let worker: Worker | undefined
let processor: Processor | undefined

export function getProcessor(): Processor {
  if (!processor) {
    worker = new Worker(new URL('./processing.worker.ts', import.meta.url), {
      type: 'module',
      name: 'formready-processing',
    })
    processor = wrap<ProcessingApi>(worker)
  }
  return processor
}

// Stops the worker, for example to abandon a long compression. Calls still
// waiting never settle. The next getProcessor() starts a fresh worker.
export function terminateProcessor(): void {
  processor?.[releaseProxy]()
  worker?.terminate()
  processor = undefined
  worker = undefined
}
