import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useSearchParams } from 'react-router-dom'
import AskBox from '../components/AskBox'
import BrandIcon from '../components/BrandIcon'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { hardwareProfiles, trendItems, type FeedKind } from '../data/discovery'
import { useAsk, type AskEvidence } from '../hooks/useAsk'

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
        <DiscoveryFeed filter={copy.filter} composer={mode === 'feed'} />
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
  const ask = useAsk(query)
  const [shared, setShared] = useState(false)

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `Ask Loop: ${query}`, url })
      else await navigator.clipboard.writeText(url)
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    } catch {
      // Dismissing the native share sheet needs no error state.
    }
  }

  return (
    <div className="revamp-answer-page">
      <AskBox initialValue={query} compact />
      <div className="revamp-answer-layout">
        <article className="revamp-answer card-premium">
          <h1>{query}</h1>
          {ask.status === 'loading' && <AnswerLoading />}
          {ask.status === 'error' && (
            <div className="revamp-answer-error">
              <span>Ask Loop hit a snag</span>
              <p>{ask.error}</p>
              <button type="button" className="btn btn-primary" onClick={ask.retry}>Try again</button>
            </div>
          )}
          {ask.status === 'success' && (
            <>
              <div className="revamp-answer-meta">
                <span className={ask.data.research.live ? 'live-dot' : 'offline-dot'} />
                {ask.data.research.live ? 'Live web + X research' : 'BenchLoop evidence mode'}
                <i>·</i> {ask.data.evidence.length} matching runs
                <i>·</i> {ask.data.citations.length} sources
                {ask.data.research.cache_hit && <><i>·</i> cached</>}
              </div>
              {ask.data.notice && <div className="revamp-answer-notice">{ask.data.notice}</div>}
              <div className="revamp-answer-copy revamp-answer-markdown">
                <ReactMarkdown
                  components={{
                    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
                  }}
                >{ask.data.answer}</ReactMarkdown>
              </div>
              <div className="revamp-answer-actions">
                <Link to="/download">↓ Run the benchmark</Link>
                <Link to="/runs">⌁ Explore all runs</Link>
                <button type="button" onClick={share}>{shared ? '✓ Link copied' : '↗ Share answer'}</button>
              </div>
            </>
          )}
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
          {ask.status === 'success' && <EvidenceRail evidence={ask.data.evidence} citations={ask.data.citations} />}
        </aside>
      </div>
    </div>
  )
}

function AnswerLoading() {
  return (
    <div className="revamp-answer-loading" aria-live="polite">
      <div className="revamp-answer-meta"><span className="live-dot" /> Searching BenchLoop, the web, and X…</div>
      <div className="revamp-loading-line wide" />
      <div className="revamp-loading-line" />
      <div className="revamp-loading-line medium" />
      <div className="revamp-loading-block" />
      <p>Matching measured runs first, then checking current runtime and model sources.</p>
    </div>
  )
}

function EvidenceRail({ evidence, citations }: {
  evidence: AskEvidence[]
  citations: Array<{ url: string; title: string }>
}) {
  return (
    <>
      <div className="revamp-rail-card card">
        <div className="revamp-rail-title"><span>Matched runs</span><small>{evidence.length}</small></div>
        {evidence.length === 0 ? <p className="revamp-rail-empty">No exact benchmark matches yet.</p> : (
          <ol className="revamp-evidence">
            {evidence.slice(0, 6).map((run) => (
              <li key={run.id}>
                <a href={run.source_url} target="_blank" rel="noreferrer">
                  <span>Run</span> {run.model}
                  <b>{run.hardware}{run.generation_tok_per_sec == null ? '' : ` · ${run.generation_tok_per_sec.toFixed(1)} tok/s`}</b>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="revamp-rail-card card">
        <div className="revamp-rail-title"><span>Live sources</span><small>{citations.length}</small></div>
        {citations.length === 0 ? <p className="revamp-rail-empty">No external sources used.</p> : (
          <ol className="revamp-evidence revamp-citations">
            {citations.slice(0, 8).map((citation, index) => (
              <li key={`${citation.url}-${index}`}>
                <a href={citation.url} target="_blank" rel="noreferrer">
                  <span>{String(index + 1).padStart(2, '0')}</span> {citation.title}
                  <b>{new URL(citation.url).hostname.replace(/^www\./, '')}</b>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}
