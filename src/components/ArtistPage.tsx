import type { Track } from '../types'
import type { ArtistAlbum } from '../utils/piped'
import { PlayIcon, ShuffleIcon } from './Icons'
import { VideoGrid } from './VideoGrid'

interface ArtistPageProps {
  artist: string
  tracks: Track[]
  albums: ArtistAlbum[]
  loading: boolean
  loadingMore: boolean
  loadingAlbums: boolean
  hasMore: boolean
  description?: string | null
  subscriberText?: string | null
  coverUrl?: string | null
  avatarUrl?: string | null
  currentVideoId?: string | null
  onPlay: (track: Track, source?: Track[]) => void
  onShufflePlay: () => void
  onShowMore: () => void
  onOpenAlbum: (album: ArtistAlbum) => void
  onOpenArtist?: (artist: string) => void
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
}

export function ArtistPage({
  artist,
  tracks,
  albums,
  loading,
  loadingMore,
  loadingAlbums,
  hasMore,
  description,
  subscriberText,
  coverUrl,
  avatarUrl,
  currentVideoId,
  onPlay,
  onShufflePlay,
  onShowMore,
  onOpenAlbum,
  onOpenArtist,
  onPlayNext,
  onAddToQueue,
  onStartMix,
}: ArtistPageProps) {
  const heroSrc = coverUrl || avatarUrl || ''
  const visible = tracks

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
          <>
            <VideoGrid
              tracks={visible}
              onPlay={onPlay}
              currentVideoId={currentVideoId}
              emptyLabel="Couldn't find anything for this artist."
              onOpenArtist={onOpenArtist}
              onPlayNext={onPlayNext}
              onAddToQueue={onAddToQueue}
              onStartMix={onStartMix}
            />
            {(hasMore || loadingMore) && (
              <div className="artist-show-more-wrap">
                <button
                  type="button"
                  className="artist-show-more"
                  onClick={onShowMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Show all'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="artist-section">
        <div className="artist-section-head">
          <h2 className="artist-section-title">Albums</h2>
        </div>
        {loadingAlbums && albums.length === 0 ? (
          <p className="empty-state">Loading albums…</p>
        ) : albums.length === 0 ? (
          <p className="empty-state">No albums found.</p>
        ) : (
          <div className="artist-albums-row">
            {albums.map((al) => (
              <button
                key={al.id}
                type="button"
                className="artist-album-card"
                onClick={() => onOpenAlbum(al)}
              >
                <img src={al.thumbnail} alt="" className="artist-album-art" />
                <span className="artist-album-name">{al.name}</span>
                <span className="artist-album-meta">
                  {al.videoCount > 0 ? `${al.videoCount} songs` : 'Album'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
