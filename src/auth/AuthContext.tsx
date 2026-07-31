import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import bcrypt from 'bcryptjs'
import './auth.css'
import type { SessionUser } from '../types'
import { supabase, usernameToEmail } from '../lib/supabaseClient'

const BCRYPT_ROUNDS = 10

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore the session on load, and keep it in sync if it changes elsewhere
  // (e.g. token refresh, or signing out in another tab).
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      await hydrateUser(data.session?.user.id ?? null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await hydrateUser(session?.user.id ?? null)
    })

    return () => listener.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hydrateUser = async (id: string | null) => {
    if (!id) {
      setUser(null)
      return
    }
    const { data } = await supabase.from('profiles').select('username').eq('id', id).single()
    setUser({ id, username: data?.username ?? '' })
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
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return { ok: false, error: 'Username can only contain letters, numbers, and underscores.' }
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
      return { ok: false, error: 'Account created, but saving your profile failed. Please contact support.' }
    }

    setUser({ id: data.user.id, username: name })
    return { ok: true }
  }

  const signin: AuthContextValue['signin'] = async (username, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })

    if (error) {
      if (error.message.toLowerCase().includes('invalid login credentials')) {
        return { ok: false, error: 'No account found with that username, or the password is incorrect.' }
      }
      return { ok: false, error: error.message }
    }
    if (!data.user) return { ok: false, error: 'Sign in failed. Please try again.' }

    setUser({ id: data.user.id, username: username.trim() })
    return { ok: true }
  }

  const signout = () => {
    supabase.auth.signOut()
    setUser(null)
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

  const recoverPassword: AuthContextValue['recoverPassword'] = async (username, recoveryAnswer, newPassword) => {
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
