import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_THEME,
  DEFAULT_BACKGROUND_THEME,
  DEFAULT_OUTLINE,
  DEFAULT_AMBIENT,
  DEFAULT_BACKGROUND_STYLE,
  DEFAULT_SUBTITLE,
  type ThemeState,
  type OutlineTheme,
  type AmbientTheme,
  type BackgroundStyle,
  type SubtitleTheme,
} from '../types'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface ThemeContextValue {
  theme: ThemeState
  setTheme: (next: ThemeState) => void
  backgroundTheme: ThemeState
  setBackgroundTheme: (next: ThemeState) => void
  outline: OutlineTheme
  setOutline: (next: OutlineTheme) => void
  ambient: AmbientTheme
  setAmbient: (next: AmbientTheme) => void
  backgroundStyle: BackgroundStyle
  setBackgroundStyle: (next: BackgroundStyle) => void
  subtitle: SubtitleTheme
  setSubtitle: (next: SubtitleTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'zelmir-theme'
const BG_THEME_STORAGE_KEY = 'zelmir-bg-theme'
const OUTLINE_STORAGE_KEY = 'zelmir-outline'
const AMBIENT_STORAGE_KEY = 'zelmir-ambient'
const BG_STYLE_STORAGE_KEY = 'zelmir-bg-style'
const SUBTITLE_STORAGE_KEY = 'zelmir-subtitle'

function normalizeColors(raw: unknown, fallbackA: string, fallbackB: string): string[] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return raw
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .slice(0, 4)
  }
  return [fallbackA, fallbackB]
}

function normalizeTheme(input: Partial<ThemeState> & Record<string, any>, fallback: ThemeState): ThemeState {
  const solid = typeof input.solid === 'string' ? input.solid : fallback.solid
  const mode =
    input.mode === 'solid' || input.mode === 'cycle' || input.mode === 'pulse' || input.mode === 'album'
      ? input.mode
      : fallback.mode
  const speed = typeof input.speed === 'number' && input.speed > 0 ? input.speed : fallback.speed

  let colors: string[]
  if (Array.isArray(input.colors) && input.colors.length >= 2) {
    colors = normalizeColors(input.colors, solid, solid)
  } else if (typeof input.cycleA === 'string' && typeof input.cycleB === 'string') {
    colors = [input.cycleA, input.cycleB, input.cycleC, input.cycleD].filter(
      (c): c is string => typeof c === 'string' && c.length > 0
    )
    if (colors.length < 2) colors = [solid, solid]
  } else {
    colors = [...fallback.colors]
  }

  return { mode, solid, colors: colors.slice(0, 4), speed }
}

function rowToTheme(row: any): ThemeState {
  if (row.accent_json) {
    try {
      const parsed = typeof row.accent_json === 'string' ? JSON.parse(row.accent_json) : row.accent_json
      return normalizeTheme(parsed, DEFAULT_THEME)
    } catch {
      /* fall through */
    }
  }
  return normalizeTheme(
    {
      mode: row.mode,
      solid: row.solid,
      speed: row.speed,
      colors: row.colors,
      cycleA: row.cycle_a,
      cycleB: row.cycle_b,
      cycleC: row.cycle_c,
      cycleD: row.cycle_d,
    },
    DEFAULT_THEME
  )
}

function rowToBackgroundTheme(row: any): ThemeState {
  if (row.bg_json) {
    try {
      const parsed = typeof row.bg_json === 'string' ? JSON.parse(row.bg_json) : row.bg_json
      return normalizeTheme(parsed, DEFAULT_BACKGROUND_THEME)
    } catch {
      /* fall through */
    }
  }
  return normalizeTheme(
    {
      mode: row.bg_mode,
      solid: row.bg_solid,
      speed: row.bg_speed,
      colors: row.bg_colors,
      cycleA: row.bg_cycle_a,
      cycleB: row.bg_cycle_b,
      cycleC: row.bg_cycle_c,
      cycleD: row.bg_cycle_d,
    },
    DEFAULT_BACKGROUND_THEME
  )
}

