import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './offline/service-worker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline mode, after the page has loaded so it does not slow the first view.
window.addEventListener('load', () => {
  registerServiceWorker().catch((error: unknown) => console.warn('Offline mode is unavailable:', error))
})
