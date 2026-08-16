import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthButton() {
  const { configured, loading, profile, signInWithGitHub, signOut } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)

  if (loading) return <span className="auth-loading">Connecting…</span>

  if (profile) {
    return (
      <div className="auth-viewer">
        <Link to={`/u/${profile.handle}`} className="auth-profile" title={`Open @${profile.handle}`}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile.displayName.charAt(0)}</span>}
          <b>@{profile.handle}</b>
        </Link>
        <button type="button" className="btn btn-ghost auth-signout" onClick={() => void signOut()}>Sign out</button>
      </div>
    )
  }

  const beginSignIn = async () => {
    if (!configured) {
      setNotice('Accounts enter live mode after the BenchLoop backend is provisioned.')
      return
    }
    try {
      await signInWithGitHub()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'GitHub sign-in could not start.')
    }
  }

  return (
    <div className="auth-entry">
      <button type="button" className="btn btn-primary" onClick={() => void beginSignIn()}>Sign in with GitHub</button>
      {notice && <span className="auth-notice" role="status">{notice}</span>}
    </div>
  )
}
