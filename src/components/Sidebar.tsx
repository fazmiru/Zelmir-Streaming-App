import { useRef, useState } from 'react'
import {
  HomeIcon,
  SearchIcon,
  LibraryIcon,
  SparkleIcon,
  SettingsIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
} from './Icons'
import { usePlaylists } from '../playlists/PlaylistContext'
import { useAuth } from '../auth/AuthContext'

export type View = 'home' | 'search' | 'library' | 'flow' | 'settings' | 'playlist' | 'artist' | 'album' | 'mood'

interface SidebarProps {
  view: View
  activePlaylistId: string | null
  onNavigate: (v: View) => void
  onOpenPlaylist: (id: string) => void
  onOpenSpotifyImport: () => void
  /** Full sidebar collapsed to icon rail (YouTube Music style) */
  railCollapsed?: boolean
  onToggleRail?: () => void
}

const items: { key: View; label: string; icon: typeof HomeIcon }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon },
  { key: 'search', label: 'Search', icon: SearchIcon },
  { key: 'library', label: 'Library', icon: LibraryIcon },
  { key: 'flow', label: 'Flow', icon: SparkleIcon },
  { key: 'settings', label: 'Appearance', icon: SettingsIcon },
]

function SpotifyGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  )
}

/** Panel collapse (chevrons) — used for rail toggle */
function PanelCollapseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6 9 12l6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 5v14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PanelExpandIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 5v14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Sidebar({
  view,
  activePlaylistId,
  onNavigate,
  onOpenPlaylist,
  onOpenSpotifyImport,
  railCollapsed = false,
  onToggleRail,
}: SidebarProps) {
  const { playlists, createPlaylist, deletePlaylist } = usePlaylists()
  const { user, signout } = useAuth()
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [playlistsCollapsed, setPlaylistsCollapsed] = useState(false)
  const submittingRef = useRef(false)

  const submitNewPlaylist = () => {
    if (submittingRef.current) return
    submittingRef.current = true
    if (draftName.trim()) {
      const id = createPlaylist(draftName)
      if (id) onOpenPlaylist(id)
    }
    setDraftName('')
    setCreating(false)
    setTimeout(() => {
      submittingRef.current = false
    }, 0)
  }

  return (
    <aside className={`sidebar ${railCollapsed ? 'sidebar-rail' : ''}`}>
      <div className="sidebar-brand">
        {!railCollapsed && (
          <div className="wordmark">
            <span className="accent-text">Zelmir</span>
          </div>
        )}
        {onToggleRail && (
          <button
            type="button"
            className="sidebar-rail-toggle"
            onClick={onToggleRail}
            aria-label={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={railCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {railCollapsed ? <PanelExpandIcon /> : <PanelCollapseIcon />}
          </button>
        )}
      </div>

      <nav className="nav">
        {items.map(({ key, label, icon: Icon }) => {
          const active = view === key
          return (
            <button
              key={key}
              className={`nav-item ${active ? 'nav-item-active' : ''}`}
              onClick={() => onNavigate(key)}
              title={label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="nav-icon" />
              {!railCollapsed && (
                <span className={active ? 'accent-text nav-item-label' : 'nav-item-label'}>
                  {label}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {!railCollapsed && (
        <>
          <div className="sidebar-divider" />

          <div className="playlists-section">
            <button
              type="button"
              className="sidebar-new-playlist"
              onClick={() => {
                setPlaylistsCollapsed(false)
                setCreating(true)
              }}
            >
              <span className="sidebar-new-playlist-icon">
                <PlusIcon size={14} />
              </span>
              New playlist
            </button>

            <button
              type="button"
              className="sidebar-spotify-import"
              onClick={onOpenSpotifyImport}
            >
              <SpotifyGlyph />
              Import from Spotify
            </button>

            <div className="playlists-header">
              <button
                type="button"
                className="playlists-collapse-toggle"
                onClick={() => setPlaylistsCollapsed((c) => !c)}
                aria-label={playlistsCollapsed ? 'Expand playlists' : 'Collapse playlists'}
                title={playlistsCollapsed ? 'Expand playlists' : 'Collapse playlists'}
              >
                <ChevronDownIcon
                  size={14}
                  className={playlistsCollapsed ? 'playlists-chevron-collapsed' : ''}
                />
                <span>Playlists</span>
              </button>
            </div>

            {!playlistsCollapsed && (
              <>
                {creating && (
                  <input
                    className="new-playlist-input"
                    autoFocus
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
                  {playlists.map((pl) => {
                    const active = activePlaylistId === pl.id && view === 'playlist'
                    return (
                      <button
                        key={pl.id}
                        type="button"
                        className={`playlist-item ${active ? 'playlist-item-active' : ''}`}
                        onClick={() => onOpenPlaylist(pl.id)}
                      >
                        <span className={`playlist-item-name ${active ? 'accent-text' : ''}`}>
                          {pl.name}
                        </span>
                        <span
                          className="playlist-delete-button"
                          role="button"
                          tabIndex={0}
                          aria-label={`Delete ${pl.name}`}
                          title="Delete playlist"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            deletePlaylist(pl.id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              deletePlaylist(pl.id)
                            }
                          }}
                        >
                          <TrashIcon />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Collapsed rail: + and playlist initials */}
      {railCollapsed && (
        <div className="sidebar-rail-actions">
          <button
            type="button"
            className="sidebar-rail-icon-btn"
            onClick={() => {
              onToggleRail?.()
              window.setTimeout(() => {
                setPlaylistsCollapsed(false)
                setCreating(true)
              }, 0)
            }}
            title="New playlist"
            aria-label="New playlist"
          >
            <PlusIcon size={18} />
          </button>
          <div className="sidebar-rail-playlists">
            {playlists.map((pl) => {
              const active = activePlaylistId === pl.id && view === 'playlist'
              const initial = (pl.name.trim().charAt(0) || '?').toUpperCase()
              return (
                <button
                  key={pl.id}
                  type="button"
                  className={`sidebar-rail-pl ${active ? 'sidebar-rail-pl-active' : ''}`}
                  title={pl.name}
                  aria-label={pl.name}
                  onClick={() => onOpenPlaylist(pl.id)}
                >
                  {initial}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar accent-fill">
              {user.username.charAt(0).toUpperCase()}
            </div>
            {!railCollapsed && (
              <div className="sidebar-user-meta">
                <span className="sidebar-user-name">{user.username}</span>
                <button type="button" className="sidebar-signout" onClick={signout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
        {!railCollapsed && <p>Search runs on the YouTube Data API.</p>}
      </div>
    </aside>
  )
}
