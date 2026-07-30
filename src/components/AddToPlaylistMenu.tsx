<<<<<<< HEAD
import { useState } from 'react'
import type { Track } from '../types'
import { usePlaylists } from '../playlists/PlaylistContext'
import { PlusIcon, CloseIcon } from './Icons'
=======
import { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import { usePlaylists } from '../playlists/PlaylistContext'
import { PlusIcon } from './Icons'
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e

interface AddToPlaylistMenuProps {
  track: Track
}

export function AddToPlaylistMenu({ track }: AddToPlaylistMenuProps) {
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const [open, setOpen] = useState(false)
<<<<<<< HEAD
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setCreating(false)
    setDraftName('')
    setJustAdded(null)
  }

  const handleAdd = (playlistId: string) => {
    addTrackToPlaylist(playlistId, track)
    setJustAdded(playlistId)
  }

  const handleCreateAndAdd = () => {
    if (!draftName.trim()) return
    const id = createPlaylist(draftName)
    if (id) {
      addTrackToPlaylist(id, track)
      setJustAdded(id)
    }
    setDraftName('')
    setCreating(false)
  }

  return (
    <>
      <button
        className="add-to-playlist-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
=======
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
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
        aria-label="Add to playlist"
        title="Add to playlist"
      >
        <PlusIcon size={16} />
      </button>

      {open && (
<<<<<<< HEAD
        <div
          className="add-to-playlist-overlay"
          onClick={(e) => {
            e.stopPropagation()
            close()
          }}
        >
          <div className="add-to-playlist-box" onClick={(e) => e.stopPropagation()}>
            <div className="add-to-playlist-box-header">
              <span>Add to playlist</span>
              <button className="add-to-playlist-close" onClick={close} aria-label="Close">
                <CloseIcon size={18} />
              </button>
            </div>

            <p className="add-to-playlist-track">
              <img src={track.thumbnail} alt="" className="add-to-playlist-track-thumb" />
              <span className="add-to-playlist-track-title">{track.title}</span>
            </p>

            <div className="add-to-playlist-list">
              {playlists.length === 0 && !creating && (
                <p className="add-to-playlist-empty">No playlists yet — create one below.</p>
              )}
              {playlists.map((pl) => (
                <button key={pl.id} className="add-to-playlist-row" onClick={() => handleAdd(pl.id)}>
                  <span className="add-to-playlist-row-name">{pl.name}</span>
                  <span className="add-to-playlist-row-status">
                    {justAdded === pl.id ? 'Added ✓' : `${pl.tracks.length} song${pl.tracks.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              ))}
            </div>

            {creating ? (
              <input
                autoFocus
                className="add-to-playlist-new-input"
                placeholder="Playlist name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateAndAdd()
                  if (e.key === 'Escape') setCreating(false)
                }}
                onBlur={handleCreateAndAdd}
              />
            ) : (
              <button className="add-to-playlist-new-button" onClick={() => setCreating(true)}>
                <PlusIcon size={14} />
                New playlist
              </button>
            )}
          </div>
        </div>
      )}
    </>
=======
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
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
  )
}
