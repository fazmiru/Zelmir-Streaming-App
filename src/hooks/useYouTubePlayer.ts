import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import type { RepeatMode, Track } from '../types'
import { getOfflineAudioBlob } from '../utils/offline'

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

type PlaybackSource = 'youtube' | 'offline'

export function useYouTubePlayer(containerRef: RefObject<HTMLDivElement>) {
  const playerRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const sourceRef = useRef<PlaybackSource>('youtube')

  const [ready, setReady] = useState(false)
  const [queue, setQueue] = useState<Track[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolumeState] = useState(80)
  const [shuffle, setShuffle] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')

  // Refs so event handlers always see current values.
  const queueRef = useRef(queue)
  const queueIndexRef = useRef(queueIndex)
  const shuffleRef = useRef(shuffle)
  const repeatModeRef = useRef(repeatMode)
  const historyRef = useRef<number[]>([])
  const requestedVideoIdRef = useRef<string | null>(null)
  const volumeRef = useRef(volume)
  const isPlayingRef = useRef(isPlaying)

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
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const current = queue[queueIndex] ?? null

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const stopOfflineAudio = useCallback(() => {
    const a = audioRef.current
    if (a) {
      a.pause()
      a.removeAttribute('src')
      a.load()
    }
    revokeObjectUrl()
  }, [])

  const stopYouTube = useCallback(() => {
    try {
      playerRef.current?.pauseVideo?.()
      playerRef.current?.stopVideo?.()
    } catch {
      // ignore
    }
  }, [])

  const handleTrackEnded = useCallback(() => {
    if (repeatModeRef.current === 'one') {
      if (sourceRef.current === 'offline' && audioRef.current) {
        audioRef.current.currentTime = 0
        void audioRef.current.play()
        return
      }
      playerRef.current?.seekTo?.(0, true)
      playerRef.current?.playVideo?.()
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
      // loadAndPlay is triggered by the effect / next() path via requestedVideoIdRef reset
      requestedVideoIdRef.current = null
    } else {
      setIsPlaying(false)
    }
  }, [])

  // Hidden <audio> for offline blob playback
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      if (sourceRef.current === 'offline') setIsPlaying(false)
    }
    const onEnded = () => {
      if (sourceRef.current === 'offline') handleTrackEnded()
    }
    const onTime = () => {
      if (sourceRef.current !== 'offline') return
      setCurrentTime(audio.currentTime)
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onMeta = () => {
      if (sourceRef.current !== 'offline') return
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.pause()
      revokeObjectUrl()
      audioRef.current = null
    }
  }, [handleTrackEnded])

  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return

      const target = document.createElement('div')
      containerRef.current.appendChild(target)

      playerRef.current = new window.YT.Player(target, {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1 },
        events: {
          onReady: (e: any) => {
            e.target.setVolume(volumeRef.current)
            setReady(true)
          },
          onStateChange: (e: any) => {
            if (sourceRef.current !== 'youtube') return
            const YT = window.YT
            if (e.data === YT.PlayerState.PLAYING) setIsPlaying(true)
            if (e.data === YT.PlayerState.PAUSED) setIsPlaying(false)
            if (e.data === YT.PlayerState.ENDED) {
              handleTrackEnded()
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

  const playOfflineBlob = useCallback(async (videoId: string, blob: Blob) => {
    stopYouTube()
    sourceRef.current = 'offline'
    const audio = audioRef.current
    if (!audio) return false

    revokeObjectUrl()
    const url = URL.createObjectURL(blob)
    objectUrlRef.current = url
    audio.src = url
    audio.volume = volumeRef.current / 100
    try {
      await audio.play()
      setIsPlaying(true)
      requestedVideoIdRef.current = videoId
      return true
    } catch (err) {
      console.error('Offline audio play failed:', err)
      return false
    }
  }, [stopYouTube])

  const playYouTube = useCallback(
    (videoId: string) => {
      stopOfflineAudio()
      sourceRef.current = 'youtube'
      const p = playerRef.current
      if (!p?.loadVideoById) return
      requestedVideoIdRef.current = videoId
      p.loadVideoById(videoId)
      p.playVideo()
    },
    [stopOfflineAudio]
  )

  /**
   * Prefer cached offline audio; fall back to YouTube when online.
   * Returns true if something started playing.
   */
  const loadAndPlay = useCallback(
    async (videoId: string) => {
      const blob = await getOfflineAudioBlob(videoId)
      if (blob) {
        const ok = await playOfflineBlob(videoId, blob)
        if (ok) return true
      }

      // No offline audio (or play failed) — need network + YouTube player
      if (!navigator.onLine) {
        console.warn('Track has no offline audio and device is offline:', videoId)
        setIsPlaying(false)
        return false
      }

      if (!ready || !playerRef.current?.loadVideoById) {
        // Player not ready yet; effect below will retry once ready
        requestedVideoIdRef.current = null
        return false
      }
      playYouTube(videoId)
      return true
    },
    [ready, playOfflineBlob, playYouTube]
  )

  // Fallback when track changes without a direct gesture (or after YT becomes ready)
  useEffect(() => {
    if (!current) return
    if (requestedVideoIdRef.current === current.videoId) return
    void loadAndPlay(current.videoId)
  }, [ready, current?.videoId, loadAndPlay])

  // Poll YouTube progress while playing from YT
  useEffect(() => {
    if (!isPlaying || sourceRef.current !== 'youtube') return
    const id = setInterval(() => {
      if (sourceRef.current !== 'youtube') return
      const p = playerRef.current
      if (p?.getCurrentTime) {
        setCurrentTime(p.getCurrentTime())
        setDuration(p.getDuration() || 0)
      }
    }, 500)
    return () => clearInterval(id)
  }, [isPlaying])

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
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
      // Reset so loadAndPlay always runs for this gesture
      requestedVideoIdRef.current = null
      void loadAndPlay(track.videoId)
    },
    [loadAndPlay]
  )

  const playNext = useCallback((track: Track) => {
    setQueue((q) => {
      if (q.length === 0) {
        setQueueIndex(0)
        return [track]
      }
      const without = q.filter((t) => t.videoId !== track.videoId)
      const currentId = q[queueIndexRef.current]?.videoId
      const currentPos = currentId ? without.findIndex((t) => t.videoId === currentId) : -1
      const insertAt = currentPos === -1 ? without.length : currentPos + 1
      const next = [...without.slice(0, insertAt), track, ...without.slice(insertAt)]
      if (currentId) {
        const newIdx = next.findIndex((t) => t.videoId === currentId)
        if (newIdx !== -1) setQueueIndex(newIdx)
      }
      return next
    })
  }, [])

  const addToQueue = useCallback((track: Track) => {
    setQueue((q) => {
      if (q.some((t) => t.videoId === track.videoId)) return q
      return [...q, track]
    })
  }, [])

  const togglePlay = useCallback(() => {
    if (sourceRef.current === 'offline') {
      const a = audioRef.current
      if (!a) return
      if (isPlayingRef.current) a.pause()
      else void a.play()
      return
    }
    const p = playerRef.current
    if (!p) return
    if (isPlayingRef.current) p.pauseVideo()
    else p.playVideo()
  }, [])

  const next = useCallback(() => {
    const nextIndex = computeNextIndex(
      queueIndexRef.current,
      queueRef.current.length,
      shuffleRef.current,
      repeatModeRef.current
    )
    if (nextIndex !== null) {
      historyRef.current.push(queueIndexRef.current)
      setQueueIndex(nextIndex)
      const nextTrack = queueRef.current[nextIndex]
      if (nextTrack) {
        requestedVideoIdRef.current = null
        void loadAndPlay(nextTrack.videoId)
      }
    }
  }, [loadAndPlay])

  const prev = useCallback(() => {
    if (shuffleRef.current && historyRef.current.length > 0) {
      const last = historyRef.current.pop()!
      setQueueIndex(last)
      const track = queueRef.current[last]
      if (track) {
        requestedVideoIdRef.current = null
        void loadAndPlay(track.videoId)
      }
      return
    }
    const targetIndex = Math.max(queueIndexRef.current - 1, 0)
    setQueueIndex(targetIndex)
    const track = queueRef.current[targetIndex]
    if (track) {
      requestedVideoIdRef.current = null
      void loadAndPlay(track.videoId)
    }
  }, [loadAndPlay])

  const seekTo = useCallback((seconds: number) => {
    if (sourceRef.current === 'offline' && audioRef.current) {
      audioRef.current.currentTime = seconds
      setCurrentTime(seconds)
      return
    }
    playerRef.current?.seekTo(seconds, true)
    setCurrentTime(seconds)
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    if (audioRef.current) audioRef.current.volume = v / 100
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
    playNext,
    addToQueue,
    togglePlay,
    next,
    prev,
    seekTo,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  }
}
