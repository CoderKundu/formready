import { detectFaces } from './face'
import { planPortraitCrop, type Face, type PortraitWarning } from './portrait'
import { resizeImage, type ResizedImage } from './resize'
import type { Rect, Size } from './geometry'

export interface AutoCropOptions {
  // Output size in pixels, e.g. 350 x 450 for a 3.5 x 4.5 cm photo.
  width: number
  height: number
  // Share of the photo's height the head should fill (from the exam
  // preset's minFaceCoverage); 0.7 when not given.
  headCoverage?: number
  format?: 'jpeg' | 'png'
  quality?: number
}

export type AutoCropProblem =
  | PortraitWarning
  // No face was found, so the photo was centre-cropped instead.
  | 'no-face'
  // More than one face; the most confident one was used.
  | 'several-faces'

export interface AutoCropResult extends ResizedImage {
  // Area of the upright photo that was used, in full-size pixels. The UI can
  // let the user adjust it and call resizeImage with the new crop.
  crop: Rect
  image: Size
  face?: Face
  coverage?: number
  problems: AutoCropProblem[]
}

export async function autoCropPortrait(blob: Blob, options: AutoCropOptions): Promise<AutoCropResult> {
  const output = { width: options.width, height: options.height }
  const { image, faces } = await detectFaces(blob)
  const format = options.format ?? 'jpeg'
  const quality = options.quality ?? 0.92

  if (faces.length === 0) {
    const resized = await resizeImage(blob, { ...output, fit: 'cover', format, quality })
    const aspect = output.width / output.height
    const cropWidth = Math.min(image.width, image.height * aspect)
    const cropHeight = cropWidth / aspect
    return {
      ...resized,
      crop: {
        x: (image.width - cropWidth) / 2,
        y: (image.height - cropHeight) / 2,
        width: cropWidth,
        height: cropHeight,
      },
      image,
      problems: ['no-face'],
    }
  }

  const face = faces[0]
  const plan = planPortraitCrop(face, image, { output, headCoverage: options.headCoverage })
  const resized = await resizeImage(blob, { ...output, fit: 'cover', crop: plan.crop, format, quality })
  return {
    ...resized,
    crop: plan.crop,
    image,
    face,
    coverage: plan.coverage,
    problems: [...(faces.length > 1 ? (['several-faces'] as const) : []), ...plan.warnings],
  }
}
