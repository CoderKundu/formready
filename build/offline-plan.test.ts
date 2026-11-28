import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planOfflineCache, renderServiceWorker } from './offline-plan.ts'

const build = [
  { path: 'index.html', bytes: 800 },
  { path: 'favicon.svg', bytes: 300 },
  { path: 'manifest.webmanifest', bytes: 500 },
  { path: 'sw.js', bytes: 4000 },
  { path: 'assets/index-abc.js', bytes: 350_000 },
  { path: 'assets/index-abc.js.map', bytes: 900_000 },
  { path: 'assets/gs-B5Yl.wasm', bytes: 15_533_045 },
  { path: 'assets/vision_wasm_module_internal-Bf.wasm', bytes: 14_665_738 },
  { path: 'assets/blaze_face_short_range-CY.tflite', bytes: 229_746 },
]

describe('planOfflineCache', () => {
  it('saves the shell up front and the large engines on demand', () => {
    const plan = planOfflineCache(build)
    expect(plan.shell).toEqual(['/assets/index-abc.js', '/favicon.svg', '/', '/manifest.webmanifest'])
    expect(plan.heavy).toEqual([
      { url: '/assets/blaze_face_short_range-CY.tflite', bytes: 229_746, group: 'photo' },
      { url: '/assets/gs-B5Yl.wasm', bytes: 15_533_045, group: 'pdf' },
      { url: '/assets/vision_wasm_module_internal-Bf.wasm', bytes: 14_665_738, group: 'photo' },
    ])
  })

  it('changes version when any file changes, and only then', () => {
    const before = planOfflineCache(build).version
    expect(planOfflineCache([...build].reverse()).version).toBe(before)
    const changed = build.map((file) => (file.path === 'favicon.svg' ? { ...file, bytes: 301 } : file))
    expect(planOfflineCache(changed).version).not.toBe(before)
  })

  it('refuses a new WASM file nobody has sorted into a group', () => {
    expect(() => planOfflineCache([...build, { path: 'assets/new-engine.wasm', bytes: 1 }])).toThrow('no offline group')
  })
})

describe('renderServiceWorker', () => {
  it('fills every placeholder in the real template', () => {
    const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
    const source = renderServiceWorker(template, planOfflineCache(build))
    expect(source).not.toMatch(/__(VERSION|SHELL|HEAVY)__/)
    expect(source).toContain('const SHELL = ["/assets/index-abc.js"')
    // The result must be valid JavaScript.
    expect(() => new Function(source)).not.toThrow()
  })
})
