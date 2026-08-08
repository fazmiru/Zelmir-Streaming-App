import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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

const lyricsCache = new Map<string, LyricsResult>()

/** Split into words so flex wrap never cuts mid-word; chars stay inside each word. */
function splitKineticWords(text: string): { chars: string[]; key: string }[] {
  const parts = text.split(/(\s+)/)
  const words: { chars: string[]; key: string }[] = []
  let wi = 0
  for (const part of parts) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      // keep a single non-breaking gap only between real words via margin on word spans
      continue
    }
    words.push({ chars: Array.from(part), key: `w${wi++}-${part.slice(0, 8)}` })
  }
  return words
}

/**
 * Desktop / iPad home lyrics.
 * classic · cinematic · cinematic2 (kinetic MV)
 */
export function HomeLyrics({ track, currentTime, duration, isPlaying }: HomeLyricsProps) {
  const { subtitle } = useTheme()
  const [lines, setLines] = useState<LyricLine[] | null>(null)
  const [plain, setPlain] = useState<string | null>(null)
  const [glitchOn, setGlitchOn] = useState(false)
  const [flash, setFlash] = useState(false)
  const [enterKey, setEnterKey] = useState(0)
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
    if (activeIndex < 0) activeIndex = 0
  }

  const text =
    activeIndex >= 0 && displayLines ? displayLines[activeIndex].text : null
  const prevText =
    activeIndex > 0 && displayLines ? displayLines[activeIndex - 1].text : null

  useEffect(() => {
    if (!text || !subtitle.enabled) return
    const lineChanged = activeIndex !== prevLine.current
    prevLine.current = activeIndex

    if (lineChanged && activeIndex >= 0) {
      setEnterKey((k) => k + 1)

      if (subtitle.fxStyle === 'cinematic2') {
        setGlitchOn(true)
        // Soft bloom pulse only — no full-screen white invert rectangle
        setFlash(true)
        const t1 = window.setTimeout(() => setFlash(false), 280)
        const t2 = window.setTimeout(() => setGlitchOn(false), 1200)
        return () => {
          window.clearTimeout(t1)
          window.clearTimeout(t2)
        }
      }

      if (subtitle.glitch === 'on_change' || subtitle.fxStyle === 'cinematic') {
        setGlitchOn(true)
        const ms = subtitle.fxStyle === 'cinematic' ? 900 : 420
        const t = window.setTimeout(() => setGlitchOn(false), ms)
        return () => window.clearTimeout(t)
      }
    }

    if (subtitle.glitch === 'subtle' && isPlaying && subtitle.fxStyle === 'classic') {
      const delay = 8000 + Math.random() * 6000
      const id = window.setTimeout(() => {
        setGlitchOn(true)
        window.setTimeout(() => setGlitchOn(false), 280)
      }, delay)
      return () => window.clearTimeout(id)
    }
  }, [activeIndex, text, subtitle.glitch, subtitle.enabled, subtitle.fxStyle, isPlaying])

  if (!subtitle.enabled || !track || !text) return null

  const fx = subtitle.fxStyle
  const cinematic = fx === 'cinematic'
  const kinetic = fx === 'cinematic2'
  const words = kinetic ? splitKineticWords(text) : null

  return (
    <div
      className={[
        'home-lyrics',
        fx === 'classic' ? 'home-lyrics-classic' : '',
        cinematic ? 'home-lyrics-cinematic' : '',
        kinetic ? 'home-lyrics-kinetic' : '',
        glitchOn ? 'home-lyrics-glitching' : '',
        flash ? 'home-lyrics-bloom' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {(cinematic || kinetic) && (
        <>
          <div className="mv-dust" />
          <div className="mv-scan" />
          <div className="mv-grain" />
          {kinetic && <div className="mv-vhs-slice" />}
          {kinetic && <div className="mv-trails" />}
          {prevText && (
            <p className="mv-ghost-prev" data-text={prevText}>
              {prevText}
            </p>
          )}
        </>
      )}

      {kinetic ? (
        <p key={enterKey} className="home-lyrics-line mv-kinetic-line" data-text={text}>
          {words!.map((word, wi) => {
            let globalI = 0
            for (let j = 0; j < wi; j++) globalI += words![j].chars.length
            return (
              <span key={`${enterKey}-${word.key}`} className="mv-word">
                {word.chars.map((ch, ci) => {
                  const i = globalI + ci
                  const emphasis = i === 0 || (wi === words!.length - 1 && ci === word.chars.length - 1)
                  return (
                    <span
                      key={`${enterKey}-${i}`}
                      className={`mv-char ${emphasis ? 'mv-char-hero' : ''}`}
                      style={
                        {
                          '--i': i,
                          '--r': ((i * 37) % 11) - 5,
                          '--ry': ((i * 19) % 13) - 6,
                          '--rot': ((i * 23) % 7) - 3,
                          '--drift-x': ((i * 41) % 21) - 10,
                          '--drift-y': ((i * 29) % 17) - 8,
                        } as CSSProperties
                      }
                    >
                      {ch}
                    </span>
                  )
                })}
              </span>
            )
          })}
        </p>
      ) : (
        <p
          key={enterKey}
          className={`home-lyrics-line ${cinematic ? 'mv-line-enter' : ''}`}
          data-text={text}
        >
          {cinematic && (
            <span className="mv-echo" aria-hidden>
              {text}
            </span>
          )}
          <span className="mv-main">{text}</span>
          {cinematic && (
            <span className="mv-echo mv-echo-2" aria-hidden>
              {text}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
