import { useId, useState, type ChangeEvent } from 'react'
import type { Upload } from '../presets'
import { outputSizeFor } from '../presets/output-size'
import { prepareImage, preparePdf, type ImageSettings } from './prepare'
import type { UploadState } from './upload-state'
import { sizeRuleNote, type Check } from './validate'

// One upload the exam asks for: what it needs, a file picker, and the
// prepared result with a download link.

interface UploadCardProps {
  upload: Upload
  state: UploadState
  onChange: (update: (state: UploadState) => UploadState) => void
}

const RESULT_TEXT: Record<Check['result'], { mark: string; word: string }> = {
  pass: { mark: '✓', word: 'Passes' },
  fail: { mark: '×', word: 'Fails' },
  info: { mark: 'i', word: 'Note' },
}

const KIND_HINTS: Record<Upload['kind'], string> = {
  photo: 'A recent photo of your face, taken straight on in good light. A phone photo is fine.',
  signature: 'A photo of your signature on plain white paper. Sign with a black pen.',
  thumbImpression: 'A photo of your thumb impression on plain white paper.',
  declaration: 'A photo of the declaration written by hand on plain white paper.',
  document: 'A scan or clear photo of the document.',
}

// Widest the prepared picture is drawn; see .upload-preview in flow.css.
const PREVIEW_MAX = 240

// Sizes as people read them: KB under 1 MB, MB above.
function formatBytes(bytes: number): string {
  const kb = bytes / 1024
  return kb < 1024 ? `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`
}

// "88% smaller", or "larger" when padding made the file grow.
function change(before: number, after: number): string {
  if (before === 0) return ''
  const percent = Math.round((Math.abs(before - after) / before) * 100)
  if (percent === 0) return ', about the same size'
  return `, ${percent}% ${after < before ? 'smaller' : 'larger'}`
}

export default function UploadCard({ upload, state, onChange }: UploadCardProps) {
  const inputId = useId()
  const isPdf = upload.format === 'pdf'
  const size = outputSizeFor(upload)

  const previewUrl = isPdf ? undefined : state.fileUrl
  // Pixel size of the original, read when its picture loads.
  const [original, setOriginal] = useState<{ url: string; width: number; height: number }>()
  const originalSize = original && original.url === state.originalUrl ? original : undefined
  const originalBytes = state.files.reduce((sum, file) => sum + file.size, 0)

  async function run(files: File[], settings: ImageSettings) {
    if (files.length === 0) return
    // The address of the file being replaced, freed once the new one is shown.
    const previousUrl = state.fileUrl
    const previousOriginal = state.originalUrl
    const originalUrl = isPdf ? undefined : URL.createObjectURL(files[0])
    onChange((current) => ({ ...current, files, settings, originalUrl, busy: true, error: undefined }))
    try {
      const prepared = isPdf ? await preparePdf(upload, files) : await prepareImage(upload, files[0], settings)
      const fileUrl = URL.createObjectURL(prepared.blob)
      onChange((current) => ({ ...current, busy: false, prepared, fileUrl }))
    } catch (error) {
      onChange((current) => ({
        ...current,
        busy: false,
        prepared: undefined,
        fileUrl: undefined,
        error: error instanceof Error ? error.message : 'This file could not be prepared.',
      }))
    }
    if (previousUrl) URL.revokeObjectURL(previousUrl)
    if (previousOriginal) URL.revokeObjectURL(previousOriginal)
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
          {previewUrl && state.originalUrl && (
            <div className="compare">
              <figure className="compare-side">
                <img
                  className="compare-before"
                  src={state.originalUrl}
                  alt={`Your original ${upload.label.toLowerCase()}`}
                  onLoad={(event) => {
                    const image = event.currentTarget
                    setOriginal({ url: image.src, width: image.naturalWidth, height: image.naturalHeight })
                  }}
                />
                <figcaption>
                  <strong>Before</strong>
                  <span>
                    {originalSize ? `${originalSize.width} × ${originalSize.height} px · ` : ''}
                    {formatBytes(originalBytes)}
                  </span>
                </figcaption>
              </figure>
              <span className="compare-arrow" aria-hidden="true">
                →
              </span>
              <figure className="compare-side">
                <img
                  className={`upload-preview upload-preview-${upload.kind}`}
                  src={previewUrl}
                  width={state.prepared.width}
                  height={state.prepared.height}
                  alt={`Prepared ${upload.label.toLowerCase()}`}
                />
                <figcaption>
                  <strong>After</strong>
                  <span>
                    {state.prepared.width} × {state.prepared.height} px · {formatBytes(state.prepared.bytes)}
                  </span>
                  {(state.prepared.width ?? Infinity) <= PREVIEW_MAX && (
                    <span className="compare-note">Shown at its real size in pixels</span>
                  )}
                </figcaption>
              </figure>
            </div>
          )}
          {isPdf && (
            <p className="compare-pdf">
              <strong>Before:</strong> {state.files.length} {state.files.length === 1 ? 'file' : 'files'},{' '}
              {formatBytes(originalBytes)} <span aria-hidden="true">→</span> <strong>After:</strong>{' '}
              {state.prepared.pages} {state.prepared.pages === 1 ? 'page' : 'pages'}, {formatBytes(state.prepared.bytes)}
              {change(originalBytes, state.prepared.bytes)}
            </p>
          )}
          <div className="upload-result-text">
            <p className="upload-verdict">
              {state.prepared.status === 'ready' ? 'Ready to upload' : 'Check before uploading'}
            </p>
            {state.prepared.messages.length > 0 && (
              <ul className="upload-messages">
                {state.prepared.messages.map((message) => (
                  <li key={message.text} className={`message-${message.tone}`}>
                    {message.text}
                  </li>
                ))}
              </ul>
            )}
            <a className="button" href={state.fileUrl} download={state.prepared.name}>
              Download {state.prepared.name}
            </a>
          </div>
        </div>
      )}

      {state.prepared && !state.busy && (
        <div className="report">
          <table>
            <caption>Checked in the finished file</caption>
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Exam asks</th>
                <th scope="col">This file</th>
              </tr>
            </thead>
            <tbody>
              {state.prepared.checks.map((check) => (
                <tr key={check.label} className={`report-${check.result}`}>
                  <th scope="row">
                    <span className="report-mark" aria-hidden="true">
                      {RESULT_TEXT[check.result].mark}
                    </span>
                    {check.label}
                    <span className="visually-hidden">: {RESULT_TEXT[check.result].word}</span>
                  </th>
                  <td>{check.rule}</td>
                  <td>{check.found}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-note">{sizeRuleNote(upload)}</p>
        </div>
      )}
    </article>
  )
}
