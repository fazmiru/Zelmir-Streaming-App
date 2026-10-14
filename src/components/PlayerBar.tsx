import React from 'react'
import type { RepeatMode, Track } from '../types'
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  VolumeIcon,
  ShuffleIcon,
  RepeatIcon,
  ThumbsUpIcon,
} from './Icons'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'
import { usePlaylists } from '../playlists/PlaylistContext'

const LIKED_SONGS_PLAYLIST_NAME = 'Liked Songs'

interface PlayerBarProps {
  current: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  shuffle: boolean
  repeatMode: RepeatMode
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (seconds: number) => void
  onVolume: (v: number) => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onOpenNowPlaying: () => void
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const PlayerBar = React.memo(function PlayerBar({
  current,
  isPlaying,
  currentTime,
  duration,
  volume,
  shuffle,
  repeatMode,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onToggleShuffle,
  onCycleRepeat,
  onOpenNowPlaying,
}: PlayerBarProps) {
  const { playlists, createPlaylist, addTrackToPlaylist, removeTrackFromPlaylist } = usePlaylists()
  const likedPlaylist = playlists.find((p) => p.name === LIKED_SONGS_PLAYLIST_NAME)
  const seekProgress = duration > 0 ? (currentTime / duration) * 100 : 0

  const isLiked = current
    ? !!likedPlaylist?.tracks.some((t) => t.videoId === current.videoId)
    : false

  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!current) return
    if (likedPlaylist) {
      if (isLiked) removeTrackFromPlaylist(likedPlaylist.id, current.videoId)
      else addTrackToPlaylist(likedPlaylist.id, current)
    } else {
      createPlaylist(LIKED_SONGS_PLAYLIST_NAME, [current])
    }
  }

  return (
    <div className="player-bar">
      {/* ---------------- Left: Track Details + like / add ---------------- */}
      <div
        className={`player-now-playing ${current ? 'player-now-playing-clickable' : ''}`}
        onClick={() => current && onOpenNowPlaying()}
      >
        {current ? (
          <>
            <img src={current.thumbnail} alt={current.title} className="player-thumb" />
            <div className="player-meta">
              <p className="player-title">{current.title}</p>
              <p className="player-artist">{current.artist}</p>
            </div>
            <div className="player-track-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`player-action-btn ${isLiked ? 'player-action-btn-active' : ''}`}
                onClick={toggleLike}
                aria-label={isLiked ? 'Unlike' : 'Like'}
                title={isLiked ? 'Unlike' : 'Like'}
              >
                <ThumbsUpIcon size={18} />
              </button>
              <AddToPlaylistMenu track={current} />
            </div>
          </>
        ) : (
          <p className="player-empty">Pick a song to start listening</p>
        )}
      </div>

      {/* ---------------- Center: Transport Controls & Seek ---------------- */}
      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            className={`transport-button transport-button-toggle ${shuffle ? 'transport-button-on' : ''}`}
            onClick={onToggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title="Shuffle"
          >
            <ShuffleIcon />
          </button>

          <button type="button" className="transport-button" onClick={onPrev} aria-label="Previous">
            <PrevIcon />
          </button>

          <button
            type="button"
            className="transport-button transport-button-main accent-fill"
            onClick={onToggle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button type="button" className="transport-button" onClick={onNext} aria-label="Next">
            <NextIcon />
          </button>

          <button
            type="button"
            className={`transport-button transport-button-toggle ${repeatMode !== 'off' ? 'transport-button-on' : ''}`}
            onClick={onCycleRepeat}
            aria-label="Repeat"
            title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
          >
            <RepeatIcon />
            {repeatMode === 'one' && <span className="repeat-one-dot accent-fill" />}
          </button>
        </div>

        <div className="seek-row">
          <span className="time-label">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="seek-bar accent-range"
            min={0}
            max={duration > 0 ? duration : 100}
            step={0.1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{ '--progress': `${seekProgress}%` } as React.CSSProperties}
          />
          <span className="time-label">{formatTime(duration)}</span>
        </div>
      </div>

      {/* ---------------- Right: Volume Bar ---------------- */}
      <div className="player-volume">
        <VolumeIcon />
        <input
          type="range"
          className="volume-bar accent-range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolume(Number(e.target.value))}
          style={{ '--progress': `${volume}%` } as React.CSSProperties}
        />
      </div>

      {/* Top Hairline Indicator */}
      <div className="player-progress-line accent-fill" style={{ width: `${seekProgress}%` }} />
    </div>
  )
})
