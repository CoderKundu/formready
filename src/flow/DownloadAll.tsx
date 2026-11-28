import { useState } from 'react'
import type { Preset } from '../presets'
import type { Prepared } from './prepare'
import { buildZip } from './zip'

// Every prepared file for the exam in one ZIP, named as the portal
// expects, with a plain list of what is still missing or needs a look.

interface DownloadAllProps {
  preset: Preset
  prepared: (uploadId: string) => Prepared | undefined
}

export default function DownloadAll({ preset, prepared }: DownloadAllProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const files = preset.uploads.flatMap((upload) => {
    const file = prepared(upload.id)
    return file ? [{ upload, file }] : []
  })
  const missing = preset.uploads.filter((upload) => upload.required === 'always' && !prepared(upload.id))
  const toCheck = files.filter(({ file }) => file.status !== 'ready')
  const zipName = `formready-${preset.id}.zip`

  if (files.length === 0) return null

  async function download() {
    setBusy(true)
    setError(undefined)
    try {
      const entries = await Promise.all(
        files.map(async ({ file }) => ({ name: file.name, data: new Uint8Array(await file.blob.arrayBuffer()) })),
      )
      const url = URL.createObjectURL(new Blob([buildZip(entries)], { type: 'application/zip' }))
      const link = document.createElement('a')
      link.href = url
      link.download = zipName
      link.click()
      // The browser has started the download; free the copy soon after.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The ZIP could not be made.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="download-all" aria-labelledby="download-all-heading">
      <h2 id="download-all-heading">Download all</h2>
      <p>
        {files.length} {files.length === 1 ? 'file' : 'files'} prepared for {preset.name}:{' '}
        {files.map(({ file }) => file.name).join(', ')}.
      </p>
      {missing.length > 0 && (
        <p className="download-all-warning">
          Still needed: {missing.map((upload) => upload.label).join(', ')}.
        </p>
      )}
      {toCheck.length > 0 && (
        <p className="download-all-warning">
          Check before uploading: {toCheck.map(({ upload }) => upload.label).join(', ')}.
        </p>
      )}
      <div>
        <button type="button" className="button" disabled={busy} onClick={() => void download()}>
          {busy ? 'Making the ZIP…' : `Download ${zipName}`}
        </button>
      </div>
      <p className="download-all-note">
        Upload each file on its own; portals do not accept the ZIP itself. The names inside already match what
        the portal asks for, so keep them.
      </p>
      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
