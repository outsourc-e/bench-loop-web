import { Link, useParams } from 'react-router-dom'
import BrandIcon from '../components/BrandIcon'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { hardwareProfiles } from '../data/discovery'

export default function ProfilePage() {
  const { handle = 'eric' } = useParams()

  return (
    <div className="revamp-profile">
      <section className="revamp-profile-hero card-premium">
        <div className="revamp-avatar">E</div>
        <div className="revamp-profile-copy">
          <div className="revamp-profile-name"><div><h1>Eric</h1><span>@{handle}</span></div><button type="button" className="btn btn-primary">Follow</button></div>
          <p>Testing the edge of local AI on Apple Silicon and consumer NVIDIA. Speed counts only when the model can still do the work.</p>
          <div className="revamp-profile-stats"><span><strong>12</strong> runs</span><span><strong>4</strong> recipes</span><span><strong>2</strong> rigs</span><span><strong>318</strong> followers</span></div>
        </div>
      </section>

      <section className="revamp-profile-grid">
        <div>
          <nav className="revamp-profile-tabs"><button className="active">Overview</button><button>Runs</button><button>Recipes</button><button>Posts</button></nav>
          <DiscoveryFeed limit={3} />
        </div>
        <aside className="revamp-rail">
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Hardware lab</span><small>2 online</small></div>
            <div className="revamp-hardware-list">
              {hardwareProfiles.map((rig) => (
                <div key={rig.label}><span className={`revamp-rig-status status-${rig.status}`} /><BrandIcon brand={rig.brand} size={18} /><span><strong>{rig.label}</strong><small>{rig.detail}</small></span></div>
              ))}
            </div>
            <Link to="/ask?q=What+should+Eric+run+next%3F" className="btn btn-secondary">Ask about this lab</Link>
          </section>
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Stack specialties</span></div>
            <div className="revamp-tags large"><span>MLX</span><span>llama.cpp</span><span>MTP</span><span>Qwen</span><span>RTX 4090</span></div>
          </section>
        </aside>
      </section>
    </div>
  )
}
