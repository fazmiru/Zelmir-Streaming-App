import { useEffect, useRef, useState } from 'react'
import type { Track, YouTubeSearchItem } from '../types'
import { PlayIcon, PauseIcon, NextIcon, PrevIcon, CloseIcon } from './Icons'
<<<<<<< HEAD
import { searchPipedTracksSimple } from '../utils/piped'
=======
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e

type Tab = 'upnext' | 'lyrics' | 'recommended'

interface NowPlayingProps {
  track: Track
  queue: Track[]
  queueIndex: number
  isPlaying: boolean
  apiKey: string | undefined
  onClose: () => void
  onToggle: () => void
  onNext: () => void
  onPrev: () => void
  onPlayFromQueue: (track: Track, source: Track[]) => void
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
  onClose,
  onToggle,
  onNext,
  onPrev,
  onPlayFromQueue,
}: NowPlayingProps) {
  const [tab, setTab] = useState<Tab>('upnext')
  const [recommended, setRecommended] = useState<Track[]>([])
  const [loadingRecommended, setLoadingRecommended] = useState(false)
  const fetchedFor = useRef<string | null>(null)

  const upNext = queue.slice(queueIndex + 1)

  useEffect(() => {
    if (tab !== 'recommended') return
<<<<<<< HEAD
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
=======
    if (!apiKey) return
    if (fetchedFor.current === track.videoId) return
    fetchedFor.current = track.videoId
    setLoadingRecommended(true)
    fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        track.artist
      )}&type=video&maxResults=14&key=${apiKey}`
    )
      .then((r) => r.json())
      .then((data) => {
        const items: Track[] = (data.items || []).map(toTrack).filter((t: Track) => t.videoId !== track.videoId)
        setRecommended(items)
      })
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
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
          <img src={track.thumbnail} alt={track.title} className="now-playing-cover" />
          <h1 className="now-playing-title">{track.title}</h1>
          <p className="now-playing-artist">{track.artist}</p>

          <div className="now-playing-transport">
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
              <div className="now-playing-lyrics-placeholder">
                <p>Lyrics aren't wired up yet.</p>
                <p className="now-playing-lyrics-sub">
                  This tab is ready to go — plug it into a licensed lyrics provider (e.g. Musixmatch's API) with your
                  own key to display lyrics here. Unlicensed lyrics scraping isn't something to build this in.
                </p>
              </div>
            )}

            {tab === 'recommended' && (
              <>
<<<<<<< HEAD
                {loadingRecommended && <p className="now-playing-empty">Finding similar tracks…</p>}
                {!loadingRecommended &&
=======
                {!apiKey && <p className="now-playing-empty">Add your YouTube API key to see recommendations.</p>}
                {apiKey && loadingRecommended && <p className="now-playing-empty">Finding similar tracks…</p>}
                {apiKey &&
                  !loadingRecommended &&
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
                  recommended.map((t) => (
                    <div key={t.videoId} className="now-playing-row" onClick={() => onPlayFromQueue(t, recommended)}>
                      <img src={t.thumbnail} alt="" className="now-playing-row-thumb" />
                      <div className="now-playing-row-meta">
                        <span className="now-playing-row-title">{t.title}</span>
                        <span className="now-playing-row-artist">{t.artist}</span>
                      </div>
                    </div>
                  ))}
<<<<<<< HEAD
                {!loadingRecommended && recommended.length === 0 && (
=======
                {apiKey && !loadingRecommended && recommended.length === 0 && (
>>>>>>> 036af055591a251da2f70cbc429bf5958a896c9e
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
