import type { Track } from '../types'
import { TrackOptionsMenu } from './TrackOptionsMenu'

interface TrackRowProps {
  track: Track
  index: number
  onPlay: (track: Track) => void
  onPlayNext?: () => void
  onAddToQueue?: () => void
  onStartMix?: () => void
  onSaveToLibrary?: () => void
  onSaveToPlaylist?: () => void
  onRemoveFromPlaylist?: () => void
  onGoToAlbum?: () => void
  onGoToArtist?: () => void
}

export function TrackRow({
  track,
  index,
  onPlay,
  onPlayNext,
  onAddToQueue,
  onStartMix,
  onSaveToLibrary,
  onSaveToPlaylist,
  onRemoveFromPlaylist,
  onGoToAlbum,
  onGoToArtist,
}: TrackRowProps) {
  return (
    <div className="track-row" onClick={() => onPlay(track)}>
      <span className="track-index">{index + 1}</span>
      <div className="track-info">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}</span>
      </div>

      <div className="track-actions" onClick={(e) => e.stopPropagation()}>
        <TrackOptionsMenu 
          track={track}
          isInPlaylist={true}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onStartMix={onStartMix}
          onSaveToLibrary={onSaveToLibrary}
          onSaveToPlaylist={onSaveToPlaylist}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onGoToAlbum={onGoToAlbum}
          onGoToArtist={onGoToArtist}
        />
      </div>
    </div>
  )
}