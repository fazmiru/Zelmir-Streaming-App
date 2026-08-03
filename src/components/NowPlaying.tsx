import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { RepeatMode, Track } from '../types'
import { PlayIcon, PauseIcon, NextIcon, PrevIcon, CloseIcon, ShuffleIcon, RepeatIcon } from './Icons'
import { searchPipedTracksSimple } from '../utils/piped'
import { fetchLyrics } from '../utils/lyrics'

const COVER_FALLBACKS = ['maxresdefault', 'sddefault', 'hqdefault'] as const

type Tab = 'upnext' | 'lyrics' | 'recommended'

interface NowPlayingProps {
  track: Track
  queue: Track[]
  queueIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  apiKey: string | undefined
  shuffle: boolean
  repeatMode: RepeatMode
  onClose: () => void
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onSeek: (seconds: number) => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onPlayFromQueue: (track: Track, source: Track[]) => void
  onOpenArtist: (artist: string) => void
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function extractAlbumColors(imageUrl: string): Promise<string[]> {
  const fallback = ['#c45c26', '#e8a04a', '#8b3a1a', '#f0c070']
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      const done = (colors: string[]) => resolve(colors)
      img.onload = () => {
        try {
          const size = 32
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) return done(fallback)
          ctx.drawImage(img, 0, 0, size, size)
          const { data } = ctx.getImageData(0, 0, size, size)
          let r = 0, g = 0, b = 0, n = 0
          for (let i = 0; i < data.length; i += 16) {
            const rr = data[i], gg = data[i + 1], bb = data[i + 2]
            if (rr + gg + bb < 40 || rr + gg + bb > 720) continue
            r += rr; g += gg; b += bb; n++
          }
          if (!n) return done(fallback)
          r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
          const hex = (x: number) => x.toString(16).padStart(2, '0')
          const base = `#${hex(r)}${hex(g)}${hex(b)}`
          const light = `#${hex(Math.min(255, r + 40))}${hex(Math.min(255, g + 30))}${hex(Math.min(255, b + 20))}`
          const dark = `#${hex(Math.max(0, r - 30))}${hex(Math.max(0, g - 25))}${hex(Math.max(0, b - 20))}`
          done([base, light, dark, light])
        } catch {
          done(fallback)
        }
      }
      img.onerror = () => done(fallback)
      img.src = imageUrl
    } catch {
      resolve(fallback)
    }
  })
}

