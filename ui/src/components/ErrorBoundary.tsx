import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
  info: string
}

/**
 * Global error boundary. Without this, a single component crash blanks the
 * whole page with no console output that the user can see. Shows the actual
 * exception + stack so we can fix issues without DevTools.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info: info.componentStack || '' })
    // eslint-disable-next-line no-console
    console.error('BenchLoop UI crash:', error, info)
  }

  reset = () => this.setState({ error: null, info: '' })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 32, maxWidth: 880, margin: '0 auto', fontFamily: 'var(--mono)', fontSize: '0.85rem' }}>
        <div style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 14,
          padding: 24,
        }}>
          <div style={{ color: '#ff8888', fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>Something crashed in the UI.</div>
          <div style={{ color: 'var(--text)', marginBottom: 16 }}>{this.state.error.message || String(this.state.error)}</div>
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>Stack trace</summary>
            <pre style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.4)', borderRadius: 6, overflow: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
{this.state.error.stack}
{this.state.info}
            </pre>
          </details>
          <button
            onClick={this.reset}
            style={{ marginTop: 16, padding: '8px 16px', background: 'var(--accent)', color: '#04140b', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
