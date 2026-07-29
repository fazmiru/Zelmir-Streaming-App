import { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import { usePlaylists } from '../playlists/PlaylistContext'
import { PlusIcon } from './Icons'

interface AddToPlaylistMenuProps {
  track: Track
}

export function AddToPlaylistMenu({ track }: AddToPlaylistMenuProps) {
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="add-to-playlist" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        className="add-to-playlist-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add to playlist"
        title="Add to playlist"
      >
        <PlusIcon size={16} />
      </button>

      {open && (
        <div className="add-to-playlist-menu">
          {playlists.length === 0 && <p className="add-to-playlist-empty">No playlists yet</p>}
          {playlists.map((pl) => (
            <button
              key={pl.id}
              className="add-to-playlist-option"
              onClick={() => {
                addTrackToPlaylist(pl.id, track)
                setOpen(false)
              }}
            >
              {pl.name}
            </button>
          ))}
          <button
            className="add-to-playlist-option add-to-playlist-new"
            onClick={() => {
              const id = createPlaylist('New playlist')
              addTrackToPlaylist(id, track)
              setOpen(false)
            }}
          >
            + New playlist
          </button>
        </div>
      )}
    </div>
  )
}
