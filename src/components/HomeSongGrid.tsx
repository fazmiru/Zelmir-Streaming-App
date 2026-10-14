import React, { useState, useMemo, useCallback } from 'react'
import type { Track } from '../types'
import { ThumbsUpIcon } from './Icons'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { TrackOptionsMenu } from './TrackOptionsMenu'
import { usePlaylists } from '../playlists/PlaylistContext'
import './homeExtras.css'
import { TrackArtwork } from './TrackArtwork'

const LIKED_SONGS_PLAYLIST_NAME = 'Liked Songs'

interface HomeSongGridProps {
  tracks: Track[]
  onPlay: (track: Track, source?: Track[]) => void
  currentVideoId?: string | null
  columns?: number
  rows?: number
  emptyLabel?: string
  onOpenArtist?: (artist: string) => void
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
}

export const HomeSongGrid = React.memo(function HomeSongGrid({
  tracks,
  onPlay,
  currentVideoId,
  columns = 3,
  rows = 5,
  emptyLabel = 'Nothing here yet.',
  onOpenArtist,
  onPlayNext,
  onAddToQueue,
  onStartMix,
}: HomeSongGridProps) {
  const { playlists, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist } = usePlaylists()
  const likedPlaylist = useMemo(() => playlists.find((p) => p.name === LIKED_SONGS_PLAYLIST_NAME), [playlists])
  const [playlistMenuTrack, setPlaylistMenuTrack] = useState<Track | null>(null)

  const pageSize = columns * rows
  const pageCount = Math.max(1, Math.ceil(Math.max(tracks.length, 1) / pageSize))
  const [page, setPage] = useState(0)
  const safePage = Math.min(page, pageCount - 1)
  const slice = useMemo(() => tracks.slice(safePage * pageSize, safePage * pageSize + pageSize), [tracks, safePage, pageSize])

  const isLiked = useCallback(
    (track: Track) => !!likedPlaylist?.tracks.some((t) => t.videoId === track.videoId),
    [likedPlaylist]
  )

  const toggleLike = useCallback(
    (track: Track) => {
      if (likedPlaylist) {
        if (isLiked(track)) removeTrackFromPlaylist(likedPlaylist.id, track.videoId)
        else addTrackToPlaylist(likedPlaylist.id, track)
      } else {
        createPlaylist(LIKED_SONGS_PLAYLIST_NAME, [track])
      }
    },
    [likedPlaylist, isLiked, removeTrackFromPlaylist, addTrackToPlaylist, createPlaylist]
  )

  if (!tracks.length) {
    return <p className="empty-state">{emptyLabel}</p>
  }

  const canPrev = safePage > 0
  const canNext = safePage < pageCount - 1

  return (
    <div className="home-song-grid-wrap">
      {/* Edge arrows — same style as album shelves, far left/right of the grid */}
      {pageCount > 1 && (
        <>
          <button
            type="button"
            className="home-shelf-edge-btn home-shelf-edge-prev home-song-grid-edge"
            disabled={!canPrev}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            className="home-shelf-edge-btn home-shelf-edge-next home-song-grid-edge"
            disabled={!canNext}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next"
          >
            ›
          </button>
        </>
      )}
      <div
        className="home-song-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {slice.map((t, i) => {
          const idx = safePage * pageSize + i
          const active = currentVideoId === t.videoId
          return (
            <div
              key={`${t.videoId}-${idx}`}
              className={`home-song-cell ${active ? 'home-song-cell-active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onPlay(t, tracks)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPlay(t, tracks)
                }
              }}
            >
              <TrackArtwork
                src={t.thumbnail}
                videoId={t.videoId}
                alt=""
                className="home-song-cell-art"
                loading="lazy"
                decoding="async"
              />
              <div className="home-song-cell-meta">
                <span className="home-song-cell-title">{t.title}</span>
                {onOpenArtist ? (
                  <button
                    type="button"
                    className="home-song-cell-artist home-song-cell-artist-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenArtist(t.artist)
                    }}
                  >
                    {t.artist}
                  </button>
                ) : (
                  <span className="home-song-cell-artist">{t.artist}</span>
                )}
              </div>
              <div className="home-song-cell-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={`track-hover-btn ${isLiked(t) ? 'track-hover-btn-active' : ''}`}
                  onClick={() => toggleLike(t)}
                  aria-label={isLiked(t) ? 'Unlike' : 'Like'}
                  title={isLiked(t) ? 'Unlike' : 'Like'}
                >
                  <ThumbsUpIcon size={16} />
                </button>
                <AddToPlaylistMenu track={t} />
                <TrackOptionsMenu
                  track={t}
                  isLiked={isLiked(t)}
                  onGoToArtist={onOpenArtist ? (artist) => onOpenArtist(artist) : undefined}
                  onPlayNext={onPlayNext}
                  onAddToQueue={onAddToQueue}
                  onStartMix={onStartMix}
                  onSaveToLibrary={toggleLike}
                  onSaveToPlaylist={(tr) => setPlaylistMenuTrack(tr)}
                />
              </div>
            </div>
          )
        })}
      </div>
      {playlistMenuTrack && (
        <AddToPlaylistMenu
          track={playlistMenuTrack}
          forceOpen
          onClose={() => setPlaylistMenuTrack(null)}
        />
      )}
    </div>
  )
})
