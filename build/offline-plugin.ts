import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'
import { planOfflineCache, renderServiceWorker, type BuiltFile } from './offline-plan.ts'

// Writes dist/sw.js once every file of the build, workers included, is on
// disk, so the service worker knows exactly which files to save.

function listFiles(root: string, dir = root): BuiltFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    const stats = statSync(path)
    if (stats.isDirectory()) return listFiles(root, path)
    return [{ path: relative(root, path).split('\\').join('/'), bytes: stats.size }]
  })
}

export function offlinePlugin(): Plugin {
  let outDir = 'dist'
  return {
    name: 'formready-offline',
    apply: 'build',
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
    },
    closeBundle() {
      const plan = planOfflineCache(listFiles(outDir))
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, plan))
      const heavyMB = plan.heavy.reduce((sum, file) => sum + file.bytes, 0) / 1e6
      this.info(`sw.js: ${plan.shell.length} shell files, ${plan.heavy.length} large files (${heavyMB.toFixed(1)} MB), version ${plan.version}`)
    },
  }
}
