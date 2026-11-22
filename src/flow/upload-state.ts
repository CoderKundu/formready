import type { Upload } from '../presets'
import type { ImageSettings, Prepared } from './prepare'

// What the flow remembers about each upload while moving between steps.
export interface UploadState {
  files: File[]
  settings: ImageSettings
  busy: boolean
  prepared?: Prepared
  error?: string
}

export const initialUploadState = (upload: Upload): UploadState => ({
  files: [],
  // Most exams want a plain white or light background.
  settings: { whiteBackground: upload.kind === 'photo' },
  busy: false,
})
