import type { FaceDetector } from '@mediapipe/tasks-vision'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import modelUrl from '../../assets/models/blaze_face_short_range.tflite?url'
import { decodeImage } from './decode'
import type { Size } from './geometry'
import type { Face } from './portrait'

// Face detection with MediaPipe's BlazeFace short-range model, which is
// built for faces within about 2 metres of the camera, as in a selfie or a
// passport photo. Everything is served from this site: nothing is sent to
// Google or anyone else.
//
// The MediaPipe runtime is a 14.6 MB WASM file (about 2.8 MB compressed),
// so it is loaded on first use and kept for the session.

let detector: Promise<FaceDetector> | undefined

export function loadFaceDetector(): Promise<FaceDetector> {
  if (!detector) {
    detector = (async () => {
      const [{ FaceDetector }, model] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        fetch(modelUrl).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return response.arrayBuffer()
        }),
      ])
      return FaceDetector.createFromOptions(
        { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl },
        {
          baseOptions: { modelAssetBuffer: new Uint8Array(model), delegate: 'CPU' },
          runningMode: 'IMAGE',
          // Real faces score 0.8 or more; at the default 0.5, things like a
          // helmet visor were reported as faces.
          minDetectionConfidence: 0.6,
        },
      )
    })()
    detector.catch(() => {
      detector = undefined
    })
  }
  return detector
}

export interface FaceDetection {
  // Upright size of the photo, in full-size pixels.
  image: Size
  // Faces found, most confident first, in full-size upright pixels.
  faces: Face[]
}

export async function detectFaces(blob: Blob): Promise<FaceDetection> {
  let faceDetector: FaceDetector
  try {
    faceDetector = await loadFaceDetector()
  } catch (error) {
    throw new Error('The face detector could not be loaded. Check your connection and try again.', {
      cause: error,
    })
  }

  const image = await decodeImage(blob)
  try {
    const result = faceDetector.detect(image.bitmap)
    // Detection ran on the working-size bitmap; report full-size pixels.
    const scale = image.original.width / image.bitmap.width
    const point = (keypoint?: { x: number; y: number }) =>
      keypoint && {
        x: keypoint.x * image.bitmap.width * scale,
        y: keypoint.y * image.bitmap.height * scale,
      }

    const faces = result.detections
      .filter((detection) => detection.boundingBox)
      .map((detection): Face => {
        const box = detection.boundingBox!
        return {
          box: {
            x: box.originX * scale,
            y: box.originY * scale,
            width: box.width * scale,
            height: box.height * scale,
          },
          score: detection.categories[0]?.score ?? 0,
          // BlazeFace keypoints: 0 is the person's right eye, 1 the left eye.
          rightEye: point(detection.keypoints[0]),
          leftEye: point(detection.keypoints[1]),
        }
      })
      .sort((a, b) => b.score - a.score)

    return { image: image.original, faces }
  } finally {
    image.bitmap.close()
  }
}
