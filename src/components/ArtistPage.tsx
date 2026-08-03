import type { Track } from '../types'
import { PlayIcon, ShuffleIcon } from './Icons'
import { VideoGrid } from './VideoGrid'

interface ArtistPageProps {
  artist: string
  tracks: Track[]
  loading: boolean
  description?: string | null
  subscriberText?: string | null
  coverUrl?: string | null
  avatarUrl?: string | null
  currentVideoId?: string | null
  onPlay: (track: Track, source?: Track[]) => void
  onShufflePlay: () => void
  onOpenArtist?: (artist: string) => void
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
}

export function ArtistPage({
  artist,
  tracks,
  loading,
  description,
  subscriberText,
  coverUrl,
  avatarUrl,
  currentVideoId,
  onPlay,
  onShufflePlay,
  onOpenArtist,
  onPlayNext,
  onAddToQueue,
  onStartMix,
}: ArtistPageProps) {
  const topTracks = tracks.slice(0, 10)
  // Channel banner / avatar only — avoid square album thumbnails in the hero
  const heroSrc = coverUrl || avatarUrl || ''

  return (
    <div className="artist-page">
      <div className={`artist-hero ${heroSrc ? '' : 'artist-hero-empty'}`}>
        {heroSrc ? (
          <img className="artist-hero-img" src={heroSrc} alt="" draggable={false} />
        ) : (
          <div className="artist-hero-fallback" />
        )}
        <div className="artist-hero-shade" />
        <div className="artist-hero-content">
          <h1 className="artist-hero-name">{artist}</h1>
          {subscriberText && <p className="artist-hero-meta">{subscriberText}</p>}
          {description ? (
            <p className="artist-hero-bio">
              {description.length > 260 ? (
                <>
                  {description.slice(0, 260).trim()}…{' '}
                  <span className="artist-hero-more">MORE</span>
                </>
              ) : (
                description
              )}
            </p>
          ) : (
            !loading && (
              <p className="artist-hero-bio artist-hero-bio-muted">
                Top tracks and releases related to {artist}.
              </p>
            )
          )}
          <div className="artist-hero-actions">
            <button
              type="button"
              className="artist-btn artist-btn-primary"
              onClick={onShufflePlay}
              disabled={loading || tracks.length === 0}
            >
              <ShuffleIcon size={18} />
              Shuffle
            </button>
            <button
              type="button"
              className="artist-btn artist-btn-secondary"
              onClick={() => tracks[0] && onPlay(tracks[0], tracks)}
              disabled={loading || tracks.length === 0}
            >
              <PlayIcon size={18} />
              Play
            </button>
          </div>
        </div>
      </div>

      <div className="artist-section">
        <h2 className="artist-section-title">Top songs</h2>
        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : (
          <VideoGrid
            tracks={topTracks.length ? topTracks : tracks}
            onPlay={onPlay}
            currentVideoId={currentVideoId}
            emptyLabel="Couldn't find anything for this artist."
            onOpenArtist={onOpenArtist}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onStartMix={onStartMix}
          />
        )}
      </div>

      {!loading && tracks.length > 10 && (
        <div className="artist-section">
          <h2 className="artist-section-title">More from {artist}</h2>
          <VideoGrid
            tracks={tracks.slice(10)}
            onPlay={onPlay}
            currentVideoId={currentVideoId}
            onOpenArtist={onOpenArtist}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onStartMix={onStartMix}
          />
        </div>
      )}
    </div>
  )
}
