import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Track } from '../types'
import { PlayIcon, GripIcon, ThumbsUpIcon, ThumbsDownIcon } from './Icons'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { TrackOptionsMenu } from './TrackOptionsMenu'
import { usePlaylists } from '../playlists/PlaylistContext'

const LIKED_SONGS_PLAYLIST_NAME = 'Liked Songs'

interface VideoGridProps {
  tracks: Track[]
  onPlay: (track: Track) => void
  currentVideoId?: string | null
  emptyLabel?: string
  /** When set, songs can be drag-reordered and onReorder is called with the new order. */
  reorderable?: boolean
  onReorder?: (tracks: Track[]) => void
  onOpenArtist?: (artist: string) => void
  /** Only passed when rendering an actual playlist's contents, enabling "Remove from playlist". */
  onRemoveTrack?: (videoId: string) => void
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
}

export function VideoGrid({
  tracks,
  onPlay,
  currentVideoId,
  emptyLabel,
  reorderable,
  onReorder,
  onOpenArtist,
  onRemoveTrack,
  onPlayNext,
  onAddToQueue,
  onStartMix,
}: VideoGridProps) {
  const { playlists, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist } = usePlaylists()
  const likedPlaylist = playlists.find((p) => p.name === LIKED_SONGS_PLAYLIST_NAME)
  // Dislike has no real destination in this app (no recommendation feed to
  // steer) — it's a purely visual, per-session toggle to match the hover UI,
  // not a persisted preference.
  const [dislikedIds, setDislikedIds] = useState<Set<string>>(new Set())
  // When "Save to playlist" is chosen from the ⋮ menu, open the add modal for this track.
  const [playlistMenuTrack, setPlaylistMenuTrack] = useState<Track | null>(null)

  const isLiked = (track: Track) => !!likedPlaylist?.tracks.some((t) => t.videoId === track.videoId)

  const toggleLike = (track: Track) => {
    if (likedPlaylist) {
      if (isLiked(track)) removeTrackFromPlaylist(likedPlaylist.id, track.videoId)
      else addTrackToPlaylist(likedPlaylist.id, track)
    } else {
      createPlaylist(LIKED_SONGS_PLAYLIST_NAME, [track])
    }
  }

  const toggleDislike = (videoId: string) => {
    setDislikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  // Local copy so we can show live reordering while dragging, without waiting on the parent.
  const [order, setOrder] = useState(tracks)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    // Don't clobber the live-reordered list mid-drag if the parent re-renders with old props.
    if (draggingRef.current) return
    setOrder(tracks)
  }, [tracks])

  if (order.length === 0) {
    return <p className="empty-state">{emptyLabel ?? 'Nothing here yet.'}</p>
  }

  const startDrag = (index: number, pointerId: number, target: HTMLElement) => {
    draggingRef.current = true
    dragIndexRef.current = index
    setDragIndex(index)
    target.setPointerCapture(pointerId)
  }

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (dragIndexRef.current === null) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const row = el?.closest<HTMLElement>('[data-track-row]')
    if (!row) return
    const hoverIndex = Number(row.dataset.trackRow)
    if (Number.isNaN(hoverIndex) || hoverIndex === dragIndexRef.current) return

    setOrder((prev) => {
      const next = prev.slice()
      const [moved] = next.splice(dragIndexRef.current!, 1)
      next.splice(hoverIndex, 0, moved)
      return next
    })
    dragIndexRef.current = hoverIndex
    setDragIndex(hoverIndex)
  }

  const endDrag = () => {
    if (dragIndexRef.current === null) return
    dragIndexRef.current = null
    setDragIndex(null)
    draggingRef.current = false
    onReorder?.(order)
  }

  return (
    <div className={`track-list ${reorderable ? 'track-list-reorderable' : ''}`}>
      <div className="track-list-header">
        <span className="track-col-index">#</span>
        <span className="track-col-title">Title</span>
        <span className="track-col-actions"></span>
      </div>

      {order.map((track, index) => {
        const isActive = track.videoId === currentVideoId
        const isDragging = index === dragIndex

        return (
          <div
            key={track.videoId}
            data-track-row={index}
            className={`track-row ${isActive ? 'track-row-active' : ''} ${isDragging ? 'track-row-dragging' : ''} ${
              reorderable ? 'track-row-reorderable' : ''
            }`}
            onClick={() => onPlay(track)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="track-col-index">
              <span className="row-number">{index + 1}</span>
              <button
                type="button"
                className="row-play-btn accent-text"
                aria-label={`Play ${track.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onPlay(track)
                }}
              >
                <PlayIcon size={16} />
              </button>
            </div>

            <div className="track-col-title">
              <img src={track.thumbnail} alt={track.title} className="track-thumb" />
              <div className="track-details">
                <span className={`track-name ${isActive ? 'accent-text' : ''}`}>{track.title}</span>
                {onOpenArtist ? (
                  <button
                    className="track-artist track-artist-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenArtist(track.artist)
                    }}
                  >
                    {track.artist}
                  </button>
                ) : (
                  <span className="track-artist">{track.artist}</span>
                )}
              </div>
            </div>

            <div className="track-col-actions" onClick={(e) => e.stopPropagation()}>
              {reorderable && (
                <button
                  type="button"
                  className="track-drag-handle"
                  aria-label={`Reorder ${track.title}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    startDrag(index, e.pointerId, e.currentTarget)
                  }}
                >
                  <GripIcon size={16} />
                </button>
              )}

              <div className="track-hover-actions">
                <button
                  className={`track-hover-btn ${isLiked(track) ? 'track-hover-btn-active' : ''}`}
                  onClick={() => toggleLike(track)}
                  aria-label={isLiked(track) ? 'Unlike' : 'Like'}
                  aria-pressed={isLiked(track)}
                  title={isLiked(track) ? 'Unlike' : 'Like'}
                >
                  <ThumbsUpIcon size={17} />
                </button>
                <button
                  className={`track-hover-btn ${dislikedIds.has(track.videoId) ? 'track-hover-btn-active' : ''}`}
                  onClick={() => toggleDislike(track.videoId)}
                  aria-label="Dislike"
                  aria-pressed={dislikedIds.has(track.videoId)}
                  title="Dislike"
                >
                  <ThumbsDownIcon size={17} />
                </button>
                <AddToPlaylistMenu track={track} />
                <TrackOptionsMenu
                  track={track}
                  isInPlaylist={!!onRemoveTrack}
                  isLiked={isLiked(track)}
                  onGoToArtist={onOpenArtist ? (artist) => onOpenArtist(artist) : undefined}
                  onRemoveFromPlaylist={
                    onRemoveTrack ? (t) => onRemoveTrack(t.videoId) : undefined
                  }
                  onPlayNext={onPlayNext}
                  onAddToQueue={onAddToQueue}
                  onStartMix={onStartMix}
                  onSaveToLibrary={toggleLike}
                  onSaveToPlaylist={(t) => setPlaylistMenuTrack(t)}
                />
              </div>
            </div>
          </div>
        )
      })}

      {/* Modal opened from the ⋮ menu "Save to playlist" item */}
      {playlistMenuTrack && (
        <AddToPlaylistMenu
          track={playlistMenuTrack}
          forceOpen
          onClose={() => setPlaylistMenuTrack(null)}
        />
      )}
    </div>
  )
}