function rowToOutline(row: any): OutlineTheme {
  if (row.outline_json) {
    try {
      const parsed = typeof row.outline_json === 'string' ? JSON.parse(row.outline_json) : row.outline_json
      if (parsed && typeof parsed.color === 'string') {
        return {
          color: parsed.color,
          thickness: typeof parsed.thickness === 'number' ? parsed.thickness : 0,
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof row.outline_color === 'string') {
    return {
      color: row.outline_color,
      thickness: typeof row.outline_thickness === 'number' ? row.outline_thickness : 0,
    }
  }
  return DEFAULT_OUTLINE
}

function isValidTheme(value: unknown): value is ThemeState {
  if (!value || typeof value !== 'object') return false
  const t = value as any
  return (
    (t.mode === 'solid' || t.mode === 'cycle' || t.mode === 'pulse' || t.mode === 'album') &&
    typeof t.solid === 'string' &&
    typeof t.speed === 'number' &&
    (Array.isArray(t.colors) || (typeof t.cycleA === 'string' && typeof t.cycleB === 'string'))
  )
}

function isValidOutline(value: unknown): value is OutlineTheme {
  if (!value || typeof value !== 'object') return false
  const o = value as OutlineTheme
  return typeof o.color === 'string' && typeof o.thickness === 'number'
}

function loadCachedTheme(key: string, fallback: ThemeState): ThemeState {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (!isValidTheme(parsed)) return fallback
    return normalizeTheme(parsed, fallback)
  } catch {
    return fallback
  }
}

function loadCachedOutline(): OutlineTheme {
  try {
    const raw = localStorage.getItem(OUTLINE_STORAGE_KEY)
    if (!raw) return DEFAULT_OUTLINE
    const parsed = JSON.parse(raw)
    return isValidOutline(parsed) ? parsed : DEFAULT_OUTLINE
  } catch {
    return DEFAULT_OUTLINE
  }
}

function saveCached(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

function applyColorVars(prefix: 'accent' | 'bg', theme: ThemeState) {
  const root = document.documentElement
  const cols = theme.colors.length >= 2 ? theme.colors : [theme.solid, theme.solid]
  root.style.setProperty(`--${prefix}-solid`, theme.solid)
  root.style.setProperty(`--${prefix}-a`, cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-b`, cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-c`, cols[2] ?? cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-d`, cols[3] ?? cols[2] ?? cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-speed`, `${theme.speed}s`)
  root.style.setProperty(`--${prefix}-stops`, String(Math.min(4, Math.max(2, cols.length))))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [theme, setThemeState] = useState<ThemeState>(() => loadCachedTheme(THEME_STORAGE_KEY, DEFAULT_THEME))
  const [backgroundTheme, setBackgroundThemeState] = useState<ThemeState>(() =>
    loadCachedTheme(BG_THEME_STORAGE_KEY, DEFAULT_BACKGROUND_THEME)
  )
  const [outline, setOutlineState] = useState<OutlineTheme>(() => loadCachedOutline())
  const [ambient, setAmbientState] = useState<AmbientTheme>(() => {
    try {
      const raw = localStorage.getItem(AMBIENT_STORAGE_KEY)
      if (!raw) return DEFAULT_AMBIENT
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_AMBIENT, ...parsed }
    } catch {
      return DEFAULT_AMBIENT
    }
  })
  const [backgroundStyle, setBackgroundStyleState] = useState<BackgroundStyle>(() => {
    try {
      const raw = localStorage.getItem(BG_STYLE_STORAGE_KEY)
      if (raw === 'halftone' || raw === 'glow') return raw
      return DEFAULT_BACKGROUND_STYLE
    } catch {
      return DEFAULT_BACKGROUND_STYLE
    }
  })
  const [subtitle, setSubtitleState] = useState<SubtitleTheme>(() => {
    try {
      const raw = localStorage.getItem(SUBTITLE_STORAGE_KEY)
      if (!raw) return DEFAULT_SUBTITLE
      const parsed = { ...DEFAULT_SUBTITLE, ...JSON.parse(raw) }
      if (
        parsed.fxStyle !== 'classic' &&
        parsed.fxStyle !== 'cinematic' &&
        parsed.fxStyle !== 'cinematic2'
      ) {
        parsed.fxStyle = 'classic'
      }
      return parsed
    } catch {
      return DEFAULT_SUBTITLE
    }
  })

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setThemeState(DEFAULT_THEME)
      setBackgroundThemeState(DEFAULT_BACKGROUND_THEME)
      setOutlineState(DEFAULT_OUTLINE)
      return
    }

    let cancelled = false

    supabase
      .from('theme_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load theme settings:', error)
          return
        }
        if (!data) return

        const next = rowToTheme(data)
        setThemeState(next)
        saveCached(THEME_STORAGE_KEY, next)

        if (data.bg_mode || data.bg_json || data.bg_solid) {
          const nextBg = rowToBackgroundTheme(data)
          setBackgroundThemeState(nextBg)
          saveCached(BG_THEME_STORAGE_KEY, nextBg)
        }

        const nextOutline = rowToOutline(data)
        setOutlineState(nextOutline)
        saveCached(OUTLINE_STORAGE_KEY, nextOutline)
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const persist = (accent: ThemeState, background: ThemeState, outlineNext: OutlineTheme) => {
    if (!user) return
    const a = accent.colors
    const b = background.colors

    const payload: Record<string, unknown> = {
      user_id: user.id,
      mode: accent.mode,
      solid: accent.solid,
      cycle_a: a[0] ?? accent.solid,
      cycle_b: a[1] ?? a[0] ?? accent.solid,
      cycle_c: a[2] ?? null,
      cycle_d: a[3] ?? null,
      colors: a,
      speed: accent.speed,
      bg_mode: background.mode,
      bg_solid: background.solid,
      bg_cycle_a: b[0] ?? background.solid,
      bg_cycle_b: b[1] ?? b[0] ?? background.solid,
      bg_cycle_c: b[2] ?? null,
      bg_cycle_d: b[3] ?? null,
      bg_colors: b,
      bg_speed: background.speed,
      outline_color: outlineNext.color,
      outline_thickness: outlineNext.thickness,
      accent_json: accent,
      bg_json: background,
      outline_json: outlineNext,
      updated_at: new Date().toISOString(),
    }

    supabase
      .from('theme_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .then(({ error }) => {
        if (!error) return
        console.error('Failed to save theme settings (full payload):', error)

        const minimal = {
          user_id: user.id,
          mode: accent.mode,
          solid: accent.solid,
          cycle_a: a[0] ?? accent.solid,
          cycle_b: a[1] ?? a[0] ?? accent.solid,
          speed: accent.speed,
          bg_mode: background.mode,
          bg_solid: background.solid,
          bg_cycle_a: b[0] ?? background.solid,
          bg_cycle_b: b[1] ?? b[0] ?? background.solid,
          bg_speed: background.speed,
          updated_at: new Date().toISOString(),
        }
        supabase
          .from('theme_settings')
          .upsert(minimal, { onConflict: 'user_id' })
          .then(({ error: err2 }) => {
            if (err2) console.error('Failed to save theme settings (minimal):', err2)
          })
      })
  }

  const setTheme = (next: ThemeState) => {
    const normalized = normalizeTheme(next, DEFAULT_THEME)
    setThemeState(normalized)
    saveCached(THEME_STORAGE_KEY, normalized)
    persist(normalized, backgroundTheme, outline)
  }

  const setBackgroundTheme = (next: ThemeState) => {
    const normalized = normalizeTheme(next, DEFAULT_BACKGROUND_THEME)
    setBackgroundThemeState(normalized)
    saveCached(BG_THEME_STORAGE_KEY, normalized)
    persist(theme, normalized, outline)
  }

  const setOutline = (next: OutlineTheme) => {
    setOutlineState(next)
    saveCached(OUTLINE_STORAGE_KEY, next)
    persist(theme, backgroundTheme, next)
  }

  const setAmbient = (next: AmbientTheme) => {
    setAmbientState(next)
    try {
      localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const setBackgroundStyle = (next: BackgroundStyle) => {
    setBackgroundStyleState(next)
    try {
      localStorage.setItem(BG_STYLE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const setSubtitle = (next: SubtitleTheme) => {
    setSubtitleState(next)
    try {
      localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    const root = document.documentElement
    applyColorVars('accent', theme)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
    root.classList.toggle('theme-pulse', theme.mode === 'pulse')
    root.classList.toggle('theme-album', theme.mode === 'album')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    applyColorVars('bg', backgroundTheme)
    root.classList.toggle('bg-theme-cycle', backgroundTheme.mode === 'cycle')
    root.classList.toggle('bg-theme-solid', backgroundTheme.mode === 'solid')
    root.classList.toggle('bg-theme-pulse', backgroundTheme.mode === 'pulse')
  }, [backgroundTheme])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('bg-style-halftone', backgroundStyle === 'halftone')
    root.classList.toggle('bg-style-glow', backgroundStyle === 'glow')
  }, [backgroundStyle])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('subtitle-enabled', subtitle.enabled)
    root.classList.toggle('subtitle-solid', subtitle.mode === 'solid')
    root.classList.toggle('subtitle-gradient', subtitle.mode === 'gradient')
    root.classList.toggle('subtitle-cycle', subtitle.mode === 'cycle')
    root.classList.toggle('subtitle-album', subtitle.mode === 'album')
    root.classList.toggle('subtitle-fx-classic', subtitle.fxStyle === 'classic')
    root.classList.toggle('subtitle-fx-cinematic', subtitle.fxStyle === 'cinematic')
    root.classList.toggle('subtitle-fx-cinematic2', subtitle.fxStyle === 'cinematic2')
    root.style.setProperty('--sub-solid', subtitle.solid)
    const cols = subtitle.colors.length >= 2 ? subtitle.colors : [subtitle.solid, subtitle.solid]
    root.style.setProperty('--sub-a', cols[0] ?? subtitle.solid)
    root.style.setProperty('--sub-b', cols[1] ?? cols[0] ?? subtitle.solid)
    root.style.setProperty('--sub-c', cols[2] ?? cols[1] ?? cols[0] ?? subtitle.solid)
    root.style.setProperty('--sub-d', cols[3] ?? cols[2] ?? cols[1] ?? cols[0] ?? subtitle.solid)
    root.style.setProperty('--sub-speed', `${subtitle.speed}s`)
  }, [subtitle])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--btn-outline-color', outline.color)
    root.style.setProperty('--btn-outline-width', `${Math.max(0, outline.thickness)}px`)
  }, [outline])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      backgroundTheme,
      setBackgroundTheme,
      outline,
      setOutline,
      ambient,
      setAmbient,
      backgroundStyle,
      setBackgroundStyle,
      subtitle,
      setSubtitle,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, backgroundTheme, outline, ambient, backgroundStyle, subtitle, user]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
