import React, { useState } from 'react'
import { useAuth } from './AuthContext'
type Mode = 'signin' | 'signup' | 'recover'

export function AuthPage() {
  const { signin, signup, recoverPassword, getRecoveryQuestion } = useAuth()

  const [mode, setMode] = useState<Mode>('signin')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  // Form Fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryQuestion, setRecoveryQuestion] = useState('What was the name of your first pet?')
  const [recoveryAnswer, setRecoveryAnswer] = useState('')

  // Recovery State
  const [fetchedQuestion, setFetchedQuestion] = useState<string | null>(null)

  const clearFeedback = () => {
    setError('')
    setInfo('')
  }

  const handleModeSwitch = (newMode: Mode) => {
    clearFeedback()
    setMode(newMode)
    setFetchedQuestion(null)
  }

  const handleGetQuestion = () => {
    clearFeedback()
    if (!username.trim()) {
      setError('Please enter your username first.')
      return
    }
    const q = getRecoveryQuestion(username)
    if (!q) {
      setError('No account found with that username.')
      return
    }
    setFetchedQuestion(q)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearFeedback()
    setLoading(true)

    try {
      if (mode === 'signin') {
        const res = await signin(username, password)
        if (!res.ok) setError(res.error)
      } else if (mode === 'signup') {
        const res = await signup({
          username,
          password,
          confirmPassword,
          recoveryQuestion,
          recoveryAnswer,
        })
        if (!res.ok) setError(res.error)
      } else if (mode === 'recover') {
        const res = await recoverPassword(username, recoveryAnswer, password)
        if (!res.ok) {
          setError(res.error)
        } else {
          setInfo('Password reset successfully! You can now sign in.')
          setMode('signin')
          setPassword('')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-brand">
          <span className="brand-white">Zel</span>
          <span className="brand-purple">mir</span>
          <div className="auth-subtag">Melbourne</div>
        </div>

        {/* Mode Selector Tabs */}
        {mode !== 'recover' && (
          <div className="auth-mode-toggle">
            <button
              type="button"
              className={`auth-mode-button ${mode === 'signup' ? 'auth-mode-active' : ''}`}
              onClick={() => handleModeSwitch('signup')}
            >
              Sign Up
            </button>
            <button
              type="button"
              className={`auth-mode-button ${mode === 'signin' ? 'auth-mode-active' : ''}`}
              onClick={() => handleModeSwitch('signin')}
            >
              Sign In
            </button>
          </div>
        )}

        {/* Feedback Messages */}
        {error && <div className="auth-error">{error}</div>}
        {info && <div className="auth-info">{info}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* USERNAME */}
          <div className="auth-field">
            <label className="auth-label">USERNAME</label>
            <input
              type="text"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
            />
          </div>

          {/* SIGN IN FORM */}
          {mode === 'signin' && (
            <>
              <div className="auth-field">
                <label className="auth-label">PASSWORD</label>
                <input
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                />
              </div>

              <button type="submit" className="auth-submit accent-fill" disabled={loading}>
                {loading ? 'Signing In...' : 'Log In'}
              </button>

              <button
                type="button"
                className="auth-link"
                onClick={() => handleModeSwitch('recover')}
              >
                Forgot Password?
              </button>
            </>
          )}

          {/* SIGN UP FORM */}
          {mode === 'signup' && (
            <>
              <div className="auth-field">
                <label className="auth-label">PASSWORD</label>
                <input
                  type="password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">CONFIRM PASSWORD</label>
                <input
                  type="password"
                  className="auth-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">RECOVERY QUESTION</label>
                <select
                  className="auth-input auth-select"
                  value={recoveryQuestion}
                  onChange={(e) => setRecoveryQuestion(e.target.value)}
                >
                  <option value="What was the name of your first pet?">
                    What was the name of your first pet?
                  </option>
                  <option value="What is your mother's maiden name?">
                    What is your mother's maiden name?
                  </option>
                  <option value="What city were you born in?">What city were you born in?</option>
                  <option value="What was your first car?">What was your first car?</option>
                </select>
              </div>

              <div className="auth-field">
                <label className="auth-label">RECOVERY ANSWER</label>
                <input
                  type="text"
                  className="auth-input"
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  placeholder="Answer"
                  required
                />
              </div>

              <button type="submit" className="auth-submit accent-fill" disabled={loading}>
                {loading ? 'Creating Account...' : 'Sign Up'}
              </button>
            </>
          )}

          {/* PASSWORD RECOVERY FORM */}
          {mode === 'recover' && (
            <>
              {!fetchedQuestion ? (
                <button
                  type="button"
                  className="auth-submit accent-fill"
                  onClick={handleGetQuestion}
                >
                  Get Recovery Question
                </button>
              ) : (
                <>
                  <div className="auth-field">
                    <label className="auth-label">RECOVERY QUESTION</label>
                    <div className="auth-recovery-question">{fetchedQuestion}</div>
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">YOUR ANSWER</label>
                    <input
                      type="text"
                      className="auth-input"
                      value={recoveryAnswer}
                      onChange={(e) => setRecoveryAnswer(e.target.value)}
                      placeholder="Answer"
                      required
                    />
                  </div>

                  <div className="auth-field">
                    <label className="auth-label">NEW PASSWORD</label>
                    <input
                      type="password"
                      className="auth-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="New password"
                      required
                    />
                  </div>

                  <button type="submit" className="auth-submit accent-fill" disabled={loading}>
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </>
              )}

              <button
                type="button"
                className="auth-link"
                onClick={() => handleModeSwitch('signin')}
              >
                Back to Sign In
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}