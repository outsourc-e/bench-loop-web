import { Link, useSearchParams } from 'react-router-dom'
import AskBox from '../components/AskBox'
import BrandIcon from '../components/BrandIcon'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { hardwareProfiles, trendItems, type FeedKind } from '../data/discovery'

type ExploreMode = 'ask' | 'feed' | 'news' | 'runs' | 'recipes' | 'builders'

const modeCopy: Record<Exclude<ExploreMode, 'ask'>, { eyebrow: string; title: string; body: string; filter: FeedKind | 'all' }> = {
  feed: {
    eyebrow: 'Explore',
    title: 'The local AI signal feed',
    body: 'Verified runs, useful recipes, runtime changes, and builder reports in one place.',
    filter: 'all',
  },
  news: {
    eyebrow: 'News',
    title: 'What changed in local AI',
    body: 'Model releases and runtime changes ranked by what they mean for real hardware.',
    filter: 'news',
  },
  runs: {
    eyebrow: 'Latest runs',
    title: 'Fresh receipts from real hardware',
    body: 'Reproducible results with model, quant, runtime, flags, hardware, and quality attached.',
    filter: 'run',
  },
  recipes: {
    eyebrow: 'Recipes',
    title: 'Setups worth reproducing',
    body: 'Copyable runtime configurations backed by benchmark evidence—not mystery screenshots.',
    filter: 'recipe',
  },
  builders: {
    eyebrow: 'Builders',
    title: 'People moving local AI forward',
    body: 'Follow quantizers, runtime maintainers, hardware tuners, and benchmark obsessives.',
    filter: 'post',
  },
}

export default function ExplorePage({ mode }: { mode: ExploreMode }) {
  const [params] = useSearchParams()
  const query = params.get('q') || 'What is the best Qwen3.8-27B setup for my hardware?'

  if (mode === 'ask') return <AnswerPage query={query} />

  const copy = modeCopy[mode]
  return (
    <div className="revamp-directory">
      <div className="revamp-directory-head">
        <span className="revamp-section-kicker">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <AskBox compact />
      </div>
      <div className="revamp-directory-grid">
        <DiscoveryFeed filter={copy.filter} />
        <aside className="revamp-rail">
          <div className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Active filters</span></div>
            <div className="revamp-filter-stack">
              <button className="active">Your hardware</button>
              <button>Quality 60+</button>
              <button>Verified only</button>
              <button>Last 30 days</button>
            </div>
          </div>
          <div className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Trending</span><small>24h</small></div>
            <div className="revamp-trends compact">
              {trendItems.slice(0, 3).map((trend, index) => (
                <Link to="/explore" key={trend.label}>
                  <span className="revamp-trend-rank">0{index + 1}</span>
                  <span><strong>{trend.label}</strong><small>{trend.detail}</small></span>
                  <em>{trend.delta}</em>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function AnswerPage({ query }: { query: string }) {
  return (
    <div className="revamp-answer-page">
      <AskBox initialValue={query} compact />
      <div className="revamp-answer-layout">
        <article className="revamp-answer card-premium">
          <div className="revamp-answer-meta">
            <span className="live-dot" /> Answered from 12 verified runs, 4 recipes, and 5 primary sources
          </div>
          <h1>{query}</h1>
          <div className="revamp-answer-copy">
            <p>
              <strong>Use two different winners.</strong> Your RTX 4090 is the throughput machine; your M2 Max is the high-memory, low-friction daily driver. System RAM and unified memory expand what fits, but they do not replace bandwidth or GPU-native kernels.
            </p>
            <div className="revamp-recommendation">
              <div className="revamp-rec-rank">01</div>
              <div>
                <span>RTX 4090 · fastest verified setup</span>
                <h3>UD-Q4_K_XL + llama.cpp CUDA + native MTP</h3>
                <p>Full GPU offload, Flash Attention, quantized KV, one sequence, MTP depth 2–4. Your steady run reached 79.3 tok/s and coding prompts peaked near 97 tok/s.</p>
                <div className="revamp-rec-metrics"><b>79.3 tok/s steady</b><b>93.8 coding</b><b>~22.8 GB VRAM</b></div>
                <Link to="/recipes/qwen38-4090-mtp4" className="btn btn-primary">Open exact recipe</Link>
              </div>
            </div>
            <div className="revamp-recommendation">
              <div className="revamp-rec-rank">02</div>
              <div>
                <span>M2 Max 96 GB · best daily driver</span>
                <h3>MLX oQ4e + native two-token MTP path</h3>
                <p>Your optimized MLX run held 26.3 tok/s with a 76.5 quality score and a perfect agent-suite score. Keep BF16 as the reference, not the daily runtime.</p>
                <div className="revamp-rec-metrics"><b>26.3 tok/s</b><b>76.5 quality</b><b>100 agent</b></div>
                <Link to="/runs" className="btn btn-secondary">Inspect Mac run</Link>
              </div>
            </div>
            <div className="revamp-caveat">
              <strong>What to test next</strong>
              <p>Run the same prompt corpus at 4K, 32K, and 128K; report fresh-prompt decode, acceptance rate, TTFT, peak memory, and quality together. A speed claim without those fields should not enter the verified leaderboard.</p>
            </div>
          </div>
          <div className="revamp-answer-actions">
            <button type="button">↻ Test both on my rigs</button>
            <button type="button">＋ Save comparison</button>
            <button type="button">↗ Share answer</button>
          </div>
        </article>

        <aside className="revamp-rail">
          <div className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Your hardware</span><Link to="/u/eric">Edit</Link></div>
            <div className="revamp-hardware-list">
              {hardwareProfiles.map((rig) => (
                <div key={rig.label}><span className={`revamp-rig-status status-${rig.status}`} /><BrandIcon brand={rig.brand} size={18} /><span><strong>{rig.label}</strong><small>{rig.detail}</small></span></div>
              ))}
            </div>
          </div>
          <div className="revamp-rail-card card">
            <div className="revamp-rail-title"><span>Evidence</span><small>21 items</small></div>
            <ol className="revamp-evidence">
              <li><span>Run</span> Qwen3.8 dual-rig benchmark <b>verified</b></li>
              <li><span>Recipe</span> llama.cpp native MTP flags <b>reproduced</b></li>
              <li><span>Model</span> Qwen3.8-27B model card <b>primary</b></li>
              <li><span>Runtime</span> MLX MTP implementation <b>primary</b></li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}
