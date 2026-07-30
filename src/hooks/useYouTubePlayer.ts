import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import type { RepeatMode, Track } from '../types'

// Minimal shape of the bits of the YouTube IFrame API we use.
declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: () => void
  }
}

let apiPromise: Promise<void> | null = null

function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(tag)
    window.onYouTubeIframeAPIReady = () => resolve()
  })
  return apiPromise
}

/** Picks the next queue index given shuffle/repeat state. Returns null when playback should stop. */
function computeNextIndex(
  currentIndex: number,
  queueLength: number,
  shuffle: boolean,
  repeatMode: RepeatMode
): number | null {
  if (queueLength <= 1) return repeatMode === 'all' ? currentIndex : null

  if (shuffle) {
    const candidates = Array.from({ length: queueLength }, (_, i) => i).filter((i) => i !== currentIndex)
    if (candidates.length === 0) return repeatMode === 'all' ? currentIndex : null
    return candidates[Math.floor(Math.random() * candidates.length)]
  }

  if (currentIndex + 1 < queueLength) return currentIndex + 1
  return repeatMode === 'all' ? 0 : null
}

export function useYouTubePlayer(containerRef: RefObject<HTMLDivElement>) {
  const playerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [queue, setQueue] = useState<Track[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolumeState] = useState(80)
  const [shuffle, setShuffle] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')

  // Refs so the YouTube event handlers (bound once, on mount) always see current values.
  const queueRef = useRef(queue)
  const queueIndexRef = useRef(queueIndex)
  const shuffleRef = useRef(shuffle)
  const repeatModeRef = useRef(repeatMode)
  const historyRef = useRef<number[]>([])
  // Tracks whichever videoId we've already told the player to load, so the fallback
  // effect below doesn't re-issue a redundant loadVideoById for the same track.
  const requestedVideoIdRef = useRef<string | null>(null)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    queueIndexRef.current = queueIndex
  }, [queueIndex])
  useEffect(() => {
    shuffleRef.current = shuffle
  }, [shuffle])
  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  const current = queue[queueIndex] ?? null

useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return

      // Create a plain DOM node for the YouTube API to take over and replace with its <iframe>.
      const target = document.createElement('div')
      containerRef.current.appendChild(target)

      playerRef.current = new window.YT.Player(target, {
        // FIX: Height/width set to '1' so browsers permit autoplay/audio playback
        height: '1',
        width: '1',
        playerVars: { playsinline: 1 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volume)
            setReady(true)
          },
          onStateChange: (e: any) => {
            const YT = window.YT
            if (e.data === YT.PlayerState.PLAYING) setIsPlaying(true)
            if (e.data === YT.PlayerState.PAUSED) setIsPlaying(false)
            if (e.data === YT.PlayerState.ENDED) {
              if (repeatModeRef.current === 'one') {
                playerRef.current?.seekTo(0, true)
                playerRef.current?.playVideo()
                return
              }
              const next = computeNextIndex(
                queueIndexRef.current,
                queueRef.current.length,
                shuffleRef.current,
                repeatModeRef.current
              )
              if (next !== null) {
                historyRef.current.push(queueIndexRef.current)
                setQueueIndex(next)
              }
            }
          },
        },
      })
    })

    return () => {
      cancelled = true
      if (playerRef.current?.destroy) {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mobile browsers only allow the YouTube iframe (via postMessage) to start playback when
  // the play command happens synchronously inside a user gesture's call stack. Calling
  // loadVideoById/playVideo from a useEffect after a state update loses that "user activation"
  // on iOS Safari / mobile Chrome (desktop is more lenient, which is why "request desktop site"
  // used to work around it). So callers that run directly from a click/tap (playTrack, next,
  // prev) call this synchronously instead of relying solely on the effect below.
  const loadAndPlay = useCallback((videoId: string) => {
    const p = playerRef.current
    if (!ready || !p?.loadVideoById) return
    requestedVideoIdRef.current = videoId
    p.loadVideoById(videoId)
    p.playVideo()
  }, [ready])

  // Fallback: covers cases where the track changes without going through a direct gesture
  // (e.g. the player only just finished initializing). Skips if we already handled it above.
  useEffect(() => {
    if (!ready || !current || !playerRef.current?.loadVideoById) return
    if (requestedVideoIdRef.current === current.videoId) return
    requestedVideoIdRef.current = current.videoId
    playerRef.current.loadVideoById(current.videoId)
    playerRef.current.playVideo()
  }, [ready, current?.videoId])

  // Poll progress while playing.
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      const p = playerRef.current
      if (p?.getCurrentTime) {
        setCurrentTime(p.getCurrentTime())
        setDuration(p.getDuration() || 0)
      }
    }, 500)
    return () => clearInterval(id)
  }, [isPlaying])

  const playTrack = useCallback((track: Track, newQueue?: Track[]) => {
    historyRef.current = []
    if (newQueue) {
      setQueue(newQueue)
      setQueueIndex(newQueue.findIndex((t) => t.videoId === track.videoId))
    } else {
      setQueue((q) => {
        const existing = q.findIndex((t) => t.videoId === track.videoId)
        if (existing !== -1) {
          setQueueIndex(existing)
          return q
        }
        setQueueIndex(q.length)
        return [...q, track]
      })
    }
    // Whichever branch above ran, `track` is always what should start playing —
    // fire it off now, synchronously, while we're still inside the click/tap handler.
    loadAndPlay(track.videoId)
  }, [loadAndPlay])

  const togglePlay = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (isPlaying) p.pauseVideo()
    else p.playVideo()
  }, [isPlaying])

  const next = useCallback(() => {
    const nextIndex = computeNextIndex(queueIndexRef.current, queueRef.current.length, shuffleRef.current, repeatModeRef.current)
    if (nextIndex !== null) {
      historyRef.current.push(queueIndexRef.current)
      setQueueIndex(nextIndex)
      const nextTrack = queueRef.current[nextIndex]
      if (nextTrack) loadAndPlay(nextTrack.videoId)
    }
  }, [loadAndPlay])

  const prev = useCallback(() => {
    if (shuffleRef.current && historyRef.current.length > 0) {
      const last = historyRef.current.pop()!
      setQueueIndex(last)
      const track = queueRef.current[last]
      if (track) loadAndPlay(track.videoId)
      return
    }
    const targetIndex = Math.max(queueIndexRef.current - 1, 0)
    setQueueIndex(targetIndex)
    const track = queueRef.current[targetIndex]
    if (track) loadAndPlay(track.videoId)
  }, [loadAndPlay])

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true)
    setCurrentTime(seconds)
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    playerRef.current?.setVolume(v)
  }, [])

  const toggleShuffle = useCallback(() => {
    historyRef.current = []
    setShuffle((s) => !s)
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'))
  }, [])

  return {
    current,
    queue,
    queueIndex,
    isPlaying,
    duration,
    currentTime,
    volume,
    shuffle,
    repeatMode,
    playTrack,
    togglePlay,
    next,
    prev,
    seekTo,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  }
}
