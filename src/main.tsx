
/** Keep --app-height in sync with the real visible viewport (iOS PWA / Chrome). */
function syncAppHeight() {
  const h = window.visualViewport?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${h}px`)
}
syncAppHeight()
window.addEventListener('resize', syncAppHeight)
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
