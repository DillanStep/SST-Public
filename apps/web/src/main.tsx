import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.tsx'

function reloadOnStaleChunk() {
  const reloadKey = 'sst:chunk-reload-attempted'

  const reloadOnce = () => {
    if (sessionStorage.getItem(reloadKey) === '1') return
    sessionStorage.setItem(reloadKey, '1')
    window.location.reload()
  }

  window.addEventListener('vite:preloadError', reloadOnce)
  window.addEventListener('unhandledrejection', (event) => {
    const message = String(event.reason?.message || event.reason || '')
    if (message.includes('Failed to fetch dynamically imported module')) {
      reloadOnce()
    }
  })

  window.addEventListener('load', () => {
    sessionStorage.removeItem(reloadKey)
  })
}

reloadOnStaleChunk()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
