import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import bcrypt from 'bcryptjs'
import './auth.css'
import type { SessionUser } from '../types'
import { supabase, usernameToEmail } from '../lib/supabaseClient'

const BCRYPT_ROUNDS = 10
const SESSION_CACHE_KEY = 'zelmir-session-user'

type AuthResult = { ok: true } | { ok: false; error: string }

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  signup: (input: {
    username: string
    password: string
    confirmPassword: string
    recoveryQuestion: string
    recoveryAnswer: string
  }) => Promise<AuthResult>
  signin: (username: string, password: string) => Promise<AuthResult>
  signout: () => void
  recoverPassword: (username: string, recoveryAnswer: string, newPassword: string) => Promise<AuthResult>
  getRecoveryQuestion: (username: string) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadCachedSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.id === 'string' && typeof parsed.username === 'string') {
      return { id: parsed.id, username: parsed.username }
    }
    return null
  } catch {
    return null
  }
}

function saveCachedSession(user: SessionUser | null) {
  try {
    if (!user) localStorage.removeItem(SESSION_CACHE_KEY)
    else localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user))
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Optimistic restore from localStorage so the app shell can render immediately
  // on refresh instead of flashing the sign-in screen.
  const cached = loadCachedSession()
  const [user, setUser] = useState<SessionUser | null>(cached)
  // If we already have a cached user, don't block the UI on the network round-trip.
  // Still verify the session in the background.
  const [loading, setLoading] = useState(!cached)
  const hydratedIdRef = useRef<string | null>(cached?.id ?? null)
  const initialLoadDoneRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const finishInitialLoad = () => {
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true
        setLoading(false)
      }
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      await hydrateUser(data.session?.user.id ?? null, /* isInitial */ true)
      finishInitialLoad()
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      // During the very first restore, ignore spurious null events that can
      // fire before the stored session is rehydrated — those cause the login flash.
      if (!initialLoadDoneRef.current && !session?.user && event !== 'SIGNED_OUT') {
        return
      }

      await hydrateUser(session?.user.id ?? null, false)

      // Token refresh should not flip loading or clear the user.
      if (event === 'SIGNED_OUT') {
        saveCachedSession(null)
      }
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hydrateUser = async (id: string | null, _isInitial = false) => {
    if (hydratedIdRef.current === id && id !== null) {
      // Same user — still ensure loading is cleared on initial path.
      return
    }
    hydratedIdRef.current = id

    if (!id) {
      setUser(null)
      saveCachedSession(null)
      return
    }

    const { data } = await supabase.from('profiles').select('username').eq('id', id).single()
    const next: SessionUser = { id, username: data?.username ?? '' }
    setUser(next)
    saveCachedSession(next)
  }

  const signup: AuthContextValue['signup'] = async ({
    username,
    password,
    confirmPassword,
    recoveryQuestion,
    recoveryAnswer,
  }) => {
    const name = username.trim()
    if (!name) return { ok: false, error: 'Username is required.' }
    if (name.length < 3) return { ok: false, error: 'Username must be at least 3 characters.' }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' }
    }
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' }
    if (password !== confirmPassword) return { ok: false, error: 'Passwords do not match.' }
    if (!recoveryQuestion.trim()) return { ok: false, error: 'Recovery question is required.' }
    if (!recoveryAnswer.trim()) return { ok: false, error: 'Recovery answer is required.' }

    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(name),
      password,
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        return { ok: false, error: 'That username is already taken.' }
      }
      return { ok: false, error: error.message }
    }
    if (!data.user) return { ok: false, error: 'Sign up failed. Please try again.' }

    const recoveryAnswerHash = await bcrypt.hash(recoveryAnswer.trim().toLowerCase(), BCRYPT_ROUNDS)

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username: name,
      recovery_question: recoveryQuestion.trim(),
      recovery_answer_hash: recoveryAnswerHash,
    })

    if (profileError) {
      return {
        ok: false,
        error: 'Account created, but saving your profile failed. Please contact support.',
      }
    }

    const next: SessionUser = { id: data.user.id, username: name }
    hydratedIdRef.current = data.user.id
    setUser(next)
    saveCachedSession(next)
    return { ok: true }
  }

  const signin: AuthContextValue['signin'] = async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })

    if (error) {
      if (error.message.toLowerCase().includes('invalid login credentials')) {
        return {
          ok: false,
          error: 'No account found with that username, or the password is incorrect.',
        }
      }
      return { ok: false, error: error.message }
    }
    if (!data.user) return { ok: false, error: 'Sign in failed. Please try again.' }

    const next: SessionUser = { id: data.user.id, username: username.trim() }
    hydratedIdRef.current = data.user.id
    setUser(next)
    saveCachedSession(next)
    return { ok: true }
  }

  const signout = () => {
    supabase.auth.signOut()
    hydratedIdRef.current = null
    setUser(null)
    saveCachedSession(null)
  }

  const getRecoveryQuestion: AuthContextValue['getRecoveryQuestion'] = async (username) => {
    const res = await fetch('/api/recover-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-question', username }),
    })
    const data = await res.json()
    return data.question ?? null
  }

  const recoverPassword: AuthContextValue['recoverPassword'] = async (
    username,
    recoveryAnswer,
    newPassword
  ) => {
    if (newPassword.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' }

    const res = await fetch('/api/recover-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', username, recoveryAnswer, newPassword }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? 'Password recovery failed.' }
    return { ok: true }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signup, signin, signout, recoverPassword, getRecoveryQuestion }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}