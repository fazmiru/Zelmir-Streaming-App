// src/components/SpotifyImportModal.tsx
import { useEffect, useState, type CSSProperties } from 'react'
import {
  parseSpotifyPlaylistId,
  fetchSpotifyPlaylist,
  fetchUserPlaylists,
  type SpotifyPlaylistSummary,
} from '../utils/spotify'
import { isSpotifyConnected, startSpotifyLogin, getValidSpotifyToken, disconnectSpotify } from '../utils/spotifyAuth'
import { searchPipedTracksSimple } from '../utils/piped'
import type { Track, YouTubeSearchItem } from '../types'

interface SpotifyImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: (playlistName: string, tracks: Track[]) => void
  youtubeApiKey?: string
}

async function resolveTracksOnYouTube(
  spotifyTracks: { title: string; artist: string }[],
  youtubeApiKey: string | undefined,
  onProgress: (message: string) => void
): Promise<Track[]> {
  const resolved: Track[] = []

  for (let i = 0; i < spotifyTracks.length; i++) {
    const item = spotifyTracks[i]
    onProgress(`Matching song ${i + 1} of ${spotifyTracks.length}: ${item.title}...`)
    const query = `${item.title} ${item.artist}`

    // Try Piped first — no key, no quota.
    const pipedMatches = await searchPipedTracksSimple(query).catch(() => [])
    if (pipedMatches[0]) {
      resolved.push({
        videoId: pipedMatches[0].videoId,
        title: item.title,
        artist: item.artist,
        thumbnail: pipedMatches[0].thumbnail,
      })
      continue
    }

    if (!youtubeApiKey) continue
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&type=video&maxResults=1&key=${youtubeApiKey}`
    )
    if (ytRes.ok) {
      const ytData = await ytRes.json()
      const match: YouTubeSearchItem | undefined = ytData.items?.[0]
      if (match) {
        resolved.push({
          videoId: match.id.videoId,
          title: item.title,
          artist: item.artist,
          thumbnail: match.snippet.thumbnails.medium.url,
        })
      }
    }
  }

  return resolved
}

export function SpotifyImportModal({ isOpen, onClose, onImportSuccess, youtubeApiKey }: SpotifyImportModalProps) {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)

  const [userPlaylists, setUserPlaylists] = useState<SpotifyPlaylistSummary[]>([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [playlistsError, setPlaylistsError] = useState<string | null>(null)

  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setStatus(null)
    setConnected(isSpotifyConnected())
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !connected) return
    setLoadingPlaylists(true)
    setPlaylistsError(null)
    getValidSpotifyToken()
      .then((token) => {
        if (!token) throw new Error('Your Spotify session expired — please reconnect.')
        return fetchUserPlaylists(token)
      })
      .then(setUserPlaylists)
      .catch((err) => setPlaylistsError(err.message || 'Could not load your playlists.'))
      .finally(() => setLoadingPlaylists(false))
  }, [isOpen, connected])

  if (!isOpen) return null

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      await startSpotifyLogin()
      // Browser is navigating away to Spotify — nothing more to do here.
    } catch (err: any) {
      setError(err.message || 'Could not start Spotify login.')
      setConnecting(false)
    }
  }

  const handleDisconnect = () => {
    disconnectSpotify()
    setConnected(false)
    setUserPlaylists([])
  }

  const runImport = async (playlistIdOrUrl: string) => {
    setError(null)
    setImporting(true)
    try {
      const token = await getValidSpotifyToken()
      if (!token) {
        setConnected(false)
        throw new Error('Your Spotify session expired — please reconnect.')
      }

      setStatus('Fetching playlist from Spotify...')
      const { name, tracks: spotifyTracks } = await fetchSpotifyPlaylist(playlistIdOrUrl, token)

      if (spotifyTracks.length === 0) {
        throw new Error('No playable tracks found in this playlist.')
      }

      const resolvedTracks = await resolveTracksOnYouTube(spotifyTracks, youtubeApiKey, setStatus)

      if (resolvedTracks.length === 0) {
        throw new Error('Failed to match any tracks on YouTube.')
      }

      onImportSuccess(name, resolvedTracks)
      onClose()
      setUrl('')
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Import failed.')
    } finally {
      setImporting(false)
      setStatus(null)
    }
  }

  const handleImportFromUrl = () => {
    if (!url.trim()) {
      setError('Please paste a Spotify playlist link.')
      return
    }
    if (!parseSpotifyPlaylistId(url)) {
      setError('Invalid Spotify URL. Format should be: https://open.spotify.com/playlist/...')
      return
    }
    runImport(url)
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: 0 }}>Import Spotify Playlist</h3>

        {!connected && (
          <>
            <p style={{ fontSize: '0.9rem', opacity: 0.8, margin: 0 }}>
              Log in with Spotify to import any of your playlists — or paste a link to any public one.
            </p>
            <button onClick={handleConnect} disabled={connecting} style={buttonPrimaryStyle}>
              {connecting ? 'Redirecting to Spotify...' : 'Log in with Spotify'}
            </button>
          </>
        )}

        {connected && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: 0 }}>Connected to Spotify</p>
              <button onClick={handleDisconnect} disabled={importing} style={linkButtonStyle}>
                Disconnect
              </button>
            </div>

            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '4px 0 8px' }}>Your playlists</p>
              {loadingPlaylists && <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Loading your playlists...</p>}
              {playlistsError && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{playlistsError}</p>}
              {!loadingPlaylists && !playlistsError && userPlaylists.length === 0 && (
                <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>No playlists found on your account.</p>
              )}
              {!loadingPlaylists && userPlaylists.length > 0 && (
                <div style={playlistListStyle}>
                  {userPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => runImport(pl.id)}
                      disabled={importing}
                      style={playlistRowStyle}
                    >
                      {pl.image ? (
                        <img src={pl.image} alt="" style={playlistThumbStyle} />
                      ) : (
                        <div style={{ ...playlistThumbStyle, background: '#3f3f46' }} />
                      )}
                      <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pl.name}
                      </span>
                      <span style={{ fontSize: '0.78rem', opacity: 0.6, flexShrink: 0 }}>{pl.trackCount} songs</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '4px 0 0' }}>Or paste any playlist link</p>
            <input
              type="text"
              placeholder="https://open.spotify.com/playlist/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={importing}
              style={inputStyle}
            />
          </>
        )}

        {status && <p style={{ color: '#60a5fa', fontSize: '0.85rem' }}>{status}</p>}
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button onClick={onClose} disabled={importing} style={buttonSecondaryStyle}>
            Cancel
          </button>
          {connected && (
            <button onClick={handleImportFromUrl} disabled={importing} style={buttonPrimaryStyle}>
              {importing ? 'Importing...' : 'Import from link'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: CSSProperties = {
  backgroundColor: '#18181b',
  padding: '24px',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '480px',
  maxHeight: '85vh',
  overflowY: 'auto',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #3f3f46',
  backgroundColor: '#27272a',
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
}

const buttonPrimaryStyle: CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#3b82f6',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
}

const buttonSecondaryStyle: CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: '1px solid #3f3f46',
  backgroundColor: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
}

const linkButtonStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#a1a1aa',
  fontSize: '0.8rem',
  textDecoration: 'underline',
  cursor: 'pointer',
  padding: 0,
}

const playlistListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxHeight: '220px',
  overflowY: 'auto',
}

const playlistRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#27272a',
  color: '#fff',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
}

const playlistThumbStyle: CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '4px',
  objectFit: 'cover',
  flexShrink: 0,
}
