/**
 * iOS / iPhone PWA background audio helpers
 * -----------------------------------------
 * Safari on iPhone is far stricter than iPadOS about audio after lock /
 * home-screen. This module centralises the patterns that keep a stream
 * eligible for Control Center + lock-screen playback:
 *
 *  1. Real HTMLAudioElement (never Web Audio / AudioContext alone)
 *  2. playsinline + webkit-playsinline
 *  3. Unlock .play() inside a real user gesture (tap), before any await
 *  4. Media Session metadata + action handlers (required on modern iOS)
 *  5. Resume on visibilitychange / pageshow when the OS pauses us
 *
 * Wire this into your player: call unlockFromGesture() on every play tap,
 * setMediaSession(...) when the track changes, and keep the same <audio>
 * instance for the whole session.
 */

export type BgTrackMeta = {
  title: string
  artist: string
  album?: string
  artworkUrl?: string
}

export type BgAudioHandlers = {
  play: () => void
  pause: () => void
  next?: () => void
  prev?: () => void
  seek?: (seconds: number) => void
  seekForward?: (offset: number) => void
  seekBackward?: (offset: number) => void
}

let sharedAudio: HTMLAudioElement | null = null
let unlocked = false

/** Prefer a single long-lived element so iOS keeps the same media session. */
export function getBackgroundAudio(): HTMLAudioElement {
  if (sharedAudio) return sharedAudio

  const audio = document.createElement('audio')
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'
  audio.setAttribute('playsinline', 'true')
  audio.setAttribute('webkit-playsinline', 'true')
  try {
    audio.setAttribute('x-webkit-airplay', 'allow')
  } catch {
    /* ignore */
  }
  // Keep Control Center / AirPlay eligibility
  try {
    ;(audio as any).disableRemotePlayback = false
  } catch {
    /* ignore */
  }

  // Attach off-DOM (still valid for Media Session)
  audio.style.cssText =
    'position:fixed;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-1;bottom:0;left:0'
  if (typeof document !== 'undefined' && document.body) {
    document.body.appendChild(audio)
  }

  sharedAudio = audio
  return audio
}

/**
 * MUST run synchronously inside a click/touchend handler — before any
 * await / fetch. Starts a silent play then pause to open the audio session.
 * Call this at the top of every "play this song" handler on iPhone.
 */
export function unlockFromGesture(audio?: HTMLAudioElement): void {
  const a = audio || getBackgroundAudio()
  try {
    a.muted = false
    a.volume = Math.max(0.01, a.volume || 1)
    const p = a.play()
    if (p && typeof p.then === 'function') {
      p.then(() => {
        // If we had no real src yet, pause the empty unlock play
        if (!a.src || a.src === window.location.href) {
          try {
            a.pause()
          } catch {
            /* ignore */
          }
        }
        unlocked = true
      }).catch(() => {
        /* still mark attempt — next real src may work */
        unlocked = true
      })
    } else {
      unlocked = true
    }
  } catch {
    unlocked = true
  }
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

/** Push Now Playing info to the lock screen / Control Center. */
export function setMediaSessionMetadata(meta: BgTrackMeta | null): void {
  if (!('mediaSession' in navigator)) return
  try {
    if (!meta) {
      navigator.mediaSession.metadata = null
      return
    }
    const artwork = meta.artworkUrl
      ? [
          { src: meta.artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: meta.artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: meta.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      : []
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title || 'Unknown',
      artist: meta.artist || 'Unknown',
      album: meta.album || 'Zelmir',
      artwork,
    })
  } catch (err) {
    console.warn('MediaSession metadata failed', err)
  }
}

export function setMediaSessionPlaybackState(state: 'none' | 'paused' | 'playing'): void {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    /* ignore */
  }
}

/**
 * Wire lock-screen / headphone / Control Center buttons.
 * Safe to call multiple times — handlers are replaced.
 */
export function bindMediaSessionHandlers(handlers: BgAudioHandlers): void {
  if (!('mediaSession' in navigator)) return

  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, fn)
    } catch {
      /* older iOS may not support every action */
    }
  }

  set('play', () => {
    handlers.play()
    setMediaSessionPlaybackState('playing')
  })
  set('pause', () => {
    handlers.pause()
    setMediaSessionPlaybackState('paused')
  })

  if (handlers.next) {
    set('nexttrack', () => handlers.next?.())
  } else {
    set('nexttrack', null)
  }
  if (handlers.prev) {
    set('previoustrack', () => handlers.prev?.())
  } else {
    set('previoustrack', null)
  }

  if (handlers.seek) {
    set('seekto', (details) => {
      if (details.seekTime != null) handlers.seek?.(details.seekTime)
    })
  } else {
    set('seekto', null)
  }

  if (handlers.seekForward) {
    set('seekforward', (details) => {
      handlers.seekForward?.(details.seekOffset ?? 10)
    })
  } else {
    set('seekforward', null)
  }

  if (handlers.seekBackward) {
    set('seekbackward', (details) => {
      handlers.seekBackward?.(details.seekOffset ?? 10)
    })
  } else {
    set('seekbackward', null)
  }
}

/** Keep the scrubber on the lock screen in sync. */
export function setMediaSessionPosition(opts: {
  duration: number
  position: number
  playbackRate?: number
}): void {
  if (!('mediaSession' in navigator)) return
  if (!Number.isFinite(opts.duration) || opts.duration <= 0) return
  try {
    navigator.mediaSession.setPositionState({
      duration: opts.duration,
      position: Math.min(Math.max(0, opts.position), opts.duration),
      playbackRate: opts.playbackRate ?? 1,
    })
  } catch {
    /* ignore — some WebKit builds throw on invalid ranges */
  }
}

/**
 * When the phone locks or the PWA is backgrounded, iOS may pause the
 * element. Re-call .play() when we become visible again if the app still
 * intends to be playing.
 */
export function attachBackgroundResume(
  shouldPlay: () => boolean,
  audio?: HTMLAudioElement
): () => void {
  const a = audio || getBackgroundAudio()

  const resume = () => {
    if (!shouldPlay()) return
    if (!a.src) return
    if (!a.paused && !a.ended) return
    void a.play().catch(() => {})
    setMediaSessionPlaybackState('playing')
  }

  const onVis = () => {
    if (document.visibilityState === 'visible') resume()
  }

  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pageshow', resume)
  window.addEventListener('focus', resume)

  return () => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pageshow', resume)
    window.removeEventListener('focus', resume)
  }
}

/**
 * Load a URL and play. Call unlockFromGesture() in the same tick as the
 * user tap *before* awaiting any network work; pass the resolved URL here
 * afterward. Returns true if play() resolved.
 */
export async function playUrl(
  url: string,
  opts?: { volume?: number }
): Promise<boolean> {
  const a = getBackgroundAudio()
  a.muted = false
  a.volume = Math.max(0.01, Math.min(1, (opts?.volume ?? 100) / 100))
  if (a.src !== url) {
    a.src = url
    try {
      a.load()
    } catch {
      /* ignore */
    }
  }
  try {
    await a.play()
    setMediaSessionPlaybackState('playing')
    return true
  } catch (err) {
    console.warn('background playUrl failed', err)
    return false
  }
}

export function pauseBackgroundAudio(): void {
  const a = sharedAudio
  if (!a) return
  try {
    a.pause()
  } catch {
    /* ignore */
  }
  setMediaSessionPlaybackState('paused')
}

/** True when running as installed PWA on iPhone/iPod (strictest case). */
export function isIPhonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isPhone = /iPhone|iPod/.test(ua)
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  return isPhone && standalone
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
