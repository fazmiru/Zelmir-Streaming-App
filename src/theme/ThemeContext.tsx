import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_THEME, type ThemeState } from '../types'
import { useAuth } from '../auth/AuthContext'

const GLOBAL_KEY = 'zelmir-theme'

function storageKey(userId: string | null): string {
  return userId ? `zelmir-theme:${userId}` : GLOBAL_KEY
}

interface ThemeContextValue {
  theme: ThemeState
  setTheme: (next: ThemeState) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function loadTheme(userId: string | null): ThemeState {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_THEME
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_THEME, ...parsed }
  } catch {
    return DEFAULT_THEME
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [theme, setThemeState] = useState<ThemeState>(() => loadTheme(user?.id ?? null))

  // When the signed-in user changes, swap to that user's saved theme.
  useEffect(() => {
    setThemeState(loadTheme(user?.id ?? null))
  }, [user?.id])

  const setTheme = (next: ThemeState) => {
    setThemeState(next)
    localStorage.setItem(storageKey(user?.id ?? null), JSON.stringify(next))
  }

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-solid', theme.solid)
    root.style.setProperty('--accent-a', theme.cycleA)
    root.style.setProperty('--accent-b', theme.cycleB)
    root.style.setProperty('--accent-speed', `${theme.speed}s`)
    root.classList.toggle('theme-cycle', theme.mode === 'cycle')
    root.classList.toggle('theme-solid', theme.mode === 'solid')
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}