import type { Track } from '../types'
import { PlayIcon } from './Icons'
import { AddToPlaylistMenu } from './AddToPlaylistMenu'

interface VideoGridProps {
  tracks: Track[]
  onPlay: (track: Track) => void
  currentVideoId?: string | null
  emptyLabel?: string
}

export function VideoGrid({ tracks, onPlay, currentVideoId, emptyLabel }: VideoGridProps) {
  if (tracks.length === 0) {
    return <p className="empty-state">{emptyLabel ?? 'Nothing here yet.'}</p>
  }

  return (
    <div className="track-list">
      <div className="track-list-header">
        <span className="track-col-index">#</span>
        <span className="track-col-title">Title</span>
        <span className="track-col-actions"></span>
      </div>

      {tracks.map((track, index) => {
        const isActive = track.videoId === currentVideoId

        return (
          <div
            key={track.videoId}
            className={`track-row ${isActive ? 'track-row-active' : ''}`}
            onClick={() => onPlay(track)}
          >
            <div className="track-col-index">
              <span className="row-number">{index + 1}</span>
              <button
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
                <span className="track-artist">{track.artist}</span>
              </div>
            </div>

            <div className="track-col-actions" onClick={(e) => e.stopPropagation()}>
              <AddToPlaylistMenu track={track} />
            </div>
          </div>
        )
      })}
    </div>
  )
}