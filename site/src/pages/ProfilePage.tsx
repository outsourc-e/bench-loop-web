import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { useAuth } from '../context/AuthContext'
import { hardwareProfiles } from '../data/discovery'
import { loadProfile, setFollowing, type PublicProfile } from '../lib/community'
import { backendConfigured } from '../lib/backend'

const demoProfile: PublicProfile = {
  id: 'demo-eric',
  handle: 'eric',
  displayName: 'Eric',
  bio: 'Testing the edge of local AI on Apple Silicon and consumer NVIDIA. Speed counts only when the model can still do the work.',
  avatarUrl: null,
  githubUrl: 'https://github.com/outsourc-e',
  xUrl: null,
  websiteUrl: null,
  stats: { runs: 12, recipes: 4, rigs: 2, followers: 318 },
  rigs: hardwareProfiles.map((rig, index) => ({ id: index + 1, name: rig.label, hardwareLabel: rig.detail, status: rig.status })),
  viewerFollows: false,
}

export default function ProfilePage() {
  const { handle = 'eric' } = useParams()
  const { configured, user, profile: viewerProfile, signInWithGitHub } = useAuth()
  const [profile, setProfile] = useState<PublicProfile | null>(backendConfigured ? null : { ...demoProfile, handle })
  const [loading, setLoading] = useState(backendConfigured)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!backendConfigured) return
    setLoading(true)
    try {
      const loaded = await loadProfile(handle, user?.id)
      setProfile(loaded || (handle.toLowerCase() === 'eric' ? { ...demoProfile, handle } : null))
      setNotice(null)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'This builder profile could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [handle, user?.id])

  useEffect(() => { void refresh() }, [refresh])

  const toggleFollow = async () => {
    if (!profile) return
    if (!user) {
      if (!configured) {
        setNotice('Following turns on with the live BenchLoop backend.')
        return
      }
      await signInWithGitHub()
      return
    }
    const next = !profile.viewerFollows
    setProfile({ ...profile, viewerFollows: next, stats: { ...profile.stats, followers: Math.max(0, profile.stats.followers + (next ? 1 : -1)) } })
    try {
      await setFollowing(user.id, profile.id, next)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Follow status could not be saved.')
      await refresh()
    }
  }

  if (loading) return <section className="revamp-empty card-premium"><span className="page-kicker">Loading builder</span></section>
  if (!profile) {
    return <section className="revamp-empty card-premium"><span className="page-kicker">Builder</span><h1>@{handle} is not in the loop yet.</h1><p>{notice || 'Search for another builder or start your own lab profile.'}</p><Link to="/builders" className="btn btn-primary">Explore builders</Link></section>
  }

  const isViewer = user?.id === profile.id || viewerProfile?.handle === profile.handle

  return (
    <div className="revamp-profile">
      <section className="revamp-profile-hero card-premium">
        <div className="revamp-avatar">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : profile.displayName.charAt(0)}
        </div>
        <div className="revamp-profile-copy">
          <div className="revamp-profile-name">
            <div><h1>{profile.displayName}</h1><span>@{profile.handle}</span></div>
            {isViewer
              ? <Link to="/settings" className="btn btn-secondary">Edit profile</Link>
              : <button type="button" className={`btn ${profile.viewerFollows ? 'btn-secondary' : 'btn-primary'}`} onClick={() => void toggleFollow()}>{profile.viewerFollows ? 'Following' : 'Follow'}</button>}
          </div>
          <p>{profile.bio || 'Building and benchmarking local AI in public.'}</p>
          <div className="revamp-profile-links">
            {profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noreferrer">GitHub ↗</a>}
            {profile.xUrl && <a href={profile.xUrl} target="_blank" rel="noreferrer">X ↗</a>}
            {profile.websiteUrl && <a href={profile.websiteUrl} target="_blank" rel="noreferrer">Website ↗</a>}
          </div>
          <div className="revamp-profile-stats"><span><strong>{profile.stats.runs}</strong> runs</span><span><strong>{profile.stats.recipes}</strong> recipes</span><span><strong>{profile.stats.rigs}</strong> rigs</span><span><strong>{profile.stats.followers}</strong> followers</span></div>
          {notice && <div className="feed-inline-notice" role="status">{notice}</div>}
        </div>
      </section>

      <section className="revamp-profile-grid">
        <div>
          <nav className="revamp-profile-tabs"><button className="active">Overview</button><button>Runs</button><button>Recipes</button><button>Posts</button></nav>
          <DiscoveryFeed limit={12} authorHandle={profile.handle} composer={isViewer} />
        </div>
        <aside className="revamp-rail">
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Hardware lab</span><small>{profile.rigs.length} saved</small></div>
            <div className="revamp-hardware-list">
              {profile.rigs.map((rig) => (
                <div key={rig.id}><span className={`revamp-rig-status status-${rig.status}`} /><span><strong>{rig.name}</strong><small>{rig.hardwareLabel}</small></span></div>
              ))}
              {!profile.rigs.length && <p className="profile-empty-rigs">No public rigs yet.</p>}
            </div>
            <Link to={`/ask?q=${encodeURIComponent(`What should @${profile.handle} run next?`)}`} className="btn btn-secondary">Ask about this lab</Link>
          </section>
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Stack specialties</span></div>
            <div className="revamp-tags large"><span>Local AI</span><span>Benchmarks</span><span>Recipes</span><span>Open source</span></div>
          </section>
        </aside>
      </section>
    </div>
  )
}
