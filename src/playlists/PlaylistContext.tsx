import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Playlist, Track } from '../types'
import { useAuth } from '../auth/AuthContext'

const GLOBAL_KEY = 'zelmir-playlists'

function storageKey(userId: string | null): string {
  return userId ? `zelmir-playlists:${userId}` : GLOBAL_KEY
}

interface PlaylistContextValue {
  playlists: Playlist[]
  createPlaylist: (name: string, initialTracks?: Track[]) => string
  deletePlaylist: (id: string) => void
  addTrackToPlaylist: (id: string, track: Track) => void
  addTracksToPlaylist: (id: string, tracks: Track[]) => void
  removeTrackFromPlaylist: (id: string, videoId: string) => void
  reorderPlaylistTracks: (id: string, tracks: Track[]) => void
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null)

function load(userId: string | null): Playlist[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [playlists, setPlaylists] = useState<Playlist[]>(() => load(user?.id ?? null))

  // When the signed-in user changes, swap to that user's saved playlists.
  useEffect(() => {
    setPlaylists(load(user?.id ?? null))
  }, [user?.id])

  useEffect(() => {
    localStorage.setItem(storageKey(user?.id ?? null), JSON.stringify(playlists))
  }, [playlists, user?.id])

  const createPlaylist = (name: string, initialTracks: Track[] = []) => {
    const id = crypto.randomUUID()
    setPlaylists((p) => [
      ...p,
      { id, name: name.trim() || 'Untitled playlist', tracks: initialTracks }
    ])
    return id
  }

  const deletePlaylist = (id: string) => {
    setPlaylists((p) => p.filter((pl) => pl.id !== id))
  }

  const addTrackToPlaylist = (id: string, track: Track) => {
    setPlaylists((p) =>
      p.map((pl) =>
        pl.id === id && !pl.tracks.some((t) => t.videoId === track.videoId)
          ? { ...pl, tracks: [...pl.tracks, track] }
          : pl
      )
    )
  }

  const addTracksToPlaylist = (id: string, tracks: Track[]) => {
    setPlaylists((p) =>
      p.map((pl) => {
        if (pl.id !== id) return pl
        const existingIds = new Set(pl.tracks.map((t) => t.videoId))
        const newTracks = tracks.filter((t) => !existingIds.has(t.videoId))
        return { ...pl, tracks: [...pl.tracks, ...newTracks] }
      })
    )
  }

  const removeTrackFromPlaylist = (id: string, videoId: string) => {
    setPlaylists((p) =>
      p.map((pl) => (pl.id === id ? { ...pl, tracks: pl.tracks.filter((t) => t.videoId !== videoId) } : pl))
    )
  }

  const reorderPlaylistTracks = (id: string, tracks: Track[]) => {
    setPlaylists((p) => p.map((pl) => (pl.id === id ? { ...pl, tracks } : pl)))
  }

  const value = useMemo(
    () => ({
      playlists,
      createPlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlists]
  )

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>
}

export function usePlaylists() {
  const ctx = useContext(PlaylistContext)
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistProvider')
  return ctx
}