import { useState } from 'react'
import { HomeIcon, SearchIcon, SparkleIcon, SettingsIcon, PlusIcon, TrashIcon } from './Icons'
import { usePlaylists } from '../playlists/PlaylistContext'
import { useAuth } from '../auth/AuthContext'

export type View = 'home' | 'search' | 'flow' | 'settings' | 'playlist'

interface SidebarProps {
  view: View
  activePlaylistId: string | null
  onNavigate: (v: View) => void
  onOpenPlaylist: (id: string) => void
  onOpenSpotifyImport: () => void
}

const items: { key: View; label: string; icon: typeof HomeIcon }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'search', label: 'Search', icon: SearchIcon },
  { key: 'flow', label: 'Flow', icon: SparkleIcon },
  { key: 'settings', label: 'Appearance', icon: SettingsIcon },
]

export function Sidebar({ 
  view, 
  activePlaylistId, 
  onNavigate, 
  onOpenPlaylist, 
  onOpenSpotifyImport 
}: SidebarProps) {
  const { playlists, createPlaylist, deletePlaylist } = usePlaylists()
  const { user, signout } = useAuth()
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

const submitNewPlaylist = () => {
  if (draftName.trim()) {
    const id = createPlaylist(draftName)
    if (id) {
      onOpenPlaylist(id)
    }
  }
  setDraftName('')
  setCreating(false)
}

  return (
    <aside className="sidebar">
      <div className="wordmark">
        <span className="accent-text">Zelmir</span>
      </div>

      <nav className="nav">
        {items.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-item ${view === key ? 'nav-item-active' : ''}`}
            onClick={() => onNavigate(key)}
          >
            <Icon className="nav-icon" />
            <span className={view === key ? 'accent-text' : ''}>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-divider" />

      <div className="playlists-section">
        <div className="playlists-header">
          <span>Playlists</span>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button 
              className="playlist-add-button" 
              onClick={onOpenSpotifyImport} 
              aria-label="Import Spotify playlist" 
              title="Import Spotify playlist"
            >
              <span style={{ fontSize: '12px' }}>🟢</span>
            </button>
            <button 
              className="playlist-add-button" 
              onClick={() => setCreating(true)} 
              aria-label="New playlist" 
              title="New playlist"
            >
              <PlusIcon size={15} />
            </button>
          </div>
        </div>

        {creating && (
          <input
            autoFocus
            className="playlist-name-input"
            placeholder="Playlist name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewPlaylist()
              if (e.key === 'Escape') {
                setCreating(false)
                setDraftName('')
              }
            }}
            onBlur={submitNewPlaylist}
          />
        )}

        <div className="playlist-list">
          {playlists.length === 0 && !creating && <p className="playlists-empty">No playlists yet</p>}
          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={`playlist-item ${view === 'playlist' && activePlaylistId === pl.id ? 'nav-item-active' : ''}`}
              onClick={() => onOpenPlaylist(pl.id)}
            >
              <span className={view === 'playlist' && activePlaylistId === pl.id ? 'accent-text playlist-item-name' : 'playlist-item-name'}>
                {pl.name}
              </span>
              <button
                className="playlist-delete-button"
                onClick={(e) => {
                  e.stopPropagation()
                  deletePlaylist(pl.id)
                  if (activePlaylistId === pl.id) onNavigate('home')
                }}
                aria-label={`Delete ${pl.name}`}
                title="Delete playlist"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar accent-fill">{user.username.charAt(0).toUpperCase()}</div>
            <div className="sidebar-user-meta">
              <span className="sidebar-user-name">{user.username}</span>
              <button className="sidebar-signout" onClick={signout}>
                Sign out
              </button>
            </div>
          </div>
        )}
        <p>Search runs on the YouTube Data API.</p>
      </div>
    </aside>
  )
}
