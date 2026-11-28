import { useState } from 'react'
import { getOfflineStatus, offlineSupported, saveEverything, type HeavyGroup, type OfflineStatus } from './service-worker'

// What works without internet, and a button to save the large tools ahead
// of time, for example before travelling to a cyber cafe or a hostel with
// poor signal.

const GROUP_NAMES: Record<HeavyGroup, string> = {
  photo: 'Photo and signature tools',
  pdf: 'PDF compressor',
}

const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(bytes < 10e6 ? 1 : 0)} MB`

function groups(status: OfflineStatus) {
  return (Object.keys(GROUP_NAMES) as HeavyGroup[]).map((group) => {
    const files = status.heavy.filter((file) => file.group === group)
    return {
      group,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      saved: files.length > 0 && files.every((file) => file.saved),
    }
  })
}

export default function OfflinePanel() {
  const [status, setStatus] = useState<OfflineStatus>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [error, setError] = useState<string>()

  if (!offlineSupported) return null

  // Read on opening, since tools save themselves the first time they run.
  function refresh(open: boolean) {
    if (!open) return
    getOfflineStatus().then(setStatus, () => setStatus(undefined))
  }

  async function save() {
    setError(undefined)
    setProgress({ done: 0, total: 0 })
    try {
      setStatus(await saveEverything((done, total) => setProgress({ done, total })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Saving stopped.')
    } finally {
      setProgress(undefined)
    }
  }

  const rows = status ? groups(status) : []
  const missing = rows.filter((row) => !row.saved).reduce((sum, row) => sum + row.bytes, 0)

  return (
    <details className="offline-panel" onToggle={(event) => refresh(event.currentTarget.open)}>
      <summary>Use FormReady without internet</summary>
      <p>
        The app is saved on this device, so it opens without internet. Each tool is saved the first time you
        use it.
      </p>
      {status ? (
        <ul className="offline-list">
          {rows.map((row) => (
            <li key={row.group}>
              <span>{GROUP_NAMES[row.group]}</span>
              <span className={row.saved ? 'offline-saved' : undefined}>
                {row.saved ? 'Saved' : `Not saved yet (${megabytes(row.bytes)})`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Checking what is saved…</p>
      )}
      {status && missing > 0 && !progress && (
        <button type="button" className="button" onClick={() => void save()}>
          Save everything for offline use ({megabytes(missing)})
        </button>
      )}
      {status && missing === 0 && <p className="offline-saved">Everything is saved. FormReady works fully offline here.</p>}
      {progress && (
        <p role="status" className="offline-progress">
          <progress value={progress.done} max={progress.total || 1} />
          Saving… {megabytes(progress.done)} of {progress.total ? megabytes(progress.total) : '…'}
        </p>
      )}
      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}
    </details>
  )
}
