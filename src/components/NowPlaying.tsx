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

function rgbToHex(r: number, g: number, b: number) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Pull a few vibrant colors from an image for the cycling play / seek accents. */
function extractAlbumColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const fallback = ['#f0a030', '#e07020', '#c04010', '#f5c060']
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 48
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(fallback)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        // Bucket by coarse RGB for dominant colors
        const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 128) continue
          // Skip near-black / near-white
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          if (max < 40 || min > 230) continue
          const sat = max === 0 ? 0 : (max - min) / max
          if (sat < 0.12) continue
          const key = `${r >> 4},${g >> 4},${b >> 4}`
          const prev = buckets.get(key)
          const score = sat * 1.4 + (max / 255) * 0.6
          if (prev) {
            prev.r += r
            prev.g += g
            prev.b += b
            prev.n += 1
            prev.score += score
          } else {
            buckets.set(key, { r, g, b, n: 1, score })
          }
        }

        const ranked = [...buckets.values()]
          .map((v) => ({
            r: v.r / v.n,
            g: v.g / v.n,
            b: v.b / v.n,
            weight: v.score,
          }))
          .sort((a, b) => b.weight - a.weight)

        const picked: string[] = []
        for (const c of ranked) {
          const hex = rgbToHex(c.r, c.g, c.b)
          // Prefer distinct hues
          const tooClose = picked.some((p) => {
            const pr = parseInt(p.slice(1, 3), 16)
            const pg = parseInt(p.slice(3, 5), 16)
            const pb = parseInt(p.slice(5, 7), 16)
            const dr = pr - c.r
            const dg = pg - c.g
            const db = pb - c.b
            return dr * dr + dg * dg + db * db < 70 * 70
          })
          if (tooClose) continue
          picked.push(hex)
          if (picked.length >= 4) break
        }

        if (picked.length === 0) {
          resolve(fallback)
          return
        }
        while (picked.length < 4) {
          picked.push(picked[picked.length - 1])
        }
        resolve(picked)
      } catch {
        resolve(fallback)
      }
    }
    img.onerror = () => resolve(fallback)
    img.src = imageUrl
  })
}

export function NowPlaying({
  track,
  queue,
  queueIndex,
  isPlaying,
  currentTime,
  duration,
  apiKey,
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
      : track.thumbnail

  const [lyrics, setLyrics] = useState<string | null>(null)
  const [lyricsNotFound, setLyricsNotFound] = useState(false)
  const [loadingLyrics, setLoadingLyrics] = useState(false)
  const lyricsFetchedFor = useRef<string | null>(null)

  const [albumColors, setAlbumColors] = useState<string[]>(['#f0a030', '#e07020', '#c04010', '#f5c060'])

  const upNext = queue.slice(queueIndex + 1)
  const seekProgress = duration > 0 ? (currentTime / duration) * 100 : 0

  useEffect(() => {
    setCoverStage(0)
  }, [track.videoId])

  // Extract palette whenever cover URL is ready
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
    fetchLyrics(track.artist, track.title)
      .then((result) => {
        if (result.lyrics) setLyrics(result.lyrics)
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
    const q = `${track.artist || "Unknown"} ${track.title.split(/[-(|]/)[0].trim()}`.trim()
    searchPipedTracksSimple(q)
      .then((tracks) => {
        setRecommended(tracks.filter((t) => t.videoId !== track.videoId).slice(0, 20))
      })
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false))
  }, [tab, track.videoId, track.artist, track.title, apiKey])

  const npStyle = {
    '--np-a': albumColors[0],
    '--np-b': albumColors[1],
    '--np-c': albumColors[2],
    '--np-d': albumColors[3],
  } as CSSProperties

  return (
    <div className="now-playing-overlay" style={npStyle}>
      <div className="now-playing-backdrop" aria-hidden>
        <img
          className="now-playing-backdrop-img"
          src={coverSrc}
          alt=""
          onError={() => setCoverStage((s) => s + 1)}
        />
        <div className="now-playing-backdrop-shade" />
        <div className="now-playing-backdrop-vignette" />
      </div>

      <div className="now-playing-body">
        <div className="now-playing-left">
          <div className="now-playing-cover-wrap">
            <button type="button" className="now-playing-close" onClick={onClose} aria-label="Close">
              <CloseIcon size={18} />
            </button>
            <img
              className="now-playing-cover"
              src={coverSrc}
              alt=""
              onError={() => setCoverStage((s) => s + 1)}
            />
          </div>
          <h2 className="now-playing-title">{track.title || "Unknown"}</h2>
          <button
            type="button"
            className="now-playing-artist now-playing-artist-link"
            onClick={() => onOpenArtist(track.artist)}
          >
            {track.artist}
          </button>

          <div className="now-playing-transport">
            <button
              type="button"
              className={`transport-button transport-button-toggle ${shuffle ? 'transport-button-on' : ''}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              title="Shuffle"
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
              title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
            >
              <RepeatIcon size={19} />
              {repeatMode === 'one' && <span className="repeat-one-dot now-playing-dot" />}
            </button>
          </div>

          {/* Seek / duration bar */}
          <div className="now-playing-seek">
            <span className="now-playing-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="now-playing-seek-bar"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => onSeek(Number(e.target.value))}
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
                  <img src={track.thumbnail} alt="" className="now-playing-row-thumb" />
                  <div className="now-playing-row-meta">
                    <span className="now-playing-row-title">{track.title}</span>
                    <span className="now-playing-row-artist">{track.artist}</span>
                  </div>
                </div>

                {upNext.length === 0 ? (
                  <p className="now-playing-empty">
                    Nothing queued after this — add more songs from Search or a playlist.
                  </p>
                ) : (
                  upNext.map((t) => (
                    <div
                      key={t.videoId}
                      className="now-playing-row"
                      onClick={() => onPlayFromQueue(t, queue)}
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
                    <a
                      className="now-playing-lyrics-link"
                      href={`https://genius.com/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Search for it on Genius →
                    </a>
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
