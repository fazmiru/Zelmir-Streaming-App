/** Full layout height for iOS PWA (includes home-indicator region). */
function syncAppHeight() {
  // Prefer the largest reliable measure so the shell never ends above the home indicator
  const vv = window.visualViewport?.height ?? 0
  const ih = window.innerHeight || 0
  const dh = document.documentElement?.clientHeight ?? 0
  const h = Math.max(vv, ih, dh)
  document.documentElement.style.setProperty('--app-height', `${h}px`)
  // Also set a "safe" bottom inset the CSS can read if env() is 0 in some webviews
  const inset = Math.max(
    0,
    (window.innerHeight || 0) - (window.visualViewport?.height ?? window.innerHeight ?? 0)
  )
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
