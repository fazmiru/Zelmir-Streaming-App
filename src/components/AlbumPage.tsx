import type { Track } from '../types'
import { PlayIcon } from './Icons'
import { VideoGrid } from './VideoGrid'

export interface AlbumRelease {
  id: string
  name: string
  thumbnail: string
  meta?: string
}

interface AlbumPageProps {
  name: string
  artist: string
  description: string
  thumbnail: string
  tracks: Track[]
  loading: boolean
  releases: AlbumRelease[]
  loadingReleases: boolean
  currentVideoId?: string | null
  onPlay: (track: Track, source?: Track[]) => void
  onPlayAll: () => void
  onOpenRelease: (rel: AlbumRelease) => void
  onOpenArtist?: (artist: string) => void
  onPlayNext?: (track: Track) => void
  onAddToQueue?: (track: Track) => void
  onStartMix?: (track: Track) => void
}

export function AlbumPage({
  name,
  artist,
  description,
  thumbnail,
  tracks,
  loading,
  releases,
  loadingReleases,
  currentVideoId,
  onPlay,
  onPlayAll,
  onOpenRelease,
  onOpenArtist,
  onPlayNext,
  onAddToQueue,
  onStartMix,
}: AlbumPageProps) {
  return (
    <div className="album-page">
      <div className="album-header">
        <img className="album-cover" src={thumbnail} alt="" />
        <div className="album-header-meta">
          <p className="album-label">Album</p>
          <h1 className="album-title">{name}</h1>
          <button
            type="button"
            className="album-artist-link"
            onClick={() => onOpenArtist?.(artist)}
          >
            {artist}
          </button>
          <p className="album-stats">
            {tracks.length > 0 ? `${tracks.length} songs` : loading ? 'Loading…' : ''}
          </p>
          {description && (
            <p className="album-desc">
              {description.length > 180 ? `${description.slice(0, 180).trim()}…` : description}
            </p>
          )}
          <div className="album-actions">
            <button
              type="button"
              className="artist-btn artist-btn-primary album-play-all"
              onClick={onPlayAll}
              disabled={loading || tracks.length === 0}
              aria-label="Play album"
            >
              <PlayIcon size={22} />
            </button>
          </div>
        </div>
      </div>

      <div className="artist-section">
        {loading ? (
          <p className="empty-state">Loading tracks…</p>
        ) : (
          <VideoGrid
            tracks={tracks}
            onPlay={onPlay}
            currentVideoId={currentVideoId}
            emptyLabel="No tracks in this album."
            onOpenArtist={onOpenArtist}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onStartMix={onStartMix}
          />
        )}
      </div>

      <div className="artist-section">
        <h2 className="artist-section-title">Releases for you</h2>
        <p className="album-releases-sub">Based on your liked & saved music</p>
        {loadingReleases && releases.length === 0 ? (
          <p className="empty-state">Finding releases…</p>
        ) : releases.length === 0 ? (
          <p className="empty-state">Like some songs to get personalized releases.</p>
        ) : (
          <div className="artist-albums-row">
            {releases.map((rel) => (
              <button
                key={rel.id}
                type="button"
                className="artist-album-card"
                onClick={() => onOpenRelease(rel)}
              >
                <img src={rel.thumbnail} alt="" className="artist-album-art" />
                <span className="artist-album-name">{rel.name}</span>
                {rel.meta && <span className="artist-album-meta">{rel.meta}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
