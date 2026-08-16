import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BrandIcon from '../components/BrandIcon'
import { useAuth, type AuthProviderId, type ViewerProfile } from '../context/AuthContext'
import { apiFetch } from '../lib/backend'

type Rig = {
  id: number
  name: string
  hardware_label: string
  visibility: string
}

type Runner = {
  id: number
  name: string
  paired_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

type ProfileForm = Pick<ViewerProfile, 'handle' | 'displayName' | 'bio' | 'githubUrl' | 'xUrl' | 'websiteUrl'>

function profileForm(profile: ViewerProfile): ProfileForm {
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    githubUrl: profile.githubUrl,
    xUrl: profile.xUrl,
    websiteUrl: profile.websiteUrl,
  }
}

export default function AccountPage() {
  const { user, profile, loading, availableProviders, linkedProviders, signInWithGitHub, linkProvider, refreshAccount } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<ProfileForm | null>(profile ? profileForm(profile) : null)
  const [rigs, setRigs] = useState<Rig[]>([])
  const [runners, setRunners] = useState<Runner[]>([])
  const [rigName, setRigName] = useState('')
  const [hardwareLabel, setHardwareLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { if (profile) setForm(profileForm(profile)) }, [profile])

  const loadLab = async () => {
    const [rigData, runnerData] = await Promise.all([
      apiFetch<{ rigs: Rig[] }>('/account/rigs'),
      apiFetch<{ runners: Runner[] }>('/account/runners'),
    ])
    setRigs(rigData.rigs)
    setRunners(runnerData.runners)
  }

  useEffect(() => {
    if (!user) return
    void loadLab().catch(() => setNotice('Your lab inventory could not be loaded.'))
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !profile) return
    setBusy('profile')
    setNotice(null)
    try {
      await apiFetch('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ ...form, onboardingComplete: true }),
      })
      await refreshAccount()
      setNotice('Profile saved to Cloudflare D1.')
      if (form.handle !== profile.handle) navigate('/settings', { replace: true })
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Profile changes could not be saved.')
    } finally {
      setBusy(null)
    }
  }

  const addRig = async (event: FormEvent) => {
    event.preventDefault()
    if (!rigName.trim() || !hardwareLabel.trim()) return
    setBusy('rig')
    setNotice(null)
    try {
      await apiFetch('/account/rigs', {
        method: 'POST',
        body: JSON.stringify({ name: rigName, hardwareLabel, visibility: 'public' }),
      })
      setRigName('')
      setHardwareLabel('')
      await loadLab()
      setNotice('Hardware rig added.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'That rig could not be added.')
    } finally {
      setBusy(null)
    }
  }

  const connectProvider = async (provider: AuthProviderId) => {
    setBusy(provider)
    setNotice(null)
    try {
      await linkProvider(provider, window.location.href)
    } catch (cause) {
      setBusy(null)
      setNotice(cause instanceof Error ? cause.message : 'That account could not be linked.')
    }
  }

  const revoke = async (runner: Runner) => {
    setBusy(`runner-${runner.id}`)
    try {
      await apiFetch(`/account/runners/${runner.id}`, { method: 'DELETE' })
      await loadLab()
      setNotice(`${runner.name} was revoked.`)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Runner could not be revoked.')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <section className="revamp-empty card-premium"><span className="page-kicker">Loading account</span></section>
  if (!user || !profile || !form) {
    return (
      <section className="revamp-empty card-premium">
        <span className="page-kicker">Cloudflare account</span>
        <h1>Sign in to manage your lab.</h1>
        <p>Your profile, rigs, Runner devices, and Ask Loop threads live behind your account.</p>
        <button type="button" className="btn btn-primary" onClick={() => void signInWithGitHub(window.location.href)}>Sign in</button>
      </section>
    )
  }

  return (
    <div className="account-page">
      <header className="account-heading">
        <span className="page-kicker">Your local AI identity</span>
        <h1>Account + lab</h1>
        <p>Manage what the community sees and which local machines can publish verified receipts.</p>
        <Link to={`/u/${profile.handle}`} className="btn btn-secondary">View public profile</Link>
      </header>

      {notice && <div className="account-notice" role="status">{notice}</div>}

      <div className="account-grid">
        <form className="account-panel card-premium" onSubmit={(event) => void saveProfile(event)}>
          <div className="account-panel-head"><div><span>Profile</span><h2>@{profile.handle}</h2></div><small>Stored in D1</small></div>
          <label>Display name<input value={form.displayName} maxLength={80} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label>Handle<input value={form.handle} maxLength={30} pattern="[a-z0-9][a-z0-9_-]{1,29}" onChange={(event) => setForm({ ...form, handle: event.target.value.toLowerCase() })} /></label>
          <label>Bio<textarea value={form.bio} maxLength={500} rows={4} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
          <div className="account-form-row">
            <label>GitHub URL<input type="url" value={form.githubUrl || ''} onChange={(event) => setForm({ ...form, githubUrl: event.target.value || null })} /></label>
            <label>X URL<input type="url" value={form.xUrl || ''} onChange={(event) => setForm({ ...form, xUrl: event.target.value || null })} /></label>
          </div>
          <label>Website<input type="url" value={form.websiteUrl || ''} onChange={(event) => setForm({ ...form, websiteUrl: event.target.value || null })} /></label>
          <button className="btn btn-primary" type="submit" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
        </form>

        <section className="account-panel card-premium">
          <div className="account-panel-head"><div><span>Linked identity</span><h2>GitHub + X</h2></div><small>Encrypted OAuth tokens</small></div>
          {(['github', 'twitter'] as AuthProviderId[]).map((provider) => {
            const linked = linkedProviders.includes(provider)
            const enabled = availableProviders[provider]
            return (
              <div className="account-provider" key={provider}>
                <BrandIcon brand={provider === 'twitter' ? 'x' : 'github'} size={22} />
                <span><strong>{provider === 'twitter' ? 'X' : 'GitHub'}</strong><small>{linked ? 'Linked to this profile' : enabled ? 'Available to link' : 'OAuth app pending'}</small></span>
                <button type="button" className="btn btn-secondary" disabled={linked || !enabled || busy !== null} onClick={() => void connectProvider(provider)}>{linked ? 'Linked' : 'Link'}</button>
              </div>
            )
          })}
        </section>

        <section className="account-panel card-premium">
          <div className="account-panel-head"><div><span>Hardware</span><h2>Your rigs</h2></div><small>{rigs.length} saved</small></div>
          <div className="account-list">
            {rigs.map((rig) => <div key={rig.id}><span className="live-dot" /><span><strong>{rig.name}</strong><small>{rig.hardware_label}</small></span><em>{rig.visibility}</em></div>)}
            {!rigs.length && <p>No rigs yet. Add one manually or connect the Runner.</p>}
          </div>
          <form className="account-inline-form" onSubmit={(event) => void addRig(event)}>
            <input value={rigName} maxLength={80} onChange={(event) => setRigName(event.target.value)} placeholder="Rig name" aria-label="Rig name" />
            <input value={hardwareLabel} maxLength={200} onChange={(event) => setHardwareLabel(event.target.value)} placeholder="M2 Max · 96 GB" aria-label="Hardware description" />
            <button className="btn btn-secondary" type="submit" disabled={busy === 'rig'}>{busy === 'rig' ? 'Adding…' : 'Add rig'}</button>
          </form>
        </section>

        <section className="account-panel card-premium">
          <div className="account-panel-head"><div><span>Publishing access</span><h2>Connected Runners</h2></div><Link to="/download">Connect another</Link></div>
          <div className="account-list">
            {runners.map((runner) => (
              <div key={runner.id} className={runner.revoked_at ? 'is-revoked' : ''}>
                <span className={runner.revoked_at ? 'offline-dot' : 'live-dot'} />
                <span><strong>{runner.name}</strong><small>{runner.revoked_at ? 'Revoked' : runner.last_seen_at ? 'Active recently' : 'Paired'}</small></span>
                {!runner.revoked_at && <button type="button" onClick={() => void revoke(runner)} disabled={busy === `runner-${runner.id}`}>Revoke</button>}
              </div>
            ))}
            {!runners.length && <p>No paired Runner devices yet.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
