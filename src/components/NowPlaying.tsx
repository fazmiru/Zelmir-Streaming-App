import { useEffect, useRef, useState } from 'react'
import type { RepeatMode, Track, YouTubeSearchItem } from '../types'
import { PlayIcon, PauseIcon, NextIcon, PrevIcon, CloseIcon, ShuffleIcon, RepeatIcon } from './Icons'
import { searchPipedTracksSimple } from '../utils/piped'
import { fetchLyrics } from '../utils/lyrics'

// YouTube always has hqdefault; maxres/sd only exist for some videos, so we
// cascade down instead of stretching the small "medium" thumbnail we use elsewhere.
const COVER_FALLBACKS = ['maxresdefault', 'sddefault', 'hqdefault'] as const

type Tab = 'upnext' | 'lyrics' | 'recommended'

interface NowPlayingProps {
  track: Track
  queue: Track[]
  queueIndex: number
  isPlaying: boolean
  apiKey: string | undefined
  shuffle: boolean
  repeatMode: RepeatMode
  onClose: () => void
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onToggleShuffle: () => void
  onCycleRepeat: () => void
  onPlayFromQueue: (track: Track, source: Track[]) => void
  onOpenArtist: (artist: string) => void
}

function toTrack(item: YouTubeSearchItem): Track {
  return {
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium.url,
  }
}

export function NowPlaying({
  track,
  queue,
  queueIndex,
  isPlaying,
  apiKey,
  shuffle,
  repeatMode,
  onClose,
  onToggle,
  onNext,
  onPrev,
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

  const upNext = queue.slice(queueIndex + 1)

  // Reset the cover fallback cascade whenever the track changes.
  useEffect(() => {
    setCoverStage(0)
  }, [track.videoId])

  useEffect(() => {
    if (tab !== 'lyrics') return
    if (lyricsFetchedFor.current === track.videoId) return
    lyricsFetchedFor.current = track.videoId
    setLoadingLyrics(true)
    setLyrics(null)
    setLyricsNotFound(false)

    fetchLyrics(track.artist, track.title)
      .then((result) => {
        setLyrics(result.lyrics)
        setLyricsNotFound(!!result.notFound)
      })
      .finally(() => setLoadingLyrics(false))
  }, [tab, track.videoId, track.artist, track.title])

  useEffect(() => {
    if (tab !== 'recommended') return
    if (fetchedFor.current === track.videoId) return
    fetchedFor.current = track.videoId
    setLoadingRecommended(true)

    searchPipedTracksSimple(track.artist)
      .then(async (tracks) => {
        const filtered = tracks.filter((t) => t.videoId !== track.videoId)
        if (filtered.length > 0 || !apiKey) return filtered
        // Piped returned nothing (likely every instance was down) — fall back to Google.
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
            track.artist
          )}&type=video&maxResults=14&key=${apiKey}`
        )
        const data = await response.json()
        return (data.items || []).map(toTrack).filter((t: Track) => t.videoId !== track.videoId)
      })
      .then((items) => setRecommended(items))
      .catch(() => setRecommended([]))
      .finally(() => setLoadingRecommended(false))
  }, [tab, track.videoId, track.artist, apiKey])

  return (
    <div className="now-playing-overlay">
      <button className="now-playing-close" onClick={onClose} aria-label="Close now playing">
        <CloseIcon />
      </button>

      <div className="now-playing-body">
        <div className="now-playing-left">
          <img
            src={coverSrc}
            alt={track.title}
            className="now-playing-cover"
            onError={() => setCoverStage((s) => s + 1)}
          />
          <h1 className="now-playing-title">{track.title}</h1>
          <button className="now-playing-artist now-playing-artist-link" onClick={() => onOpenArtist(track.artist)}>
            {track.artist}
          </button>

          <div className="now-playing-transport">
            <button
              className={`transport-button transport-button-toggle ${shuffle ? 'transport-button-on' : ''}`}
              onClick={onToggleShuffle}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              title="Shuffle"
            >
              <ShuffleIcon size={19} />
            </button>
            <button className="transport-button" onClick={onPrev} aria-label="Previous">
              <PrevIcon size={22} />
            </button>
            <button
              className="transport-button transport-button-main accent-fill now-playing-play"
              onClick={onToggle}
              aria-label="Play or pause"
            >
              {isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>
            <button className="transport-button" onClick={onNext} aria-label="Next">
              <NextIcon size={22} />
            </button>
            <button
              className={`transport-button transport-button-toggle ${repeatMode !== 'off' ? 'transport-button-on' : ''}`}
              onClick={onCycleRepeat}
              aria-label="Repeat"
              title={repeatMode === 'off' ? 'Repeat off' : repeatMode === 'all' ? 'Repeat all' : 'Repeat one'}
            >
              <RepeatIcon size={19} />
              {repeatMode === 'one' && <span className="repeat-one-dot accent-fill" />}
            </button>
          </div>
        </div>

        <div className="now-playing-right">
          <div className="now-playing-tabs">
            <button
              className={`now-playing-tab ${tab === 'upnext' ? 'now-playing-tab-active' : ''}`}
              onClick={() => setTab('upnext')}
            >
              Up next
            </button>
            <button
              className={`now-playing-tab ${tab === 'lyrics' ? 'now-playing-tab-active' : ''}`}
              onClick={() => setTab('lyrics')}
            >
              Lyrics
            </button>
            <button
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
                    <span className="now-playing-row-title accent-text">{track.title}</span>
                    <span className="now-playing-row-artist">{track.artist}</span>
                  </div>
                </div>

                {upNext.length === 0 ? (
                  <p className="now-playing-empty">Nothing queued after this — add more songs from Search or a playlist.</p>
                ) : (
                  upNext.map((t) => (
                    <div key={t.videoId} className="now-playing-row" onClick={() => onPlayFromQueue(t, queue)}>
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
                      className="now-playing-lyrics-link accent-text"
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
                    <div key={t.videoId} className="now-playing-row" onClick={() => onPlayFromQueue(t, recommended)}>
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
