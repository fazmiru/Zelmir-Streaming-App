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
    const timer = setTimeout(() => controller.abort(), 5000)
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
  // True while a freshly loadVideoById()'d video is muted and waiting for
  // onStateChange to confirm it's actually PLAYING, at which point we unmute.
  const pendingUnmuteRef = useRef(false)

  const forceYtUnmute = () => {
    const p = playerRef.current
    if (!p) return
    try {
      p.unMute?.()
    } catch {
      /* ignore */
    }
    try {
      p.setVolume?.(Math.max(1, volumeRef.current))
    } catch {
      /* ignore */
    }
    try {
      // Some embeds expose isMuted()
      if (typeof p.isMuted === 'function' && p.isMuted()) {
        p.unMute?.()
      }
    } catch {
      /* ignore */
    }
  }

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

  // Hidden <audio> — offline blobs + streamed audio (background-capable on iOS)
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    // Keep element eligible for lock-screen / Control Center
    ;(audio as any).disableRemotePlayback = false
    try {
      // iOS: mark as media session candidate
      audio.setAttribute('x-webkit-airplay', 'allow')
    } catch {
      /* ignore */
    }
    audioRef.current = audio

    const onPlay = () => {
      setIsPlaying(true)
      intendedPlayingRef.current = true
      try {
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
      } catch {
        /* ignore */
      }
    }
    const onPause = () => {
      // Ignore transient pauses during src changes. Only resume if we still own stream/offline.
      if (
        intendedPlayingRef.current &&
        (sourceRef.current === 'stream' || sourceRef.current === 'offline') &&
        audio.src &&
        audio.readyState >= 2 &&
        !audio.ended
      ) {
        window.setTimeout(() => {
          if (!intendedPlayingRef.current) return
          if (sourceRef.current !== 'stream' && sourceRef.current !== 'offline') return
          if (!audio.paused) return
          void audio.play().catch(() => {})
        }, 120)
        return
      }
      if (!intendedPlayingRef.current) {
        setIsPlaying(false)
        try {
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
        } catch {
          /* ignore */
        }
      }
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
          height: '48',
          width: '48',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            controls: 0,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (ev: any) => {
              if (cancelled) return
              try {
                ev?.target?.unMute?.()
                ev?.target?.setVolume?.(Math.max(1, volumeRef.current || 80))
              } catch {
                /* ignore */
              }
              setReady(true)
            },
            onStateChange: (e: any) => {
              if (sourceRef.current !== 'youtube') return
              const YT = window.YT
              if (e.data === YT.PlayerState.PLAYING) {
                setIsPlaying(true)
                intendedPlayingRef.current = true
                // Always force audible when we intend to play — pending flag
                // alone was leaving many sessions permanently muted.
                pendingUnmuteRef.current = false
                forceYtUnmute()
                window.setTimeout(forceYtUnmute, 80)
                window.setTimeout(forceYtUnmute, 250)
                window.setTimeout(forceYtUnmute, 600)
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
    async (videoId: string, streamUrl: string): Promise<boolean> => {
      // IMPORTANT: do NOT stop YouTube (or touch sourceRef) yet. Fetching the
      // stream URL and waiting for canplay involves real network awaits, so by
      // the time we get here we're often outside the tap's trusted gesture
      // window — audio.play() below can be silently blocked by the browser's
      // autoplay policy. If we'd already stopped YouTube, that leaves nothing
      // playing at all until the user manually pauses/plays again. Instead we
      // only hand off from YouTube to the stream once audio.play() has
      // actually resolved successfully — see below.
      const audio = audioRef.current
      if (!audio) return false

      revokeObjectUrl()

      // Unmuted from the start — muted HTML5 "play then unmute" is what caused
      // silent start → pause → 0:00 on iPhone PWA.
      audio.muted = false
      audio.volume = Math.max(0.01, volumeRef.current / 100)
      audio.src = streamUrl
      try {
        audio.load()
      } catch {
        /* ignore */
      }

      const waitCanPlay = () =>
        new Promise<void>((resolve) => {
          if (audio.readyState >= 2) {
            resolve()
            return
          }
          const onReady = () => {
            cleanup()
            resolve()
          }
          const onErr = () => {
            cleanup()
            resolve() // resolve anyway; play() will fail below
          }
          const cleanup = () => {
            audio.removeEventListener('canplay', onReady)
            audio.removeEventListener('loadeddata', onReady)
            audio.removeEventListener('error', onErr)
          }
          audio.addEventListener('canplay', onReady)
          audio.addEventListener('loadeddata', onReady)
          audio.addEventListener('error', onErr)
          window.setTimeout(() => {
            cleanup()
            resolve()
          }, 8000)
        })

      await waitCanPlay()

      try {
        audio.muted = false
        audio.volume = Math.max(0.01, volumeRef.current / 100)
        await audio.play()

        // Stream is confirmed actually playing — NOW it's safe to hand off
        // from YouTube. Doing this before the await was the bug: it killed
        // working playback in exchange for a play() call that could fail.
        stopYouTube()
        sourceRef.current = 'stream'
        intendedPlayingRef.current = true
        requestedVideoIdRef.current = videoId
        setIsPlaying(true)
        try {
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
        } catch {
          /* ignore */
        }
        // Extra kicks — iOS sometimes needs a second play() after buffering
        window.setTimeout(() => {
          if (!intendedPlayingRef.current) return
          if (requestedVideoIdRef.current !== videoId) return
          if (audio.paused) void audio.play().catch(() => {})
        }, 300)
        window.setTimeout(() => {
          if (!intendedPlayingRef.current) return
          if (requestedVideoIdRef.current !== videoId) return
          if (audio.paused) void audio.play().catch(() => {})
        }, 900)
        return true
      } catch (err) {
        console.error('Stream audio play failed, leaving current source untouched:', err)
        // Reset the audio element so it's not left holding a dead src, but
        // don't touch sourceRef/YouTube — whatever was already playing (or
        // about to play) keeps going uninterrupted.
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
      if (!p?.loadVideoById) {
        console.warn('YouTube player not ready')
        return
      }
      requestedVideoIdRef.current = videoId
      intendedPlayingRef.current = true
      setIsPlaying(true)

      const mobile = prefersHtmlAudio()
      pendingUnmuteRef.current = mobile // only need unmute dance on mobile

      try {
        if (mobile) {
          try {
            p.mute?.()
          } catch {
            /* ignore */
          }
        } else {
          // Desktop / wide screens: start loud. Muted-start was leaving
          // localhost sessions silent when onStateChange unmute never stuck.
          try {
            p.unMute?.()
          } catch {
            /* ignore */
          }
          try {
            p.setVolume?.(Math.max(1, volumeRef.current || 80))
          } catch {
            /* ignore */
          }
        }

        p.loadVideoById({ videoId, startSeconds: 0 })
        p.playVideo?.()

        const kick = (delay: number) => {
          window.setTimeout(() => {
            if (!intendedPlayingRef.current) return
            if (requestedVideoIdRef.current !== videoId) return
            if (sourceRef.current !== 'youtube') return
            try {
              p.playVideo?.()
            } catch {
              /* ignore */
            }
            try {
              p.unMute?.()
              p.setVolume?.(Math.max(1, volumeRef.current || 80))
            } catch {
              /* ignore */
            }
          }, delay)
        }
        kick(100)
        kick(300)
        kick(800)
        kick(1600)
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

      // Unlock HTML5 audio inside the user-gesture stack (required on iOS/PWA).
      // Do NOT pause after unlock — pausing here is what left mobile at 0:00 silent.
      try {
        const a = audioRef.current
        if (a) {
          a.muted = false
          a.volume = Math.max(0.01, volumeRef.current / 100)
          void a.play().catch(() => {})
        }
      } catch {
        /* ignore */
      }

      const mobile = prefersHtmlAudio()
      const ytReady = ready && !!playerRef.current?.loadVideoById

      // CRITICAL for iOS/mobile Safari: loadVideoById()+playVideo() must fire
      // synchronously within the click that triggered this, or WebKit no longer
      // treats it as user-initiated and silently blocks it. `await`-ing the
      // offline-blob IndexedDB lookup below is a real task-queue hop, not a
      // same-tick microtask — doing that BEFORE this call is what broke mobile
      // playback. So on mobile, kick YouTube first, before any await, and only
      // then check whether something better (offline/stream) should replace it.
      if (mobile && ytReady) {
        playYouTube(videoId)
      }

      // Offline first when available
      try {
        const blob = await getOfflineAudioBlob(videoId)
        if (blob && intendedPlayingRef.current) {
          const currentId = queueRef.current[queueIndexRef.current]?.videoId
          if (!currentId || currentId === videoId) {
            const ok = await playOfflineBlob(videoId, blob)
            if (ok) return true
            // Offline playback failed after we may have started YT above — keep YT going.
            if (mobile && ytReady && intendedPlayingRef.current) {
              playYouTube(videoId)
              return true
            }
          }
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

      // Mobile / PWA — pick ONE source and stick with it for the whole track.
      // Switching YouTube ↔ stream mid-play is what made playback stop after a few seconds.
      if (mobile) {
        // Try stream once (for background capability). Only switch if it actually starts.
        // If stream fails, leave YouTube running — do NOT tear it down.
        try {
          const streamUrl = await fetchStreamUrl(videoId)
          if (streamUrl && intendedPlayingRef.current) {
            // Still the same track?
            const currentId = queueRef.current[queueIndexRef.current]?.videoId
            if (!currentId || currentId === videoId) {
              const ok = await playStreamUrl(videoId, streamUrl)
              if (ok) return true
              // Stream failed — playStreamUrl left YouTube untouched, and it
              // was already started synchronously above, so it's still
              // playing. Reloading it here would restart from 0:00 and could
              // hit the same autoplay block, so just leave it be.
              if (ytReady && intendedPlayingRef.current) {
                return true
              }
            }
          }
        } catch (err) {
          console.warn('mobile stream attempt failed', err)
        }

        if (ytReady) return true

        requestedVideoIdRef.current = null
        setIsPlaying(false)
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

  // Keep HTML5 audio alive across background / lock screen (iPhone PWA).
  // Never pause on hide — only resume if iOS suspended us.
  useEffect(() => {
    const resumeIfNeeded = () => {
      if (!intendedPlayingRef.current) return
      if (sourceRef.current !== 'offline' && sourceRef.current !== 'stream') return
      const a = audioRef.current
      if (a && a.paused) {
        a.muted = false
        void a.play().catch(() => {})
      }
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') resumeIfNeeded()
    }
    const onPageShow = () => resumeIfNeeded()
    // iOS sometimes fires these when returning from Control Center / app switcher
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', resumeIfNeeded)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', resumeIfNeeded)
    }
  }, [])

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      intendedPlayingRef.current = true
      setIsPlaying(true) // optimistic UI so bar doesn't look "stuck paused"
      historyRef.current = []

      // Sync unlock inside the click stack (critical for iOS / PWA)
      try {
        const a = audioRef.current
        if (a) {
          a.muted = false
          a.volume = Math.max(0.01, volumeRef.current / 100)
          void a.play().catch(() => {})
        }
      } catch {
        /* ignore */
      }
      try {
        const p = playerRef.current
        if (p?.playVideo) {
          const mobile = prefersHtmlAudio()
          if (mobile) {
            try {
              p.mute?.()
            } catch {
              /* ignore */
            }
          } else {
            try {
              p.unMute?.()
              p.setVolume?.(Math.max(1, volumeRef.current || 80))
            } catch {
              /* ignore */
            }
          }
          p.playVideo()
          window.setTimeout(() => {
            try {
              p.unMute?.()
              p.setVolume?.(Math.max(1, volumeRef.current || 80))
            } catch {
              /* ignore */
            }
          }, 200)
        }
      } catch {
        /* ignore */
      }

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
      try {
        p.unMute?.()
        p.setVolume?.(Math.max(1, volumeRef.current))
      } catch {
        /* ignore */
      }
      p.playVideo()
      window.setTimeout(() => {
        try {
          p.unMute?.()
          p.setVolume?.(Math.max(1, volumeRef.current))
        } catch {
          /* ignore */
        }
      }, 150)
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