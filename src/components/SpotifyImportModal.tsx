// src/components/SpotifyImportModal.tsx
import { useState } from 'react'
import { parseSpotifyPlaylistId, fetchSpotifyPlaylist } from '../utils/spotify'
import { searchPipedTracksSimple } from '../utils/piped'
import type { Track, YouTubeSearchItem } from '../types'

interface SpotifyImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportSuccess: (playlistName: string, tracks: Track[]) => void
  youtubeApiKey?: string
}

export function SpotifyImportModal({ isOpen, onClose, onImportSuccess, youtubeApiKey }: SpotifyImportModalProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleImport = async () => {
    setError(null)
    setStatus(null)

    if (!url.trim()) {
      setError('Please enter a Spotify playlist URL.')
      return
    }

    const playlistId = parseSpotifyPlaylistId(url)
    if (!playlistId) {
      setError('Invalid Spotify URL. Format should be: https://open.spotify.com/playlist/...')
      return
    }

    setLoading(true)
    try {
      setStatus('Fetching playlist from Spotify...')
      const { name, tracks: spotifyTracks } = await fetchSpotifyPlaylist(playlistId)

      if (spotifyTracks.length === 0) {
        throw new Error('No playable tracks found in this playlist.')
      }

      const resolvedTracks: Track[] = []

      for (let i = 0; i < spotifyTracks.length; i++) {
        const item = spotifyTracks[i]
        setStatus(`Matching song ${i + 1} of ${spotifyTracks.length}: ${item.title}...`)

        const query = `${item.title} ${item.artist}`

        // Try Piped first — no key, no quota.
        const pipedMatches = await searchPipedTracksSimple(query).catch(() => [])
        if (pipedMatches[0]) {
          resolvedTracks.push({
            videoId: pipedMatches[0].videoId,
            title: item.title,
            artist: item.artist,
            thumbnail: pipedMatches[0].thumbnail,
          })
          continue
        }

        // Piped found nothing for this track — fall back to Google if a key is configured.
        if (!youtubeApiKey) continue
        const ytRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
            query
          )}&type=video&maxResults=1&key=${youtubeApiKey}`
        )

        if (ytRes.ok) {
          const ytData = await ytRes.json()
          const searchMatch: YouTubeSearchItem | undefined = ytData.items?.[0]
          if (searchMatch) {
            resolvedTracks.push({
              videoId: searchMatch.id.videoId,
              title: item.title,
              artist: item.artist,
              thumbnail: searchMatch.snippet.thumbnails.medium.url,
            })
          }
        }
      }

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
      setLoading(false)
      setStatus(null)
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3>Import Spotify Playlist</h3>
        <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
          Paste a public Spotify playlist link to convert its tracks into Zelmir.
        </p>

        <input
          type="text"
          placeholder="https://open.spotify.com/playlist/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          style={inputStyle}
        />

        {status && <p style={{ color: '#60a5fa', fontSize: '0.85rem' }}>{status}</p>}
        {error && <p style={{ color: '#f87171', fontSize: '0.85rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} disabled={loading} style={buttonSecondaryStyle}>
            Cancel
          </button>
          <button onClick={handleImport} disabled={loading} style={buttonPrimaryStyle}>
            {loading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalStyle: React.CSSProperties = {
  backgroundColor: '#18181b',
  padding: '24px',
  borderRadius: '12px',
  width: '100%',
  maxWidth: '440px',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #3f3f46',
  backgroundColor: '#27272a',
  color: '#fff',
  outline: 'none',
}

const buttonPrimaryStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: 'none',
  backgroundColor: '#3b82f6',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
}

const buttonSecondaryStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '6px',
  border: '1px solid #3f3f46',
  backgroundColor: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
}