import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (reset: () => void, error: Error | null) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Zelmir render error:', error, info)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        try {
          return this.props.fallback(this.reset, this.state.error)
        } catch (e) {
          console.error('fallback also failed', e)
        }
      }
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: '#1a1a1e',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>Something went wrong</p>
          <pre
            style={{
              maxWidth: 520,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
              color: '#f5a8a8',
              background: '#2a1818',
              padding: 12,
              borderRadius: 8,
              textAlign: 'left',
            }}
          >
            {this.state.error?.message || String(this.state.error) || 'Unknown error'}
          </pre>
          <button
            type="button"
            onClick={this.reset}
            style={{
              marginTop: 8,
              padding: '10px 20px',
              borderRadius: 999,
              border: 'none',
              background: '#fff',
              color: '#111',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
