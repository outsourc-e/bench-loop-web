import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, type AuthProviderId } from '../context/AuthContext'
import BrandIcon from './BrandIcon'

export default function AuthButton() {
  const { availableProviders, loading, profile, signIn, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<AuthProviderId | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (loading) return <span className="auth-loading">Connecting…</span>

  if (profile) {
    return (
      <div className="auth-viewer">
        <Link to={`/u/${profile.handle}`} className="auth-profile" title={`Open @${profile.handle}`}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile.displayName.charAt(0)}</span>}
          <b>@{profile.handle}</b>
        </Link>
        <Link to="/settings" className="btn btn-ghost auth-settings">Lab</Link>
        <button type="button" className="btn btn-ghost auth-signout" onClick={() => void signOut()}>Sign out</button>
      </div>
    )
  }

  const beginSignIn = async (provider: AuthProviderId) => {
    setBusy(provider)
    setNotice(null)
    try {
      await signIn(provider)
    } catch (cause) {
      setBusy(null)
      setNotice(cause instanceof Error ? cause.message : 'Sign-in could not start.')
    }
  }

  return (
    <div className="auth-entry">
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Sign in</button>
      {open && (
        <div className="auth-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}>
          <section className="auth-dialog card-premium" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title">
            <button type="button" className="auth-dialog-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
            <span className="revamp-section-kicker">Join the loop</span>
            <h2 id="auth-dialog-title">Build your local AI profile</h2>
            <p>Publish runs, save recipes, connect your rigs, and keep Ask Loop threads across devices.</p>
            <div className="auth-provider-list">
              <button
                type="button"
                disabled={!availableProviders.github || busy !== null}
                onClick={() => void beginSignIn('github')}
              >
                <BrandIcon brand="github" size={20} />
                <span><strong>{busy === 'github' ? 'Connecting…' : 'Continue with GitHub'}</strong><small>Builder identity and code provenance</small></span>
              </button>
              <button
                type="button"
                disabled={!availableProviders.twitter || busy !== null}
                onClick={() => void beginSignIn('twitter')}
              >
                <BrandIcon brand="x" size={18} />
                <span><strong>{busy === 'twitter' ? 'Connecting…' : 'Continue with X'}</strong><small>Public identity and distribution</small></span>
              </button>
            </div>
            {!availableProviders.github && !availableProviders.twitter && (
              <div className="auth-dialog-pending">Cloudflare accounts are deployed. OAuth app credentials are the final activation step.</div>
            )}
            {notice && <div className="auth-dialog-error" role="status">{notice}</div>}
            <small className="auth-dialog-terms">Use either provider now. You can securely link the other from your profile later.</small>
          </section>
        </div>
      )}
    </div>
  )
}
