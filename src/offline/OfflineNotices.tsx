import { useSyncExternalStore } from 'react'
import { applyUpdate, isUpdateWaiting, subscribe } from './service-worker'

// Notices at the top of the page: when there is no internet, and when a
// new version is ready.

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export default function OfflineNotices() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine)
  const updateWaiting = useSyncExternalStore(subscribe, isUpdateWaiting)

  return (
    <>
      {!online && (
        <p className="notice" role="status">
          You are offline. Everything saved on this device still works, and nothing you prepare leaves it.
        </p>
      )}
      {updateWaiting && (
        <div className="notice notice-update" role="status">
          <p>A new version of FormReady is ready. Reloading clears files you have prepared but not downloaded.</p>
          <button type="button" className="button" onClick={applyUpdate}>
            Reload now
          </button>
        </div>
      )}
    </>
  )
}
