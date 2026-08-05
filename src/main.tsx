/** Full layout height for iOS PWA (includes home-indicator region). */
function syncAppHeight() {
  const vv = window.visualViewport?.height ?? 0
  const ih = window.innerHeight || 0
  const dh = document.documentElement?.clientHeight ?? 0
  const h = Math.max(vv, ih, dh)
  document.documentElement.style.setProperty('--app-height', `${h}px`)

  // Gap between layout viewport and visual viewport (keyboard / browser chrome)
  let inset = Math.max(0, ih - (vv || ih))

  // iPhone PWA: env(safe-area-inset-bottom) is sometimes 0 even with viewport-fit=cover.
  // When running standalone on a notched/home-indicator phone, floor the bottom inset.
  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    const isPhone = /iPhone|iPod/.test(navigator.userAgent || '')
    if (standalone && isPhone && inset < 20) {
      inset = 34 // typical home-indicator safe area
    }
  } catch {
    /* ignore */
  }

  document.documentElement.style.setProperty('--vv-bottom-gap', `${inset}px`)
}
syncAppHeight()
window.addEventListener('resize', syncAppHeight)
window.addEventListener('orientationchange', () => setTimeout(syncAppHeight, 100))
window.visualViewport?.addEventListener('resize', syncAppHeight)
window.visualViewport?.addEventListener('scroll', syncAppHeight)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { ThemeProvider } from './theme/ThemeContext'
import { PlaylistProvider } from './playlists/PlaylistContext'
import { OfflineProvider } from './offline/OfflineContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <PlaylistProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </PlaylistProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
)
