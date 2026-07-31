import { useState, useEffect } from 'react'
import type { Track } from '../types'
import { usePlaylists } from '../playlists/PlaylistContext'
import { PlusIcon, CloseIcon } from './Icons'

interface AddToPlaylistMenuProps {
  track: Track
  /** When true, open the modal immediately (used by the ⋮ menu "Save to playlist"). */
  forceOpen?: boolean
  onClose?: () => void
}

export function AddToPlaylistMenu({ track, forceOpen = false, onClose }: AddToPlaylistMenuProps) {
  const { playlists, addTrackToPlaylist, createPlaylist } = usePlaylists()
  const [open, setOpen] = useState(forceOpen)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const close = () => {
    setOpen(false)
    setCreating(false)
    setDraftName('')
    setJustAdded(null)
    onClose?.()
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
      {!forceOpen && (
        <button
          className="add-to-playlist-trigger"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          aria-label="Add to playlist"
          title="Add to playlist"
        >
          <PlusIcon size={16} />
        </button>
      )}

      {open && (
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
                    {justAdded === pl.id
                      ? 'Added ✓'
                      : `${pl.tracks.length} song${pl.tracks.length === 1 ? '' : 's'}`}
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
  )
}