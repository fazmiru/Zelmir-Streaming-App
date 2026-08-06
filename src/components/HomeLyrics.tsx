import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../types'
import { useTheme } from '../theme/ThemeContext'
import {
  fetchLyrics,
  approximateTimedLines,
  type LyricLine,
  type LyricsResult,
} from '../utils/lyrics'

interface HomeLyricsProps {
  track: Track | null
  currentTime: number
  duration: number
  isPlaying: boolean
}

/** Survive unmount when leaving Home — avoid blank lyrics on return */
const lyricsCache = new Map<string, LyricsResult>()

/**
 * Desktop / iPad only — active lyric on the home backdrop (mid-right)
 * with an optional subtle glitch when the line changes.
 */
export function HomeLyrics({ track, currentTime, duration, isPlaying }: HomeLyricsProps) {
  const { subtitle } = useTheme()
  const [lines, setLines] = useState<LyricLine[] | null>(null)
  const [plain, setPlain] = useState<string | null>(null)
  const [glitchOn, setGlitchOn] = useState(false)
  const prevLine = useRef(-1)
  const inflight = useRef<string | null>(null)

  useEffect(() => {
    if (!track?.videoId || !subtitle.enabled) {
      setLines(null)
      setPlain(null)
      return
    }

    const id = track.videoId
    const cached = lyricsCache.get(id)
    if (cached) {
      if (cached.lines?.length) {
        setLines(cached.lines)
        setPlain(cached.lyrics)
      } else if (cached.lyrics) {
        setPlain(cached.lyrics)
        setLines(null)
      } else {
        setLines(null)
        setPlain(null)
      }
      return
    }

    if (inflight.current === id) return
    inflight.current = id
    let cancelled = false

    fetchLyrics(track.artist || '', track.title || '')
      .then((res) => {
        lyricsCache.set(id, res)
        if (cancelled) return
        if (res.lines && res.lines.length) {
          setLines(res.lines)
          setPlain(res.lyrics)
        } else if (res.lyrics) {
          setPlain(res.lyrics)
          setLines(null)
        } else {
          setLines(null)
          setPlain(null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLines(null)
          setPlain(null)
        }
      })
      .finally(() => {
        if (inflight.current === id) inflight.current = null
      })

    return () => {
      cancelled = true
    }
  }, [track?.videoId, track?.artist, track?.title, subtitle.enabled])

  const displayLines = useMemo(() => {
    if (lines && lines.length) return lines
    if (plain) return approximateTimedLines(plain, duration || 0)
    return null
  }, [lines, plain, duration])

  let activeIndex = -1
  if (displayLines && displayLines.length) {
    for (let i = 0; i < displayLines.length; i++) {
      if (displayLines[i].time <= currentTime + 0.25) activeIndex = i
      else break
    }
    // Before first timed line, still show line 0 so UI isn’t empty
    if (activeIndex < 0) activeIndex = 0
  }

  const text =
    activeIndex >= 0 && displayLines ? displayLines[activeIndex].text : null

  useEffect(() => {
    if (!text || !subtitle.enabled) return
    if (subtitle.glitch === 'off') return

    const lineChanged = activeIndex !== prevLine.current
    prevLine.current = activeIndex

    if (subtitle.glitch === 'on_change' && lineChanged && activeIndex >= 0) {
      setGlitchOn(true)
      const t = window.setTimeout(() => setGlitchOn(false), 420)
      return () => window.clearTimeout(t)
    }

    if (subtitle.glitch === 'subtle' && isPlaying) {
      const delay = 8000 + Math.random() * 6000
      const id = window.setTimeout(() => {
        setGlitchOn(true)
        window.setTimeout(() => setGlitchOn(false), 280)
      }, delay)
      return () => window.clearTimeout(id)
    }
  }, [activeIndex, text, subtitle.glitch, subtitle.enabled, isPlaying])

  if (!subtitle.enabled || !track || !text) return null

  return (
    <div
      className={`home-lyrics ${glitchOn ? 'home-lyrics-glitching' : ''}`}
      aria-hidden
    >
      <p className="home-lyrics-line" data-text={text}>
        {text}
      </p>
    </div>
  )
}
