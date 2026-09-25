import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Playlist, Track } from '../types'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface PlaylistContextValue {
  playlists: Playlist[]
  createPlaylist: (name: string, initialTracks?: Track[]) => string
  renamePlaylist: (id: string, name: string) => void
  duplicatePlaylist: (id: string) => string
  deletePlaylist: (id: string) => void
  addTrackToPlaylist: (id: string, track: Track) => void
  addTracksToPlaylist: (id: string, tracks: Track[]) => void
  removeTrackFromPlaylist: (id: string, videoId: string) => void
  reorderPlaylistTracks: (id: string, tracks: Track[]) => void
}

const PlaylistContext = createContext<PlaylistContextValue | null>(null)

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [playlists, setPlaylists] = useState<Playlist[]>([])

  // Load this user's playlists from Supabase whenever who's signed in changes.
  useEffect(() => {
    if (!user) {
      setPlaylists([])
      return
    }
    let cancelled = false
    supabase
      .from('playlists')
      .select('id, name, tracks')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setPlaylists((data ?? []).map((row) => ({ id: row.id, name: row.name, tracks: row.tracks ?? [] })))
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const pushTracks = (id: string, tracks: Track[]) => {
    supabase
      .from('playlists')
      .update({ tracks, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to save playlist tracks:', error)
      })
  }

  const createPlaylist = (name: string, initialTracks: Track[] = []) => {
    if (!user) return ''
    const id = crypto.randomUUID()
    const playlistName = name.trim() || 'Untitled playlist'
    setPlaylists((p) => [...p, { id, name: playlistName, tracks: initialTracks }])
    supabase
      .from('playlists')
      .insert({ id, user_id: user.id, name: playlistName, tracks: initialTracks })
      .then(({ error }) => {
        if (error) console.error('Failed to save new playlist:', error)
      })
    return id
  }

  const deletePlaylist = (id: string) => {
    setPlaylists((p) => p.filter((pl) => pl.id !== id))
    supabase
      .from('playlists')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to delete playlist:', error)
      })
  }

  const renamePlaylist = (id: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    setPlaylists((p) => p.map((pl) => (pl.id === id ? { ...pl, name: nextName } : pl)))
    supabase
      .from('playlists')
      .update({ name: nextName, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Failed to rename playlist:', error)
      })
  }

  const duplicatePlaylist = (id: string) => {
    const source = playlists.find((pl) => pl.id === id)
    if (!source) return ''
    return createPlaylist(`${source.name} copy`, source.tracks)
  }

  const addTrackToPlaylist = (id: string, track: Track) => {
    setPlaylists((p) =>
      p.map((pl) => {
        if (pl.id !== id || pl.tracks.some((t) => t.videoId === track.videoId)) return pl
        const nextTracks = [...pl.tracks, track]
        pushTracks(id, nextTracks)
        return { ...pl, tracks: nextTracks }
      })
    )
  }

  const addTracksToPlaylist = (id: string, tracks: Track[]) => {
    setPlaylists((p) =>
      p.map((pl) => {
        if (pl.id !== id) return pl
        const existingIds = new Set(pl.tracks.map((t) => t.videoId))
        const newTracks = tracks.filter((t) => !existingIds.has(t.videoId))
        const nextTracks = [...pl.tracks, ...newTracks]
        pushTracks(id, nextTracks)
        return { ...pl, tracks: nextTracks }
      })
    )
  }

  const removeTrackFromPlaylist = (id: string, videoId: string) => {
    setPlaylists((p) =>
      p.map((pl) => {
        if (pl.id !== id) return pl
        const nextTracks = pl.tracks.filter((t) => t.videoId !== videoId)
        pushTracks(id, nextTracks)
        return { ...pl, tracks: nextTracks }
      })
    )
  }

  const reorderPlaylistTracks = (id: string, tracks: Track[]) => {
    setPlaylists((p) => p.map((pl) => (pl.id === id ? { ...pl, tracks } : pl)))
    pushTracks(id, tracks)
  }

  const value = useMemo(
    () => ({
      playlists,
      createPlaylist,
      renamePlaylist,
      duplicatePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      addTracksToPlaylist,
      removeTrackFromPlaylist,
      reorderPlaylistTracks,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlists, user]
  )

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>
}

export function usePlaylists() {
  const ctx = useContext(PlaylistContext)
  if (!ctx) throw new Error('usePlaylists must be used within PlaylistProvider')
  return ctx
}