export function NowPlaying({
  track,
  queue,
  queueIndex,
  isPlaying,
  currentTime = 0,
  duration = 0,
  shuffle,
  repeatMode,
  onClose,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onToggleShuffle,
  onCycleRepeat,
  onPlayFromQueue,
  onOpenArtist,
}: NowPlayingProps) {
  const [tab, setTab] = useState<Tab>('upnext')
  const [recommended, setRecommended] = useState<Track[]>([])
  const [loadingRecommended, setLoadingRecommended] = useState(false)
  const fetchedFor = useRef<string | null>(null)

  const [coverStage, setCoverStage] = useState(0)
  const coverSrc =
    coverStage < COVER_FALLBACKS.length
      ? `https://i.ytimg.com/vi/${track.videoId}/${COVER_FALLBACKS[coverStage]}.jpg`
      : track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`

  const [lyrics, setLyrics] = useState<string | null>(null)
  const [lyricsNotFound, setLyricsNotFound] = useState(false)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const lyricsFetchedFor = useRef<string | null>(null)

  const [albumColors, setAlbumColors] = useState<string[]>(['#c45c26', '#e8a04a', '#8b3a1a', '#f0c070'])

  const safeQueue = Array.isArray(queue) ? queue : []
  const upNext = safeQueue.slice(Math.max(0, queueIndex) + 1)
  const seekProgress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  useEffect(() => {
    setCoverStage(0)
  }, [track.videoId])

  useEffect(() => {
    let cancelled = false
    extractAlbumColors(coverSrc).then((colors) => {
      if (!cancelled) setAlbumColors(colors)
    })
    return () => {
      cancelled = true
    }
  }, [coverSrc])

  useEffect(() => {
    if (tab !== 'lyrics') return
    if (lyricsFetchedFor.current === track.videoId) return
    lyricsFetchedFor.current = track.videoId
    setLoadingLyrics(true)
    setLyrics(null)
    setLyricsNotFound(false)
    fetchLyrics(track.artist || '', track.title || '')
      .then((result) => {
        if (result?.lyrics) setLyrics(result.lyrics)
        else setLyricsNotFound(true)
      })
      .catch(() => setLyricsNotFound(true))
      .finally(() => setLoadingLyrics(false))
  }, [tab, track.videoId, track.artist, track.title])

  useEffect(() => {
    if (tab !== 'recommended') return
    if (fetchedFor.current === track.videoId) return
    fetchedFor.current = track.videoId
    setLoadingRecommended(true)
    setRecommended([])
    const q = `${track.artist || ''} ${(track.title || '').split(/[-(|]/)[0].trim()}`.trim()
    searchPipedTracksSimple(q)
      .then((tracks) => {
        setRecommended((tracks || []).filter((t) => t.videoId !== track.videoId).slice(0, 20))
      })
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false))
  }, [tab, track.videoId, track.artist, track.title])

  const npStyle = {
    '--np-a': albumColors[0],
    '--np-b': albumColors[1],
    '--np-c': albumColors[2],
    '--np-d': albumColors[3],
  } as CSSProperties

  return (
    <div className="now-playing-overlay" style={npStyle}>
      <div className="now-playing-backdrop" aria-hidden="true">
        <img
          className="now-playing-backdrop-img"
          src={coverSrc}
          alt=""
          onError={() => setCoverStage((s) => s + 1)}
        />
        <div className="now-playing-backdrop-shade" />
      </div>

      <button type="button" className="now-playing-close" onClick={onClose} aria-label="Close">
        <CloseIcon size={20} />
      </button>

      <div className="now-playing-body">
        <div className="now-playing-left">
          <img
            className="now-playing-cover"
            src={coverSrc}
            alt=""
            onError={() => setCoverStage((s) => s + 1)}
          />
          <h2 className="now-playing-title">{track.title || 'Unknown'}</h2>
          <button
            type="button"
            className="now-playing-artist now-playing-artist-link"
            onClick={() => onOpenArtist(track.artist || '')}
          >
            {track.artist || 'Unknown'}
          </button>

          <div className="now-playing-transport">
            <button
              type="button"
              className={`transport-button transport-button-toggle ${shuffle ? 'transport-button-on' : ''}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
            >
              <ShuffleIcon size={19} />
            </button>
            <button type="button" className="transport-button" onClick={onPrev} aria-label="Previous">
              <PrevIcon size={22} />
            </button>
            <button
              type="button"
              className="transport-button transport-button-main now-playing-play"
              onClick={onToggle}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>
            <button type="button" className="transport-button" onClick={onNext} aria-label="Next">
              <NextIcon size={22} />
            </button>
            <button
              type="button"
              className={`transport-button transport-button-toggle ${repeatMode !== 'off' ? 'transport-button-on' : ''}`}
              onClick={onCycleRepeat}
              aria-label="Repeat"
            >
              <RepeatIcon size={19} />
              {repeatMode === 'one' && <span className="repeat-one-dot now-playing-dot" />}
            </button>
          </div>

          <div className="now-playing-seek">
            <span className="now-playing-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="now-playing-seek-bar"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              value={Number.isFinite(currentTime) ? currentTime : 0}
              onChange={(e) => onSeek?.(Number(e.target.value))}
              style={{ '--progress': `${seekProgress}%` } as CSSProperties}
              aria-label="Seek"
            />
            <span className="now-playing-time">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="now-playing-right">
          <div className="now-playing-tabs">
            <button
              type="button"
              className={`now-playing-tab ${tab === 'upnext' ? 'now-playing-tab-active' : ''}`}
              onClick={() => setTab('upnext')}
            >
              Up next
            </button>
            <button
              type="button"
              className={`now-playing-tab ${tab === 'lyrics' ? 'now-playing-tab-active' : ''}`}
              onClick={() => setTab('lyrics')}
            >
              Lyrics
            </button>
            <button
              type="button"
              className={`now-playing-tab ${tab === 'recommended' ? 'now-playing-tab-active' : ''}`}
              onClick={() => setTab('recommended')}
            >
              Recommended
            </button>
          </div>

          <div className="now-playing-panel">
            {tab === 'upnext' && (
              <>
                <div className="now-playing-row now-playing-row-current">
                  <img src={track.thumbnail || coverSrc} alt="" className="now-playing-row-thumb" />
                  <div className="now-playing-row-meta">
                    <span className="now-playing-row-title">{track.title}</span>
                    <span className="now-playing-row-artist">{track.artist}</span>
                  </div>
                </div>
                {upNext.length === 0 ? (
                  <p className="now-playing-empty">Nothing queued after this.</p>
                ) : (
                  upNext.map((t) => (
                    <div
                      key={t.videoId}
                      className="now-playing-row"
                      onClick={() => onPlayFromQueue(t, safeQueue)}
                    >
                      <img src={t.thumbnail} alt="" className="now-playing-row-thumb" />
                      <div className="now-playing-row-meta">
                        <span className="now-playing-row-title">{t.title}</span>
                        <span className="now-playing-row-artist">{t.artist}</span>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {tab === 'lyrics' && (
              <div className="now-playing-lyrics">
                {loadingLyrics && <p className="now-playing-empty">Looking up lyrics…</p>}
                {!loadingLyrics && lyrics && <p className="now-playing-lyrics-text">{lyrics}</p>}
                {!loadingLyrics && !lyrics && (
                  <div className="now-playing-lyrics-placeholder">
                    <p>{lyricsNotFound ? "Couldn't find lyrics for this track." : 'Lyrics unavailable.'}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'recommended' && (
              <>
                {loadingRecommended && <p className="now-playing-empty">Finding similar tracks…</p>}
                {!loadingRecommended &&
                  recommended.map((t) => (
                    <div
                      key={t.videoId}
                      className="now-playing-row"
                      onClick={() => onPlayFromQueue(t, recommended)}
                    >
                      <img src={t.thumbnail} alt="" className="now-playing-row-thumb" />
                      <div className="now-playing-row-meta">
                        <span className="now-playing-row-title">{t.title}</span>
                        <span className="now-playing-row-artist">{t.artist}</span>
                      </div>
                    </div>
                  ))}
                {!loadingRecommended && recommended.length === 0 && (
                  <p className="now-playing-empty">No recommendations found.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
