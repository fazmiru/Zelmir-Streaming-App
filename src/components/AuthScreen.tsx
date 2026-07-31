import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

type Mode = 'signup' | 'signin' | 'recover'

const RECOVERY_PRESETS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the make of your first car?",
  "What city were you born in?",
  "What is your favorite book?",
]

export function AuthScreen() {
  const { signup, signin, recoverPassword, getRecoveryQuestion } = useAuth()
  const [mode, setMode] = useState<Mode>('signup')

  // shared
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // signup-only
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryQuestion, setRecoveryQuestion] = useState(RECOVERY_PRESETS[0])
  const [recoveryAnswer, setRecoveryAnswer] = useState('')

  // recover-only
  const [revealedQuestion, setRevealedQuestion] = useState<string | null>(null)
  const [recoveryAnswerForReset, setRecoveryAnswerForReset] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const resetFields = () => {
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    setRecoveryQuestion(RECOVERY_PRESETS[0])
    setRecoveryAnswer('')
    setRecoveryAnswerForReset('')
    setNewPassword('')
    setRevealedQuestion(null)
    setError(null)
    setInfo(null)
  }

  const switchMode = (next: Mode) => {
    resetFields()
    setMode(next)
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await signup({
      username,
      password,
      confirmPassword,
      recoveryQuestion,
      recoveryAnswer,
    })
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await signin(username, password)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  const handleLookupQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const q = await getRecoveryQuestion(username)
    if (!q) {
      setRevealedQuestion(null)
      setError('No account found with that username.')
      return
    }
    setRevealedQuestion(q)
  }

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    const result = await recoverPassword(username, recoveryAnswerForReset, newPassword)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo('Password reset. You can now sign in with your new password.')
    resetFields()
    setMode('signin')
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="accent-text">Zelmir</span>
        </div>

        {/* Sign up / Sign in toggle buttons */}
        {mode !== 'recover' && (
          <div className="auth-mode-toggle">
            <button
              type="button"
              className={`auth-mode-button ${mode === 'signup' ? 'auth-mode-active accent-fill' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
            <button
              type="button"
              className={`auth-mode-button ${mode === 'signin' ? 'auth-mode-active accent-fill' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
          </div>
        )}

        {error && <p className="auth-error">{error}</p>}
        {info && <p className="auth-info">{info}</p>}

        {/* ---------------- Sign up ---------------- */}
        {mode === 'signup' && (
          <form className="auth-form" onSubmit={handleSignup}>
            <label className="auth-field">
              <span className="auth-label">Username</span>
              <input
                type="text"
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Choose a username"
                disabled={busy}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                disabled={busy}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Confirm Password</span>
              <input
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                disabled={busy}
              />
            </label>

            <div className="auth-divider" />

            <label className="auth-field">
              <span className="auth-label">Recovery question</span>
              <select
                className="auth-input auth-select"
                value={recoveryQuestion}
                onChange={(e) => setRecoveryQuestion(e.target.value)}
                disabled={busy}
              >
                {RECOVERY_PRESETS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </label>

            <label className="auth-field">
              <span className="auth-label">Recovery answer</span>
              <input
                type="text"
                className="auth-input"
                value={recoveryAnswer}
                onChange={(e) => setRecoveryAnswer(e.target.value)}
                autoComplete="off"
                placeholder="Your answer (case-insensitive)"
                disabled={busy}
              />
            </label>

            <button type="submit" className="auth-submit accent-fill" disabled={busy}>
              {busy ? 'Creating…' : 'Sign up'}
            </button>
          </form>
        )}

        {/* ---------------- Sign in ---------------- */}
        {mode === 'signin' && (
          <form className="auth-form" onSubmit={handleSignin}>
            <label className="auth-field">
              <span className="auth-label">Username</span>
              <input
                type="text"
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Your username"
                disabled={busy}
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                type="password"
                className="auth-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                disabled={busy}
              />
            </label>

            <button type="submit" className="auth-submit accent-fill" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('recover')}
              disabled={busy}
            >
              Forgot your password?
            </button>
          </form>
        )}

        {/* ---------------- Recover ---------------- */}
        {mode === 'recover' && (
          <form className="auth-form" onSubmit={revealedQuestion ? handleRecover : handleLookupQuestion}>
            <label className="auth-field">
              <span className="auth-label">Username</span>
              <input
                type="text"
                className="auth-input"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setRevealedQuestion(null)
                }}
                autoComplete="username"
                placeholder="Your username"
                disabled={busy}
              />
            </label>

            {revealedQuestion && (
              <>
                <div className="auth-recovery-question">{revealedQuestion}</div>

                <label className="auth-field">
                  <span className="auth-label">Your answer</span>
                  <input
                    type="text"
                    className="auth-input"
                    value={recoveryAnswerForReset}
                    onChange={(e) => setRecoveryAnswerForReset(e.target.value)}
                    autoComplete="off"
                    placeholder="Recovery answer"
                    disabled={busy}
                  />
                </label>

                <label className="auth-field">
                  <span className="auth-label">New password</span>
                  <input
                    type="password"
                    className="auth-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    disabled={busy}
                  />
                </label>
              </>
            )}

            <button type="submit" className="auth-submit accent-fill" disabled={busy}>
              {busy
                ? 'Resetting…'
                : revealedQuestion
                  ? 'Reset password'
                  : 'Continue'}
            </button>

            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('signin')}
              disabled={busy}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}