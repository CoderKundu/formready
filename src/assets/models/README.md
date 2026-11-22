# Models

Both models are served from this site so that photo processing makes no
requests to other hosts. They run on MediaPipe's vision runtime
(`@mediapipe/tasks-vision`) in the processing worker.

## blaze_face_short_range.tflite

MediaPipe's BlazeFace short-range face detection model (float16, version 1),
for faces within about 2 metres of the camera. Used to crop passport photos
around the face.

- Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
- Documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector
- Licence: Apache License 2.0, by Google
- SHA-256: b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f

## selfie_segmenter.tflite

MediaPipe's selfie segmentation model (float16, version 1), which separates a
person from the background. Used to replace cluttered backgrounds with white.

- Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite
- Documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
- Licence: Apache License 2.0, by Google
- SHA-256: 191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b
