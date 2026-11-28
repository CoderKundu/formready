// The page's side of offline mode: registers dist/sw.js (written by
// build/offline-plugin.ts), notices when a new version is waiting, and asks
// the worker what it has saved.

export type HeavyGroup = 'photo' | 'pdf'

export interface OfflineStatus {
  version: string
  heavy: { url: string; bytes: number; group: HeavyGroup; saved: boolean }[]
}

type Listener = () => void

let registration: ServiceWorkerRegistration | undefined
let updateWaiting = false
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

export const offlineSupported = import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isUpdateWaiting(): boolean {
  return updateWaiting
}

export async function registerServiceWorker(): Promise<void> {
  if (!offlineSupported) return
  registration = await navigator.serviceWorker.register('/sw.js')

  // A worker that installs while another controls the page is an update.
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return
    const check = () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        updateWaiting = true
        notify()
      }
    }
    check()
    worker.addEventListener('statechange', check)
  }
  watch(registration.waiting)
  registration.addEventListener('updatefound', () => watch(registration!.installing))
  navigator.serviceWorker.addEventListener('controllerchange', notify)
}

// Switches to the waiting version and reloads into it.
export function applyUpdate(): void {
  const waiting = registration?.waiting
  if (!waiting) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  waiting.postMessage({ type: 'skip-waiting' })
}

interface Reply {
  type: 'status' | 'progress' | 'error'
  version?: string
  heavy?: OfflineStatus['heavy']
  done?: number
  total?: number
  message?: string
}

async function ask(type: string, onReply: (reply: Reply) => boolean): Promise<void> {
  const ready = await navigator.serviceWorker.ready
  const active = ready.active
  if (!active) throw new Error('Offline mode is not ready yet.')
  const channel = new MessageChannel()
  await new Promise<void>((resolve) => {
    channel.port1.onmessage = (event: MessageEvent<Reply>) => {
      if (onReply(event.data)) {
        channel.port1.close()
        resolve()
      }
    }
    active.postMessage({ type }, [channel.port2])
  })
}

export async function getOfflineStatus(): Promise<OfflineStatus> {
  let status: OfflineStatus | undefined
  await ask('status', (reply) => {
    status = { version: reply.version ?? '', heavy: reply.heavy ?? [] }
    return true
  })
  return status!
}

// Saves every large file; calls onProgress with bytes saved so far.
export async function saveEverything(onProgress: (done: number, total: number) => void): Promise<OfflineStatus> {
  let status: OfflineStatus | undefined
  let failure: string | undefined
  await ask('save-all', (reply) => {
    if (reply.type === 'progress') {
      onProgress(reply.done ?? 0, reply.total ?? 0)
      return false
    }
    if (reply.type === 'error') failure = reply.message
    else status = { version: reply.version ?? '', heavy: reply.heavy ?? [] }
    return true
  })
  if (failure) throw new Error(`Saving stopped: ${failure}. Check your connection and try again.`)
  return status!
}
