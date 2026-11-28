import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { offlinePlugin } from './build/offline-plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlinePlugin()],
  // Build workers as ES modules so they can import shared code and load
  // large dependencies (such as the Ghostscript WASM) on demand.
  worker: {
    format: 'es',
  },
})
