import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_THEME, type ThemeState } from '../types'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabaseClient'

interface ThemeContextValue {
  theme: ThemeState
  setTheme: (next: ThemeState) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function rowToTheme(row: any): ThemeState {
  return {
    mode: row.mode,
    solid: row.solid,
    cycleA: row.cycle_a,
    cycleB: row.cycle_b,
    speed: row.speed,
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [theme, setThemeState] = useState<ThemeState>(DEFAULT_THEME)

  useEffect(() => {
    if (!user) {
      setThemeState(DEFAULT_THEME)
      return
    }
    let cancelled = false
    supabase
      .from('theme_settings')
      .select('mode, solid, cycle_a, cycle_b, speed')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setThemeState(data ? rowToTheme(data) : DEFAULT_THEME)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const setTheme = (next: ThemeState) => {
    setThemeState(next)
    if (!user) return
    supabase.from('theme_settings').upsert({
      user_id: user.id,
      mode: next.mode,
      solid: next.solid,
      cycle_a: next.cycleA,
      cycle_b: next.cycleB,
      speed: next.speed,
      updated_at: new Date().toISOString(),
    })
  }

  // Apply the theme as CSS variables whenever it changes.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-solid', theme.solid)
    root.style.setProperty('--accent-a', theme.cycleA)
    root.style.setProperty('--accent-b', theme.cycleB)
    root.style.setProperty('--accent-speed', `${theme.speed}s`)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme, user])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
