import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Build workers as ES modules so they can import shared code and load
  // large dependencies (such as the Ghostscript WASM) on demand.
  worker: {
    format: 'es',
  },
})
