import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_THEME, type ThemeState } from '../types'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface ThemeContextValue {
  theme: ThemeState
  setTheme: (next: ThemeState) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'zelmir-theme'

function rowToTheme(row: any): ThemeState {
  return {
    mode: row.mode,
    solid: row.solid,
    cycleA: row.cycle_a,
    cycleB: row.cycle_b,
    speed: row.speed,
  }
}

function isValidTheme(value: unknown): value is ThemeState {
  if (!value || typeof value !== 'object') return false
  const t = value as ThemeState
  return (
    (t.mode === 'solid' || t.mode === 'cycle') &&
    typeof t.solid === 'string' &&
    typeof t.cycleA === 'string' &&
    typeof t.cycleB === 'string' &&
    typeof t.speed === 'number'
  )
}

function loadCachedTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw)
    return isValidTheme(parsed) ? parsed : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function saveCachedTheme(theme: ThemeState) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // ignore quota / private mode errors
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  // Start from localStorage so a refresh keeps the last chosen theme immediately
  // (no flash of DEFAULT_THEME while Supabase loads).
  const [theme, setThemeState] = useState<ThemeState>(loadCachedTheme)
  const [remoteLoaded, setRemoteLoaded] = useState(false)

  // Load theme from Supabase once we know who is signed in.
  // Do NOT reset to DEFAULT while auth is still loading or user is briefly null.
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      // Real sign-out — fall back to default for the login screen.
      setThemeState(DEFAULT_THEME)
      setRemoteLoaded(false)
      return
    }

    let cancelled = false
    setRemoteLoaded(false)

    supabase
      .from('theme_settings')
      .select('mode, solid, cycle_a, cycle_b, speed')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load theme settings:', error)
          setRemoteLoaded(true)
          return
        }
        if (data) {
          const next = rowToTheme(data)
          setThemeState(next)
          saveCachedTheme(next)
        }
        // If no row yet, keep whatever we have from localStorage (or default).
        setRemoteLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const setTheme = (next: ThemeState) => {
    setThemeState(next)
    saveCachedTheme(next)

    if (!user) return

    supabase
      .from('theme_settings')
      .upsert(
        {
          user_id: user.id,
          mode: next.mode,
          solid: next.solid,
          cycle_a: next.cycleA,
          cycle_b: next.cycleB,
          speed: next.speed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (error) console.error('Failed to save theme settings:', error)
      })
  }

  // Apply theme as CSS variables whenever it changes.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-solid', theme.solid)
    root.style.setProperty('--accent-a', theme.cycleA)
    root.style.setProperty('--accent-b', theme.cycleB)
    root.style.setProperty('--accent-speed', `${theme.speed}s`)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
  }, [theme])

  const value = useMemo(
    () => ({ theme, setTheme }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, user]
  )

  // remoteLoaded is unused in the UI for now but keeps the load path explicit.
  void remoteLoaded

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}