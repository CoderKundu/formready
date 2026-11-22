import type { FaceDetector } from '@mediapipe/tasks-vision'
import modelUrl from '../../assets/models/blaze_face_short_range.tflite?url'
import { decodeImage } from './decode'
import type { Size } from './geometry'
import { createVisionTask, fetchModel, once, visionFileset } from './mediapipe'
import type { Face } from './portrait'

// Face detection with MediaPipe's BlazeFace short-range model, which is
// built for faces within about 2 metres of the camera, as in a selfie or a
// passport photo. Everything is served from this site: nothing is sent to
// Google or anyone else.

export const loadFaceDetector = once(async (): Promise<FaceDetector> => {
  const model = await fetchModel(modelUrl)
  return createVisionTask(({ FaceDetector }) =>
    FaceDetector.createFromOptions(visionFileset, {
      baseOptions: { modelAssetBuffer: model, delegate: 'CPU' },
      runningMode: 'IMAGE',
      // Real faces score 0.8 or more; at the default 0.5, things like a
      // helmet visor were reported as faces.
      minDetectionConfidence: 0.6,
    }),
  )
})

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
