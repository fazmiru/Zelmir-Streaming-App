import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Logged instead of silently swallowed, so it's still visible in devtools.
    console.error('Zelmir caught a render error:', error, info)
  }

  reset = () => this.setState({ hasError: false })

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.reset)
    }
    return this.props.children
  }
}
