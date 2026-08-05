import { useEffect, useRef, useState, useCallback, type RefObject } from 'react'
import type { RepeatMode, Track } from '../types'
import { getOfflineAudioBlob } from '../utils/offline'

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

/** True when HTML5 audio can keep playing after the tab/app is backgrounded. */
function prefersHtmlAudio(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  // Always prefer stream audio on mobile / PWA — YouTube iframe dies in background
  return isIOS || isStandalone || /Android/i.test(ua) || window.innerWidth <= 900
}

type PlaybackSource = 'youtube' | 'offline' | 'stream'

async function fetchStreamUrl(videoId: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`/api/piped-streams?v=${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const streams: Array<{ url?: string; mimeType?: string; kind?: string }> = data.streams || []

    // iOS plays mp4/m4a/aac far more reliably than webm
    const rank = (s: { mimeType?: string; kind?: string }) => {
      const m = (s.mimeType || '').toLowerCase()
      let score = 0
      if (s.kind === 'audio') score += 10
      if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) score += 50
      if (m.includes('mp3')) score += 40
      if (m.includes('webm') || m.includes('opus')) score += 5
      return score
    }
    const sorted = [...streams].filter((s) => s.url).sort((a, b) => rank(b) - rank(a))
    const direct = sorted[0]?.url || data.urls?.[0]
    if (!direct || typeof direct !== 'string') return null
    return `/api/media-proxy?url=${encodeURIComponent(direct)}`
  } catch (err) {
    console.warn('stream lookup failed', err)
    return null
  }
}

export function useYouTubePlayer(
  containerRef: RefObject<HTMLDivElement>,
  options?: { onQueueEnded?: () => void }
) {
  const onQueueEndedRef = useRef(options?.onQueueEnded)
  useEffect(() => {
    onQueueEndedRef.current = options?.onQueueEnded
  }, [options?.onQueueEnded])

  const playerRef = useRef<any>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const sourceRef = useRef<PlaybackSource>('youtube')
  const intendedPlayingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [queue, setQueue] = useState<Track[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolumeState] = useState(80)
  const [shuffle, setShuffle] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')

  const queueRef = useRef(queue)
  const queueIndexRef = useRef(queueIndex)
  const isPlayingRef = useRef(isPlaying)
  const shuffleRef = useRef(shuffle)
  const repeatModeRef = useRef(repeatMode)
  const volumeRef = useRef(volume)
  const historyRef = useRef<number[]>([])
  const requestedVideoIdRef = useRef<string | null>(null)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    queueIndexRef.current = queueIndex
  }, [queueIndex])
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  useEffect(() => {
    shuffleRef.current = shuffle
  }, [shuffle])
  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  const current = queue[queueIndex] ?? null

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const stopYouTube = useCallback(() => {
    try {
      playerRef.current?.pauseVideo?.()
      playerRef.current?.stopVideo?.()
    } catch {
      /* ignore */
    }
  }, [])

  const stopHtmlAudio = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    try {
      a.pause()
      a.removeAttribute('src')
      a.load()
    } catch {
      /* ignore */
    }
    revokeObjectUrl()
  }, [])

  const handleTrackEnded = useCallback(() => {
    if (repeatModeRef.current === 'one') {
      if (sourceRef.current === 'youtube') {
        playerRef.current?.seekTo?.(0, true)
        playerRef.current?.playVideo?.()
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0
        void audioRef.current.play()
      }
      return
    }
    const nextIndex = computeNextIndex(
      queueIndexRef.current,
      queueRef.current.length,
      shuffleRef.current,
      repeatModeRef.current
    )
    if (nextIndex === null) {
      setIsPlaying(false)
      intendedPlayingRef.current = false
      onQueueEndedRef.current?.()
      return
    }
    historyRef.current.push(queueIndexRef.current)
    setQueueIndex(nextIndex)
    requestedVideoIdRef.current = null
  }, [])

  // Hidden <audio> — offline blobs + streamed audio (background-capable)
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    // Helps some browsers treat this as media that can continue in background
    ;(audio as any).disableRemotePlayback = false
    audioRef.current = audio

    const onPlay = () => {
      setIsPlaying(true)
      intendedPlayingRef.current = true
    }
    const onPause = () => {
      // Only clear playing if we meant to pause (not a transient browser pause)
      if (!intendedPlayingRef.current) setIsPlaying(false)
      else setIsPlaying(false)
    }
    const onEnded = () => {
      if (sourceRef.current === 'offline' || sourceRef.current === 'stream') handleTrackEnded()
    }
    const onTime = () => {
      if (sourceRef.current !== 'offline' && sourceRef.current !== 'stream') return
      setCurrentTime(audio.currentTime)
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onMeta = () => {
      if (sourceRef.current !== 'offline' && sourceRef.current !== 'stream') return
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onError = () => {
      if (sourceRef.current === 'stream' || sourceRef.current === 'offline') {
        console.warn('HTML audio error', audio.error)
      }
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('error', onError)
      audio.pause()
      revokeObjectUrl()
      audioRef.current = null
    }
  }, [handleTrackEnded])

  // YouTube iframe — mount into a *child* node so React never sees YT replace its node.
  // (YT.Player replaces the target element; that used to detach React's ref and cause
  // insertBefore NotFoundError when opening Now Playing.)
  useEffect(() => {
    let cancelled = false
    const host = containerRef.current
    if (!host) return

    // Stable host owned by React; YT may replace `mount`
    const mount = document.createElement('div')
    mount.setAttribute('data-yt-mount', '1')
    host.appendChild(mount)

    void loadYouTubeApi().then(() => {
      if (cancelled) return
      // If YT already replaced mount, use whatever is still under host
      const target = host.querySelector('[data-yt-mount]') || mount
      try {
        playerRef.current = new window.YT.Player(target, {
          height: '0',
          width: '0',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!cancelled) setReady(true)
            },
            onStateChange: (e: any) => {
              if (sourceRef.current !== 'youtube') return
              const YT = window.YT
              if (e.data === YT.PlayerState.PLAYING) {
                setIsPlaying(true)
                intendedPlayingRef.current = true
              } else if (e.data === YT.PlayerState.ENDED) {
                handleTrackEnded()
              } else if (
                (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.CUED) &&
                intendedPlayingRef.current
              ) {
                // Mobile often loads paused after loadVideoById — keep retrying while user asked to play
                try {
                  playerRef.current?.playVideo?.()
                } catch {
                  /* ignore */
                }
                // Don't clear intendedPlaying; UI stays "wanting to play"
              } else if (e.data === YT.PlayerState.PAUSED) {
                setIsPlaying(false)
              }
            },
          },
        })
      } catch (err) {
        console.error('YT.Player init failed', err)
      }
    })

    return () => {
      cancelled = true
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* ignore */
      }
      playerRef.current = null
      // Clear host so React's empty div stays consistent
      try {
        host.innerHTML = ''
      } catch {
        /* ignore */
      }
    }
  }, [containerRef, handleTrackEnded])

  const playOfflineBlob = useCallback(
    async (videoId: string, blob: Blob) => {
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
        intendedPlayingRef.current = true
        await audio.play()
        setIsPlaying(true)
        requestedVideoIdRef.current = videoId
        return true
      } catch (err) {
        console.error('Offline audio play failed:', err)
        intendedPlayingRef.current = false
        return false
      }
    },
    [stopYouTube]
  )

  const playStreamUrl = useCallback(
    async (videoId: string, streamUrl: string) => {
      stopYouTube()
      sourceRef.current = 'stream'
      const audio = audioRef.current
      if (!audio) return false

      revokeObjectUrl()
      audio.src = streamUrl
      audio.volume = volumeRef.current / 100
      try {
        intendedPlayingRef.current = true
        // Wait for enough data so iOS doesn't reject play()
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            cleanup()
            resolve()
          }
          const onErr = () => {
            cleanup()
            reject(new Error('audio load error'))
          }
          const cleanup = () => {
            audio.removeEventListener('canplay', onReady)
            audio.removeEventListener('error', onErr)
          }
          audio.addEventListener('canplay', onReady)
          audio.addEventListener('error', onErr)
          // If already ready
          if (audio.readyState >= 2) {
            cleanup()
            resolve()
          }
        })
        await audio.play()
        setIsPlaying(true)
        requestedVideoIdRef.current = videoId
        return true
      } catch (err) {
        console.error('Stream audio play failed:', err)
        intendedPlayingRef.current = false
        try {
          audio.pause()
          audio.removeAttribute('src')
          audio.load()
        } catch {
          /* ignore */
        }
        return false
      }
    },
    [stopYouTube]
  )

  const playYouTube = useCallback(
    (videoId: string) => {
      stopHtmlAudio()
      sourceRef.current = 'youtube'
      const p = playerRef.current
      if (!p?.loadVideoById) return
      requestedVideoIdRef.current = videoId
      intendedPlayingRef.current = true
      try {
        // Prefer cue + play for mobile reliability; loadVideoById alone often stays paused
        if (typeof p.loadVideoById === 'function') {
          p.loadVideoById({ videoId, startSeconds: 0 })
        }
        p.playVideo?.()
        // Extra kicks — iOS/Android sometimes ignore the first playVideo
        setTimeout(() => {
          if (intendedPlayingRef.current && requestedVideoIdRef.current === videoId) {
            try {
              playerRef.current?.playVideo?.()
            } catch {
              /* ignore */
            }
          }
        }, 150)
        setTimeout(() => {
          if (intendedPlayingRef.current && requestedVideoIdRef.current === videoId) {
            try {
              playerRef.current?.playVideo?.()
            } catch {
              /* ignore */
            }
          }
        }, 500)
      } catch (err) {
        console.error('playYouTube failed', err)
      }
    },
    [stopHtmlAudio]
  )

  /**
   * Playback priority:
   * 1) Offline cached blob (HTML5 — works in background)
   * 2) YouTube iframe (reliable in-app playback)
   * 3) On mobile, also try HTML5 stream in the background for lock-screen —
   *    but never block if YouTube works. Stream is best-effort only.
   */
  const loadAndPlay = useCallback(
    async (videoId: string) => {
      intendedPlayingRef.current = true

      // Unlock HTML5 audio inside the user-gesture stack (required on iOS/PWA)
      try {
        const a = audioRef.current
        if (a) {
          const prev = a.src
          // silent unlock — ignore failures
          void a.play().then(() => {
            if (!intendedPlayingRef.current) a.pause()
          }).catch(() => {})
          if (!prev) {
            try {
              a.pause()
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }

      const mobile = prefersHtmlAudio()
      const ytReady = ready && !!playerRef.current?.loadVideoById

      // Offline first when available
      try {
        const blob = await getOfflineAudioBlob(videoId)
        if (blob) {
          const ok = await playOfflineBlob(videoId, blob)
          if (ok) return true
        }
      } catch (err) {
        console.warn('offline lookup error', err)
      }

      if (!navigator.onLine) {
        console.warn('No offline audio and device offline:', videoId)
        setIsPlaying(false)
        intendedPlayingRef.current = false
        return false
      }

      // Mobile / PWA: prefer real HTML5 stream — YT iframe often stays paused in standalone
      if (mobile) {
        const streamUrl = await fetchStreamUrl(videoId)
        if (streamUrl) {
          const ok = await playStreamUrl(videoId, streamUrl)
          if (ok) return true
        }
        // Fall back to YouTube iframe
        if (ytReady) {
          playYouTube(videoId)
          // If still not playing shortly, try stream again / another play kick
          window.setTimeout(() => {
            if (!intendedPlayingRef.current) return
            if (isPlayingRef.current) return
            try {
              playerRef.current?.playVideo?.()
            } catch {
              /* ignore */
            }
          }, 400)
          return true
        }
        requestedVideoIdRef.current = null
        return false
      }

      // Desktop: YouTube first
      if (ytReady) {
        playYouTube(videoId)
        return true
      }

      // YT not ready — stream fallback
      const streamUrl = await fetchStreamUrl(videoId)
      if (streamUrl) {
        const ok = await playStreamUrl(videoId, streamUrl)
        if (ok) return true
      }

      requestedVideoIdRef.current = null
      return false
    },
    [ready, playOfflineBlob, playStreamUrl, playYouTube]
  )

  useEffect(() => {
    if (!current) return
    if (requestedVideoIdRef.current === current.videoId) return
    void loadAndPlay(current.videoId)
  }, [ready, current?.videoId, loadAndPlay])

  // Poll YouTube progress
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

  // ---- Media Session (lock screen / Control Center / notification) ----
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const track = queue[queueIndex]
    if (!track) {
      try {
        navigator.mediaSession.metadata = null
      } catch {
        /* ignore */
      }
      return
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Zelmir',
        artwork: track.thumbnail
          ? [
              { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
              { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      })
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    } catch {
      /* ignore */
    }
  }, [queue, queueIndex, isPlaying])

  // Media Session action handlers (stable refs via loadAndPlay / next wiring below)
  const nextRef = useRef<() => void>(() => {})
  const prevRef = useRef<() => void>(() => {})
  const toggleRef = useRef<() => void>(() => {})
  const seekRef = useRef<(s: number) => void>(() => {})

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        /* unsupported action */
      }
    }

    setHandler('play', () => toggleRef.current())
    setHandler('pause', () => toggleRef.current())
    setHandler('previoustrack', () => prevRef.current())
    setHandler('nexttrack', () => nextRef.current())
    setHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') seekRef.current(details.seekTime)
    })
    setHandler('seekbackward', (details) => {
      const off = details.seekOffset ?? 10
      const t = Math.max(0, (audioRef.current?.currentTime ?? 0) - off)
      seekRef.current(t)
    })
    setHandler('seekforward', (details) => {
      const off = details.seekOffset ?? 10
      const t = (audioRef.current?.currentTime ?? 0) + off
      seekRef.current(t)
    })

    return () => {
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
      setHandler('seekto', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
    }
  }, [])

  // Keep position updated for lock screen scrubber
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!isPlaying) return
    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: 1,
        position: Math.min(currentTime, duration || currentTime),
      })
    } catch {
      /* ignore */
    }
  }, [currentTime, duration, isPlaying])

  // If the browser pauses HTML audio when backgrounding incorrectly, try resume
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!intendedPlayingRef.current) return
      if (sourceRef.current === 'offline' || sourceRef.current === 'stream') {
        const a = audioRef.current
        if (a && a.paused) void a.play().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      intendedPlayingRef.current = true
      historyRef.current = []
      if (newQueue) {
        // Recommended / external tracks may not be in the source list.
        // Always ensure the playing track is in the queue so the player bar updates.
        let idx = newQueue.findIndex((t) => t.videoId === track.videoId)
        let q = newQueue
        if (idx === -1) {
          q = [track, ...newQueue]
          idx = 0
        }
        setQueue(q)
        setQueueIndex(idx)
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
      const nextQ = [...without.slice(0, insertAt), track, ...without.slice(insertAt)]
      if (currentId) {
        const newIdx = nextQ.findIndex((t) => t.videoId === currentId)
        if (newIdx !== -1) setQueueIndex(newIdx)
      }
      return nextQ
    })
  }, [])

  const addToQueue = useCallback((track: Track) => {
    setQueue((q) => {
      if (q.some((t) => t.videoId === track.videoId)) return q
      return [...q, track]
    })
  }, [])

  const togglePlay = useCallback(() => {
    if (sourceRef.current === 'offline' || sourceRef.current === 'stream') {
      const a = audioRef.current
      if (!a) return
      if (isPlayingRef.current) {
        intendedPlayingRef.current = false
        a.pause()
      } else {
        intendedPlayingRef.current = true
        void a.play()
      }
      return
    }
    const p = playerRef.current
    if (!p) return
    if (isPlayingRef.current) {
      intendedPlayingRef.current = false
      p.pauseVideo()
    } else {
      intendedPlayingRef.current = true
      p.playVideo()
    }
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
    if ((sourceRef.current === 'offline' || sourceRef.current === 'stream') && audioRef.current) {
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

  // Keep action handler refs current
  useEffect(() => {
    nextRef.current = next
    prevRef.current = prev
    toggleRef.current = togglePlay
    seekRef.current = seekTo
  }, [next, prev, togglePlay, seekTo])

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
