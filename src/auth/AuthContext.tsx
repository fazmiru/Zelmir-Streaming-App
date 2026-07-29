import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import bcrypt from 'bcryptjs'
import './auth.css'
import type { SessionUser, StoredUser } from '../types'

const USERS_KEY = 'zelmir-users'
const SESSION_KEY = 'zelmir-session'

const BCRYPT_ROUNDS = 10

type AuthResult = { ok: true } | { ok: false; error: string }

interface AuthContextValue {
  user: SessionUser | null
  signup: (input: {
    username: string
    password: string
    confirmPassword: string
    recoveryQuestion: string
    recoveryAnswer: string
  }) => Promise<AuthResult>
  signin: (username: string, password: string) => Promise<AuthResult>
  signout: () => void
  recoverPassword: (
    username: string,
    recoveryAnswer: string,
    newPassword: string
  ) => Promise<AuthResult>
  getRecoveryQuestion: (username: string) => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? (JSON.parse(raw) as StoredUser[]) : []
  } catch {
    return []
  }
}

function saveUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(loadSession)

  // Keep session in sync with storage so a reload restores it.
  useEffect(() => {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    else localStorage.removeItem(SESSION_KEY)
  }, [user])

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
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' }
    if (password !== confirmPassword) return { ok: false, error: 'Passwords do not match.' }
    if (!recoveryQuestion.trim()) return { ok: false, error: 'Recovery question is required.' }
    if (!recoveryAnswer.trim()) return { ok: false, error: 'Recovery answer is required.' }

    const users = loadUsers()
    if (users.some((u) => u.username.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: 'That username is already taken.' }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const recoveryAnswerHash = await bcrypt.hash(recoveryAnswer.trim().toLowerCase(), BCRYPT_ROUNDS)

    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      username: name,
      passwordHash,
      recoveryQuestion: recoveryQuestion.trim(),
      recoveryAnswerHash,
      createdAt: Date.now(),
    }

    saveUsers([...users, newUser])
    setUser({ id: newUser.id, username: newUser.username })
    return { ok: true }
  }

  const signin: AuthContextValue['signin'] = async (username, password) => {
    const users = loadUsers()
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
    if (!found) return { ok: false, error: 'No account found with that username.' }

    const match = await bcrypt.compare(password, found.passwordHash)
    if (!match) return { ok: false, error: 'Incorrect password.' }

    setUser({ id: found.id, username: found.username })
    return { ok: true }
  }

  const signout = () => setUser(null)

  const getRecoveryQuestion: AuthContextValue['getRecoveryQuestion'] = (username) => {
    const users = loadUsers()
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
    return found ? found.recoveryQuestion : null
  }

  const recoverPassword: AuthContextValue['recoverPassword'] = async (
    username,
    recoveryAnswer,
    newPassword
  ) => {
    if (newPassword.length < 6) return { ok: false, error: 'New password must be at least 6 characters.' }

    const users = loadUsers()
    const found = users.find((u) => u.username.toLowerCase() === username.trim().toLowerCase())
    if (!found) return { ok: false, error: 'No account found with that username.' }

    const match = await bcrypt.compare(recoveryAnswer.trim().toLowerCase(), found.recoveryAnswerHash)
    if (!match) return { ok: false, error: 'Recovery answer is incorrect.' }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    const updated = users.map((u) => (u.id === found.id ? { ...u, passwordHash } : u))
    saveUsers(updated)
    return { ok: true }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, signup, signin, signout, recoverPassword, getRecoveryQuestion }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}