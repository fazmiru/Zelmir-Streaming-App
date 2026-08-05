import React, { useState } from 'react'
import type { Track } from '../types'

interface HomeSongGridProps {
  tracks: Track[]
  onPlay: (track: Track, source?: Track[]) => void
  currentVideoId?: string | null
  columns?: number
  rows?: number
  emptyLabel?: string
}

export function HomeSongGrid({
  tracks,
  onPlay,
  currentVideoId,
  columns = 3,
  rows = 5,
  emptyLabel = 'Nothing here yet.',
}: HomeSongGridProps) {
  const pageSize = columns * rows
  const pageCount = Math.max(1, Math.ceil(Math.max(tracks.length, 1) / pageSize))
  const [page, setPage] = useState(0)
  const safePage = Math.min(page, pageCount - 1)
  const slice = tracks.slice(safePage * pageSize, safePage * pageSize + pageSize)

  if (!tracks.length) {
    return <p className="empty-state">{emptyLabel}</p>
  }

  return (
    <div className="home-song-grid-wrap">
      <div className="home-song-grid-arrows">
        <button
          type="button"
          className="home-arrow-btn"
          disabled={safePage <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          className="home-arrow-btn"
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          aria-label="Next"
        >
          ›
        </button>
      </div>
      <div
        className="home-song-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {slice.map((t, i) => {
          const idx = safePage * pageSize + i
          const active = currentVideoId === t.videoId
          return (
            <button
              key={`${t.videoId}-${idx}`}
              type="button"
              className={`home-song-cell ${active ? 'home-song-cell-active' : ''}`}
              onClick={() => onPlay(t, tracks)}
            >
              <img src={t.thumbnail} alt="" className="home-song-cell-art" />
              <div className="home-song-cell-meta">
                <span className="home-song-cell-title">{t.title}</span>
                <span className="home-song-cell-artist">{t.artist}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
