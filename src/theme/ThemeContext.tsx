import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_THEME, DEFAULT_BACKGROUND_THEME, type ThemeState } from '../types'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface ThemeContextValue {
  theme: ThemeState
  setTheme: (next: ThemeState) => void
  backgroundTheme: ThemeState
  setBackgroundTheme: (next: ThemeState) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'zelmir-theme'
const BG_THEME_STORAGE_KEY = 'zelmir-bg-theme'

function rowToTheme(row: any): ThemeState {
  return {
    mode: row.mode,
    solid: row.solid,
    cycleA: row.cycle_a,
    cycleB: row.cycle_b,
    speed: row.speed,
  }
}

function rowToBackgroundTheme(row: any): ThemeState {
  return {
    mode: row.bg_mode,
    solid: row.bg_solid,
    cycleA: row.bg_cycle_a,
    cycleB: row.bg_cycle_b,
    speed: row.bg_speed,
  }
}

function isValidTheme(value: unknown): value is ThemeState {
  if (!value || typeof value !== 'object') return false
  const t = value as ThemeState
  return (
    (t.mode === 'solid' || t.mode === 'cycle' || t.mode === 'pulse') &&
    typeof t.solid === 'string' &&
    typeof t.cycleA === 'string' &&
    typeof t.cycleB === 'string' &&
    typeof t.speed === 'number'
  )
}

function loadCached(key: string, fallback: ThemeState): ThemeState {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return isValidTheme(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function saveCached(key: string, theme: ThemeState) {
  try {
    localStorage.setItem(key, JSON.stringify(theme))
  } catch {
    // ignore quota / private mode errors
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  // Start from localStorage so a refresh keeps the last chosen theme immediately
  // (no flash of defaults while Supabase loads).
  const [theme, setThemeState] = useState<ThemeState>(() => loadCached(THEME_STORAGE_KEY, DEFAULT_THEME))
  const [backgroundTheme, setBackgroundThemeState] = useState<ThemeState>(() =>
    loadCached(BG_THEME_STORAGE_KEY, DEFAULT_BACKGROUND_THEME)
  )

  // Load both from Supabase once we know who is signed in.
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setThemeState(DEFAULT_THEME)
      setBackgroundThemeState(DEFAULT_BACKGROUND_THEME)
      return
    }

    let cancelled = false

    supabase
      .from('theme_settings')
      .select('mode, solid, cycle_a, cycle_b, speed, bg_mode, bg_solid, bg_cycle_a, bg_cycle_b, bg_speed')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load theme settings:', error)
          return
        }
        if (!data) return // no row yet — keep whatever came from localStorage/defaults

        const next = rowToTheme(data)
        setThemeState(next)
        saveCached(THEME_STORAGE_KEY, next)

        // Background columns may not exist yet on older rows (pre-migration) —
        // fall back to the default rather than showing "undefined".
        if (data.bg_mode) {
          const nextBg = rowToBackgroundTheme(data)
          setBackgroundThemeState(nextBg)
          saveCached(BG_THEME_STORAGE_KEY, nextBg)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const persist = (accent: ThemeState, background: ThemeState) => {
    if (!user) return
    supabase
      .from('theme_settings')
      .upsert(
        {
          user_id: user.id,
          mode: accent.mode,
          solid: accent.solid,
          cycle_a: accent.cycleA,
          cycle_b: accent.cycleB,
          speed: accent.speed,
          bg_mode: background.mode,
          bg_solid: background.solid,
          bg_cycle_a: background.cycleA,
          bg_cycle_b: background.cycleB,
          bg_speed: background.speed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) console.error('Failed to save theme settings:', error)
      })
  }

  const setTheme = (next: ThemeState) => {
    setThemeState(next)
    saveCached(THEME_STORAGE_KEY, next)
    persist(next, backgroundTheme)
  }

  const setBackgroundTheme = (next: ThemeState) => {
    setBackgroundThemeState(next)
    saveCached(BG_THEME_STORAGE_KEY, next)
    persist(theme, next)
  }

  // Apply both themes as CSS variables whenever either changes.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-solid', theme.solid)
    root.style.setProperty('--accent-a', theme.cycleA)
    root.style.setProperty('--accent-b', theme.cycleB)
    root.style.setProperty('--accent-speed', `${theme.speed}s`)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
    root.classList.toggle('theme-pulse', theme.mode === 'pulse')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--bg-solid', backgroundTheme.solid)
    root.style.setProperty('--bg-a', backgroundTheme.cycleA)
    root.style.setProperty('--bg-b', backgroundTheme.cycleB)
    root.style.setProperty('--bg-speed', `${backgroundTheme.speed}s`)
    root.classList.toggle('bg-theme-cycle', backgroundTheme.mode === 'cycle')
    root.classList.toggle('bg-theme-solid', backgroundTheme.mode === 'solid')
    root.classList.toggle('bg-theme-pulse', backgroundTheme.mode === 'pulse')
  }, [backgroundTheme])

  const value = useMemo(
    () => ({ theme, setTheme, backgroundTheme, setBackgroundTheme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, backgroundTheme, user]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
