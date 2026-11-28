// FormReady service worker: keeps the app working without internet.
// This is a template. Each build writes dist/sw.js from it, with the lists
// below filled in by build/offline-plan.ts.
//
// - The app shell is saved when the worker installs.
// - Hashed files in /assets/ never change, so they are served from the
//   cache when saved, and saved the first time they are fetched. They live
//   in one cache shared across versions, so an unchanged 15 MB engine is
//   not downloaded again after an update.
// - Pages come from the network when it answers, and from the cache when
//   it does not, so updates arrive as soon as someone is online.
// - A new version waits until the page asks it to take over, because
//   reloading clears the files someone has prepared.

const VERSION = __VERSION__
const SHELL = __SHELL__
const HEAVY = __HEAVY__

const SHELL_CACHE = `formready-shell-${VERSION}`
const ASSET_CACHE = 'formready-assets'
const KNOWN_ASSETS = new Set([...SHELL, ...HEAVY.map((file) => file.url)].filter(isAsset))
// How long a page request waits for the network before using the saved copy.
const PAGE_TIMEOUT_MS = 4000

function isAsset(path) {
  return path.startsWith('/assets/')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(SHELL_CACHE)
      await pages.addAll(SHELL.filter((path) => !isAsset(path)))
      const assets = await caches.open(ASSET_CACHE)
      const missing = []
      for (const path of SHELL.filter(isAsset)) {
        if (!(await assets.match(path))) missing.push(path)
      }
      await assets.addAll(missing)
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop older versions' pages, and assets no version uses any more.
      for (const name of await caches.keys()) {
        if (name.startsWith('formready-shell-') && name !== SHELL_CACHE) await caches.delete(name)
      }
      const assets = await caches.open(ASSET_CACHE)
      for (const request of await assets.keys()) {
        if (!KNOWN_ASSETS.has(new URL(request.url).pathname)) await assets.delete(request)
      }
      // Take charge of the page that installed this worker, so the tools it
      // opens next are saved too.
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') event.respondWith(page(request))
  else if (isAsset(url.pathname)) event.respondWith(asset(event, url.pathname))
  else event.respondWith(fromCacheFirst(request))
})

async function page(request) {
  const saved = await caches.match('/', { cacheName: SHELL_CACHE })
  if (!saved) return fetch(request)
  // On a connection that hangs, fall back to the saved copy after a wait.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), PAGE_TIMEOUT_MS))
  const network = fetch(request).catch(() => saved)
  return Promise.race([network, timeout])
}

async function asset(event, path) {
  const saved = await caches.match(path, { cacheName: ASSET_CACHE })
  if (saved) return saved
  const response = await fetch(event.request)
  if (response.status === 200 && KNOWN_ASSETS.has(path)) {
    const copy = response.clone()
    event.waitUntil(caches.open(ASSET_CACHE).then((cache) => cache.put(path, copy)))
  }
  return response
}

async function fromCacheFirst(request) {
  const saved = await caches.match(request, { ignoreSearch: true, cacheName: SHELL_CACHE })
  return saved ?? fetch(request)
}

// Messages from the page. Replies go back on the port the page sends.
self.addEventListener('message', (event) => {
  const port = event.ports[0]
  const type = event.data?.type
  if (type === 'skip-waiting') {
    self.skipWaiting()
  } else if (type === 'status') {
    event.waitUntil(status().then((reply) => port?.postMessage(reply)))
  } else if (type === 'save-all') {
    event.waitUntil(saveAll(port))
  }
})

async function status() {
  const assets = await caches.open(ASSET_CACHE)
  const heavy = []
  for (const file of HEAVY) heavy.push({ ...file, saved: Boolean(await assets.match(file.url)) })
  return { type: 'status', version: VERSION, heavy }
}

// Saves every large file, reporting progress in bytes as each one lands.
async function saveAll(port) {
  const assets = await caches.open(ASSET_CACHE)
  const total = HEAVY.reduce((sum, file) => sum + file.bytes, 0)
  let done = 0
  try {
    for (const file of HEAVY) {
      if (!(await assets.match(file.url))) {
        const response = await fetch(file.url)
        if (response.status !== 200) throw new Error(`${file.url} answered ${response.status}`)
        await assets.put(file.url, response)
      }
      done += file.bytes
      port?.postMessage({ type: 'progress', done, total })
    }
    port?.postMessage(await status())
  } catch (error) {
    port?.postMessage({ type: 'error', message: String(error?.message ?? error) })
  }
}
