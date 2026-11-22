import { useEffect, useId, useMemo, type ChangeEvent } from 'react'
import type { Upload } from '../presets'
import { outputSizeFor } from '../presets/output-size'
import { prepareImage, preparePdf, type ImageSettings } from './prepare'
import type { UploadState } from './upload-state'

// One upload the exam asks for: what it needs, a file picker, and the
// prepared result with a download link.

interface UploadCardProps {
  upload: Upload
  state: UploadState
  onChange: (update: (state: UploadState) => UploadState) => void
}

const KIND_HINTS: Record<Upload['kind'], string> = {
  photo: 'A recent photo of your face, taken straight on in good light. A phone photo is fine.',
  signature: 'A photo of your signature on plain white paper. Sign with a black pen.',
  thumbImpression: 'A photo of your thumb impression on plain white paper.',
  declaration: 'A photo of the declaration written by hand on plain white paper.',
  document: 'A scan or clear photo of the document.',
}

export default function UploadCard({ upload, state, onChange }: UploadCardProps) {
  const inputId = useId()
  const isPdf = upload.format === 'pdf'
  const size = outputSizeFor(upload)

  const previewUrl = useMemo(
    () => (state.prepared && !isPdf ? URL.createObjectURL(state.prepared.blob) : undefined),
    [state.prepared, isPdf],
  )
  const downloadUrl = useMemo(
    () => (state.prepared ? URL.createObjectURL(state.prepared.blob) : undefined),
    [state.prepared],
  )
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    },
    [previewUrl, downloadUrl],
  )

  async function run(files: File[], settings: ImageSettings) {
    if (files.length === 0) return
    onChange((current) => ({ ...current, files, settings, busy: true, error: undefined }))
    try {
      const prepared = isPdf ? await preparePdf(upload, files) : await prepareImage(upload, files[0], settings)
      onChange((current) => ({ ...current, busy: false, prepared }))
    } catch (error) {
      onChange((current) => ({
        ...current,
        busy: false,
        prepared: undefined,
        error: error instanceof Error ? error.message : 'This file could not be prepared.',
      }))
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void run(files, state.settings)
  }

  function toggleBackground(whiteBackground: boolean) {
    const settings = { ...state.settings, whiteBackground }
    if (state.files.length > 0) void run(state.files, settings)
    else onChange((current) => ({ ...current, settings }))
  }

  const limits = upload.size.minKB ? `${upload.size.minKB}–${upload.size.maxKB} KB` : `up to ${upload.size.maxKB} KB`
  // A pixel range's final shape depends on the content, so show the range.
  const pixels =
    upload.dimensions?.kind === 'pixelRange'
      ? `${upload.dimensions.min}–${upload.dimensions.max} px, `
      : size
        ? `${size.width} × ${size.height} px, `
        : ''

  return (
    <article className={`upload-card${state.prepared ? ` is-${state.prepared.status}` : ''}`}>
      <header className="upload-head">
        <h3>{upload.label}</h3>
        <p className="upload-spec">
          {pixels}
          {upload.format === 'pdf' ? 'PDF' : 'JPG'}, {limits}
          {upload.required === 'conditional' ? ' · only if it applies to you' : ''}
        </p>
      </header>

      {upload.rules.length > 0 && (
        <ul className="upload-rules">
          {upload.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}

      <p className="upload-hint">{isPdf ? 'PDF files. Choose several to merge them in order.' : KIND_HINTS[upload.kind]}</p>

      <div className="upload-actions">
        <label className="button" htmlFor={inputId} aria-disabled={state.busy}>
          {state.files.length === 0 ? 'Choose file' : 'Choose a different file'}
        </label>
        <input
          id={inputId}
          className="visually-hidden"
          type="file"
          accept={isPdf ? 'application/pdf,.pdf' : 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png'}
          multiple={isPdf}
          disabled={state.busy}
          onChange={choose}
        />
        {upload.kind === 'photo' && (
          <label className="upload-option">
            <input
              type="checkbox"
              checked={state.settings.whiteBackground}
              disabled={state.busy}
              onChange={(event) => toggleBackground(event.target.checked)}
            />
            White background
          </label>
        )}
      </div>

      <p className="upload-status" role="status">
        {state.busy &&
          (upload.kind === 'photo'
            ? 'Preparing your photo… The first time also downloads face detection (about 3 MB).'
            : isPdf
              ? 'Preparing the PDF… Compressing can download the compressor (about 11 MB) the first time.'
              : 'Preparing…')}
      </p>

      {state.error && (
        <p className="upload-error" role="alert">
          {state.error}
        </p>
      )}

      {state.prepared && !state.busy && (
        <div className="upload-result">
          {previewUrl && (
            <img
              className={`upload-preview upload-preview-${upload.kind}`}
              src={previewUrl}
              width={state.prepared.width}
              height={state.prepared.height}
              alt={`Prepared ${upload.label.toLowerCase()}`}
            />
          )}
          <div className="upload-result-text">
            <p className="upload-verdict">
              {state.prepared.status === 'ready' ? 'Ready to upload' : 'Check before uploading'}
            </p>
            <ul className="upload-messages">
              {state.prepared.messages.map((message) => (
                <li key={message.text} className={`message-${message.tone}`}>
                  {message.text}
                </li>
              ))}
            </ul>
            <a className="button" href={downloadUrl} download={state.prepared.name}>
              Download {state.prepared.name}
            </a>
          </div>
        </div>
      )}
    </article>
  )
}
