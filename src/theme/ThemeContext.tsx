import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_THEME,
  DEFAULT_BACKGROUND_THEME,
  DEFAULT_OUTLINE,
  type ThemeState,
  type OutlineTheme,
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
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'zelmir-theme'
const BG_THEME_STORAGE_KEY = 'zelmir-bg-theme'
const OUTLINE_STORAGE_KEY = 'zelmir-outline'

function normalizeColors(raw: unknown, fallbackA: string, fallbackB: string): string[] {
  if (Array.isArray(raw) && raw.length >= 2) {
    return raw
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .slice(0, 4)
  }
  return [fallbackA, fallbackB]
}

function rowToTheme(row: any): ThemeState {
  // Support legacy cycle_a / cycle_b columns and newer colors array
  const colors = normalizeColors(
    row.colors ?? (row.cycle_a && row.cycle_b ? [row.cycle_a, row.cycle_b, row.cycle_c, row.cycle_d] : null),
    row.cycle_a ?? '#f5f5f2',
    row.cycle_b ?? '#7dd3fc'
  )
  return {
    mode: row.mode,
    solid: row.solid,
    colors,
    speed: row.speed,
  }
}

function rowToBackgroundTheme(row: any): ThemeState {
  const colors = normalizeColors(
    row.bg_colors ??
      (row.bg_cycle_a && row.bg_cycle_b
        ? [row.bg_cycle_a, row.bg_cycle_b, row.bg_cycle_c, row.bg_cycle_d]
        : null),
    row.bg_cycle_a ?? '#7c3aed',
    row.bg_cycle_b ?? '#ec4899'
  )
  return {
    mode: row.bg_mode,
    solid: row.bg_solid,
    colors,
    speed: row.bg_speed,
  }
}

function isValidTheme(value: unknown): value is ThemeState {
  if (!value || typeof value !== 'object') return false
  const t = value as any
  // Migrate old cycleA/cycleB shape
  if (
    (t.mode === 'solid' || t.mode === 'cycle' || t.mode === 'pulse') &&
    typeof t.solid === 'string' &&
    typeof t.speed === 'number'
  ) {
    if (Array.isArray(t.colors) && t.colors.length >= 2) return true
    if (typeof t.cycleA === 'string' && typeof t.cycleB === 'string') return true
  }
  return false
}

function migrateTheme(value: any): ThemeState {
  if (Array.isArray(value.colors) && value.colors.length >= 2) {
    return {
      mode: value.mode,
      solid: value.solid,
      colors: value.colors.slice(0, 4),
      speed: value.speed,
    }
  }
  return {
    mode: value.mode,
    solid: value.solid,
    colors: [value.cycleA ?? value.solid, value.cycleB ?? '#7dd3fc'].filter(Boolean).slice(0, 4),
    speed: value.speed,
  }
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
    return migrateTheme(parsed)
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
    // ignore quota / private mode
  }
}

/** Apply colors[0..3] as CSS vars; missing slots repeat the last color. */
function applyColorVars(prefix: 'accent' | 'bg', theme: ThemeState) {
  const root = document.documentElement
  const cols = theme.colors.length >= 2 ? theme.colors : [theme.solid, theme.solid]
  root.style.setProperty(`--${prefix}-solid`, theme.solid)
  root.style.setProperty(`--${prefix}-a`, cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-b`, cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-c`, cols[2] ?? cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-d`, cols[3] ?? cols[2] ?? cols[1] ?? cols[0] ?? theme.solid)
  root.style.setProperty(`--${prefix}-speed`, `${theme.speed}s`)
  // How many distinct stops are active (2–4) — used by gradient CSS
  root.style.setProperty(`--${prefix}-stops`, String(Math.min(4, Math.max(2, cols.length))))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [theme, setThemeState] = useState<ThemeState>(() => loadCachedTheme(THEME_STORAGE_KEY, DEFAULT_THEME))
  const [backgroundTheme, setBackgroundThemeState] = useState<ThemeState>(() =>
    loadCachedTheme(BG_THEME_STORAGE_KEY, DEFAULT_BACKGROUND_THEME)
  )
  const [outline, setOutlineState] = useState<OutlineTheme>(() => loadCachedOutline())

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
      .select(
        'mode, solid, cycle_a, cycle_b, cycle_c, cycle_d, colors, speed, bg_mode, bg_solid, bg_cycle_a, bg_cycle_b, bg_cycle_c, bg_cycle_d, bg_colors, bg_speed, outline_color, outline_thickness'
      )
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

        if (data.bg_mode) {
          const nextBg = rowToBackgroundTheme(data)
          setBackgroundThemeState(nextBg)
          saveCached(BG_THEME_STORAGE_KEY, nextBg)
        }

        if (typeof data.outline_color === 'string') {
          const nextOutline: OutlineTheme = {
            color: data.outline_color,
            thickness: typeof data.outline_thickness === 'number' ? data.outline_thickness : 0,
          }
          setOutlineState(nextOutline)
          saveCached(OUTLINE_STORAGE_KEY, nextOutline)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const persist = (accent: ThemeState, background: ThemeState, outlineNext: OutlineTheme) => {
    if (!user) return
    const a = accent.colors
    const b = background.colors
    supabase
      .from('theme_settings')
      .upsert(
        {
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) console.error('Failed to save theme settings:', error)
      })
  }

  const setTheme = (next: ThemeState) => {
    const normalized: ThemeState = {
      ...next,
      colors: (next.colors?.length >= 2 ? next.colors : [next.solid, next.solid]).slice(0, 4),
    }
    setThemeState(normalized)
    saveCached(THEME_STORAGE_KEY, normalized)
    persist(normalized, backgroundTheme, outline)
  }

  const setBackgroundTheme = (next: ThemeState) => {
    const normalized: ThemeState = {
      ...next,
      colors: (next.colors?.length >= 2 ? next.colors : [next.solid, next.solid]).slice(0, 4),
    }
    setBackgroundThemeState(normalized)
    saveCached(BG_THEME_STORAGE_KEY, normalized)
    persist(theme, normalized, outline)
  }

  const setOutline = (next: OutlineTheme) => {
    setOutlineState(next)
    saveCached(OUTLINE_STORAGE_KEY, next)
    persist(theme, backgroundTheme, next)
  }

  useEffect(() => {
    const root = document.documentElement
    applyColorVars('accent', theme)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
    root.classList.toggle('theme-pulse', theme.mode === 'pulse')
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
    root.style.setProperty('--btn-outline-color', outline.color)
    root.style.setProperty('--btn-outline-width', `${Math.max(0, outline.thickness)}px`)
  }, [outline])

  const value = useMemo(
    () => ({ theme, setTheme, backgroundTheme, setBackgroundTheme, outline, setOutline }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, backgroundTheme, outline, user]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
