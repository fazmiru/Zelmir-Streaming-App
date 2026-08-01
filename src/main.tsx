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
