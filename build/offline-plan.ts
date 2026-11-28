import { createHash } from 'node:crypto'

// Decides what the service worker keeps for offline use, from the files a
// build produced. The app shell (pages, scripts, styles, icons) is saved
// on the first visit. The large WASM engines and models are saved the
// first time a tool uses them, or all at once when someone asks to save
// everything, so a first visit on mobile data stays small.

export interface BuiltFile {
  // Path inside dist/, with forward slashes, e.g. "assets/index-abc.js".
  path: string
  bytes: number
}

export type HeavyGroup = 'photo' | 'pdf'

export interface HeavyFile {
  url: string
  bytes: number
  // Which tools need it: photo and signature tools, or PDF compression.
  group: HeavyGroup
}

export interface OfflinePlan {
  // Changes whenever any built file changes, since file names carry hashes.
  version: string
  shell: string[]
  heavy: HeavyFile[]
}

// Never cached: the service worker itself, and files only for developers.
const SKIP = [/^sw\.js$/, /\.map$/, /^_headers$/, /^_redirects$/, /^\.assetsignore$/]

// Large files that only some tools need.
const HEAVY: { pattern: RegExp; group: HeavyGroup }[] = [
  { pattern: /\.tflite$/, group: 'photo' },
  { pattern: /^assets\/vision_wasm.*\.wasm$/, group: 'photo' },
  { pattern: /^assets\/gs-.*\.wasm$/, group: 'pdf' },
]

export function planOfflineCache(files: BuiltFile[]): OfflinePlan {
  const kept = files
    .filter((file) => !SKIP.some((pattern) => pattern.test(file.path)))
    .sort((a, b) => a.path.localeCompare(b.path))

  const shell: string[] = []
  const heavy: HeavyFile[] = []
  for (const file of kept) {
    const url = `/${file.path}`
    const match = HEAVY.find(({ pattern }) => pattern.test(file.path))
    if (match) heavy.push({ url, bytes: file.bytes, group: match.group })
    else if (file.path.endsWith('.wasm')) throw new Error(`${file.path} is a WASM file with no offline group.`)
    else shell.push(file.path === 'index.html' ? '/' : url)
  }

  const fingerprint = kept.map((file) => `${file.path}:${file.bytes}`).join('\n')
  const version = createHash('sha256').update(fingerprint).digest('hex').slice(0, 12)
  return { version, shell, heavy }
}

// The service worker source with the plan filled in.
export function renderServiceWorker(template: string, plan: OfflinePlan): string {
  const filled = template
    .replace('__VERSION__', JSON.stringify(plan.version))
    .replace('__SHELL__', JSON.stringify(plan.shell))
    .replace('__HEAVY__', JSON.stringify(plan.heavy))
  if (/__(VERSION|SHELL|HEAVY)__/.test(filled)) throw new Error('The service worker template has a placeholder twice.')
  return filled
}
