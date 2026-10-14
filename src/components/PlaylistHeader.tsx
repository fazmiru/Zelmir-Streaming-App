import { useState } from 'react'
import type { Track } from '../types'

interface PlaylistHeaderProps {
  name: string
  tracks: Track[]
}

const COVER_QUALITIES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'] as const

/** One cover tile that tries max quality first, then steps down on error. */
function CoverImage({ videoId, fallback }: { videoId: string; fallback: string }) {
  const [stage, setStage] = useState(0)

  const src =
    stage < COVER_QUALITIES.length
      ? `https://i.ytimg.com/vi/${videoId}/${COVER_QUALITIES[stage]}.jpg`
      : fallback

  return (
    <img
      src={src}
      alt=""
      onError={() => setStage((s) => s + 1)}
    />
  )
}

export function PlaylistHeader({ name, tracks }: PlaylistHeaderProps) {
  // 1–3 songs → single cover (first track only)
  // 4+ songs  → up to 4 distinct covers in a mosaic
  const useMosaic = tracks.length >= 4
  const coverTracks = useMosaic
    ? tracks.slice(0, 4)
    : tracks.length > 0
      ? [tracks[0]]
      : []

  // Backdrop always wants 4 cells for the blur grid
  const backdropTracks =
    coverTracks.length === 0
      ? []
      : useMosaic
        ? coverTracks
        : [coverTracks[0], coverTracks[0], coverTracks[0], coverTracks[0]]

  return (
    <div className="playlist-header">
      {backdropTracks.length > 0 && (
        <div className="playlist-header-backdrop" aria-hidden="true">
          {backdropTracks.map((t, i) => (
            <CoverImage key={`${t.videoId}-${i}`} videoId={t.videoId} fallback={t.thumbnail} />
          ))}
          <div className="playlist-header-fade" />
        </div>
      )}

      <div className="playlist-header-content">
        <div className={`playlist-cover-mosaic ${useMosaic ? '' : 'playlist-cover-single'}`}>
          {coverTracks.length > 0 ? (
            coverTracks.map((t, i) => (
              <CoverImage key={`${t.videoId}-cover-${i}`} videoId={t.videoId} fallback={t.thumbnail} />
            ))
          ) : (
            <div className="playlist-cover-mosaic-empty" />
          )}
        </div>

        <div className="playlist-header-meta">
          <span className="playlist-header-label">Playlist</span>
          <h1 className="playlist-header-name">{name}</h1>
          <p className="playlist-header-count">
            {tracks.length} song{tracks.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </div>
  )
}