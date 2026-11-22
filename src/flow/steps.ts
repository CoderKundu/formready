import type { Preset, Upload } from '../presets'

// The three steps of the guided flow, and which of an exam's uploads go in
// each. Signatures, thumb impressions and handwritten declarations share a
// step: all are ink on paper, cleaned the same way.

export type StepId = 'photo' | 'signature' | 'documents'

export interface Step {
  id: StepId
  title: string
  uploads: Upload[]
  // Shown when the step has nothing to prepare for this exam.
  emptyNote?: string
}

export const STEP_ORDER: StepId[] = ['photo', 'signature', 'documents']

export function stepsFor(preset: Preset): Step[] {
  const photo = preset.uploads.filter((upload) => upload.kind === 'photo')
  const ink = preset.uploads.filter((upload) =>
    ['signature', 'thumbImpression', 'declaration'].includes(upload.kind),
  )
  const documents = preset.uploads.filter((upload) => upload.kind === 'document')

  return [
    {
      id: 'photo',
      title: 'Photo',
      uploads: photo,
      emptyNote:
        photo.length === 0
          ? preset.liveCapture
            ? `${preset.name} takes your photo live with your phone or webcam while you fill in the form, so there is no photo file to prepare.`
            : `${preset.name} does not ask for a photo file.`
          : undefined,
    },
    {
      id: 'signature',
      title: ink.length > 1 ? 'Signature and more' : 'Signature',
      uploads: ink,
      emptyNote: ink.length === 0 ? `${preset.name} does not ask for a signature file.` : undefined,
    },
    {
      id: 'documents',
      title: 'Documents',
      uploads: documents,
      emptyNote: documents.length === 0 ? `${preset.name} does not ask for document uploads.` : undefined,
    },
  ]
}

export function isStepId(value: string | null): value is StepId {
  return value !== null && (STEP_ORDER as string[]).includes(value)
}

// File name to save an upload as: the portal's required name if it has
// one (UPSC), otherwise the upload's id.
export function downloadName(upload: Upload): string {
  return `${upload.fileName ?? upload.id}.${upload.format === 'pdf' ? 'pdf' : 'jpg'}`
}
