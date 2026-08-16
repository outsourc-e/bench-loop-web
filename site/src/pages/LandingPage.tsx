import { useState } from 'react'
import { Link } from 'react-router-dom'
import AskBox from '../components/AskBox'
import BrandIcon from '../components/BrandIcon'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { hardwareProfiles, sourceLabels, trendItems } from '../data/discovery'

const discoveryTabs = [
  { id: 'for-you', label: 'For you', href: '/' },
  { id: 'news', label: 'News', href: '/news' },
  { id: 'runs', label: 'Latest runs', href: '/runs' },
  { id: 'recipes', label: 'Recipes', href: '/recipes' },
  { id: 'builders', label: 'Builders', href: '/builders' },
]

const modelFamilies = [
  { name: 'Qwen', brand: 'qwen' as const, tone: 'emerald', meta: '86 verified runs', signal: 'Trending on your rigs' },
  { name: 'Llama', brand: 'meta' as const, tone: 'amber', meta: '64 verified runs', signal: '14 new recipes' },
  { name: 'Gemma', brand: 'google' as const, tone: 'blue', meta: '41 verified runs', signal: 'Strong small models' },
  { name: 'DeepSeek', brand: 'deepseek' as const, tone: 'violet', meta: '38 verified runs', signal: 'Coding specialist' },
]

export default function LandingPage() {
  const [rigsVisible, setRigsVisible] = useState(true)

  return (
    <div className="revamp-home">
      <section className="revamp-search-hero">
        <div className="revamp-eyebrow"><span className="live-dot" /> Local AI intelligence, grounded in real runs</div>
        <h1>Find the best model<br /><span>for your hardware.</span></h1>
        <p>
          Search benchmarks, recipes, runtimes, and builder knowledge. Then send the winning setup directly to your local runner.
        </p>
        <AskBox />

        {rigsVisible ? (
          <div className="revamp-rig-bar">
            <div className="revamp-rig-label">Your lab</div>
            {hardwareProfiles.map((rig) => (
              <Link to="/u/eric" className="revamp-rig" key={rig.label}>
                <span className={`revamp-rig-status status-${rig.status}`} />
                <BrandIcon brand={rig.brand} size={14} />
                <strong>{rig.label}</strong>
                <span>{rig.detail}</span>
              </Link>
            ))}
            <button type="button" onClick={() => setRigsVisible(false)}>Not my hardware</button>
          </div>
        ) : (
          <button className="revamp-add-rig" type="button" onClick={() => setRigsVisible(true)}>+ Add your hardware for personalized answers</button>
        )}
      </section>

      <nav className="revamp-discovery-tabs" aria-label="Discovery feeds">
        {discoveryTabs.map((tab) => (
          <Link key={tab.id} to={tab.href} className={tab.id === 'for-you' ? 'active' : ''}>{tab.label}</Link>
        ))}
      </nav>

      <section className="revamp-visual-discovery">
        <Link to="/explore" className="revamp-network-visual card-premium">
          <img src="/benchloop-network-v2.png" alt="Two local AI hardware systems connected by a glowing BenchLoop data loop" />
          <span className="revamp-visual-label"><b>Explore the stack graph</b><small>Models × quants × runtimes × hardware</small></span>
        </Link>
        <div className="revamp-family-panel">
          <div className="revamp-section-head compact">
            <div><span className="revamp-section-kicker">Model families</span><h2>Follow the ecosystem</h2></div>
            <Link to="/explore">All →</Link>
          </div>
          <div className="revamp-family-grid">
            {modelFamilies.map((family) => (
              <Link to={`/ask?q=${encodeURIComponent(`Show me the best ${family.name} models for my hardware`)}`} className={`revamp-family-card tone-${family.tone}`} key={family.name}>
                <div className="revamp-family-mark"><BrandIcon brand={family.brand} size={17} label /><i /><i /><i /></div>
                <div><strong>{family.name}</strong><small>{family.meta}</small></div>
                <em>{family.signal}</em>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="revamp-content-grid">
        <div className="revamp-content-main">
          <div className="revamp-section-head">
            <div>
              <span className="revamp-section-kicker">Personalized signal</span>
              <h2>Your local AI briefing</h2>
            </div>
            <Link to="/explore">View all →</Link>
          </div>
          <DiscoveryFeed limit={4} />
        </div>

        <aside className="revamp-rail">
          <section className="revamp-rail-card card">
            <div className="revamp-rail-title">
              <span>Trending locally</span>
              <small>24h</small>
            </div>
            <div className="revamp-trends">
              {trendItems.map((trend, index) => (
                <Link to="/explore" key={trend.label}>
                  <span className="revamp-trend-rank">0{index + 1}</span>
                  <span><strong>{trend.label}</strong><small>{trend.detail}</small></span>
                  <em>{trend.delta}</em>
                </Link>
              ))}
            </div>
          </section>

          <section className="revamp-rail-card revamp-runner-card card-premium">
            <div className="revamp-runner-icon">↻</div>
            <span className="revamp-section-kicker">BenchLoop Runner</span>
            <h3>Turn advice into a verified run.</h3>
            <p>Detect your stack, execute the recipe, measure seven suites, and publish signed results.</p>
            <pre><span>$</span> pipx install benchloop-cli</pre>
            <Link to="/download" className="btn btn-primary">Connect your lab</Link>
          </section>

          <section className="revamp-sources">
            <span>Answers are grounded in</span>
            {sourceLabels.map((source) => <div key={source}>✓ {source}</div>)}
          </section>
        </aside>
      </section>

      <section className="revamp-network-strip card-premium">
        <div>
          <span className="revamp-section-kicker">The flywheel</span>
          <h2>Search it. Run it. Improve it. Share it.</h2>
          <p>Every reproducible run makes the next hardware-aware answer better.</p>
        </div>
        <div className="revamp-network-flow" aria-label="BenchLoop data flywheel">
          <span>Ask</span><b>→</b><span>Recipe</span><b>→</b><span>Runner</span><b>→</b><span>Verified run</span><b>↻</b>
        </div>
      </section>
    </div>
  )
}
