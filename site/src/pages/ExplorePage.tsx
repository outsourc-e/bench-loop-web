import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AskBox from '../components/AskBox'
import BrandIcon from '../components/BrandIcon'
import DiscoveryFeed from '../components/DiscoveryFeed'
import { hardwareProfiles, trendItems, type FeedKind } from '../data/discovery'
import { useAskThread, type AskEvidence, type AskResponse } from '../hooks/useAsk'

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
  const query = params.get('q')

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

function AnswerPage({ query }: { query: string | null }) {
  const thread = useAskThread(query)
  const [shared, setShared] = useState(false)
  const navigate = useNavigate()
  const bottomRef = useRef<HTMLDivElement>(null)
  const latestResponse = [...thread.turns].reverse().find((turn) => turn.response)?.response

  useEffect(() => {
    if (thread.turns.length > 1) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [thread.turns])

  const share = async () => {
    const firstQuery = thread.turns[0]?.query || 'Ask Loop'
    const url = thread.turns[0] ? `${window.location.origin}/ask?q=${encodeURIComponent(firstQuery)}` : window.location.href
    try {
      if (navigator.share) await navigator.share({ title: `Ask Loop: ${firstQuery}`, url })
      else await navigator.clipboard.writeText(url)
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    } catch {
      // Dismissing the native share sheet needs no error state.
    }
  }

  const newThread = () => {
    thread.reset()
    navigate('/ask', { replace: true })
  }

  return (
    <div className="revamp-answer-page">
      <div className="revamp-thread-toolbar">
        <div>
          <span className="live-dot" />
          <span><strong>Ask Loop</strong><small>{thread.turns.length ? `${thread.turns.length} turn${thread.turns.length === 1 ? '' : 's'} · saved in this tab` : 'new research thread'}</small></span>
        </div>
        <button type="button" onClick={newThread}>＋ New thread</button>
      </div>
      <div className="revamp-answer-layout">
        <article className="revamp-answer revamp-thread card-premium">
          {thread.turns.length === 0 && (
            <div className="revamp-thread-empty">
              <span className="revamp-section-kicker">New thread</span>
              <h1>What should we optimize?</h1>
              <p>Ask about a model, quant, runtime, benchmark result, or the best setup for your hardware.</p>
              <div className="revamp-thread-prompts">
                {['Best model for my 4090', 'Fastest coding setup on M2 Max', 'Compare MLX vs llama.cpp'].map((prompt) => (
                  <button type="button" key={prompt} onClick={() => thread.send(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>
          )}
          {thread.turns.map((turn, index) => (
            <section className="revamp-thread-turn" key={turn.id}>
              <div className="revamp-thread-user">
                <span>You</span>
                <p>{turn.query}</p>
              </div>
              <div className="revamp-thread-assistant">
                <div className="revamp-loop-avatar" aria-hidden="true">✦</div>
                <div className="revamp-thread-assistant-body">
                  {turn.status === 'loading' && <AnswerLoading />}
                  {turn.status === 'error' && (
                    <div className="revamp-answer-error">
                      <span>Ask Loop hit a snag</span>
                      <p>{turn.error}</p>
                      <button type="button" className="btn btn-primary" onClick={() => thread.retry(turn.id)}>Try again</button>
                    </div>
                  )}
                  {turn.response && (
                    <ThreadAnswer
                      response={turn.response}
                      latest={index === thread.turns.length - 1}
                      shared={shared}
                      onShare={share}
                    />
                  )}
                </div>
              </div>
            </section>
          ))}
          <div className="revamp-thread-composer">
            <span>{thread.turns.length ? 'Ask a follow-up' : 'Start the thread'}</span>
            <AskBox
              compact
              clearAfterSubmit
              disabled={thread.pending}
              onAsk={thread.send}
              placeholder={thread.turns.length ? 'Ask a follow-up using this context…' : 'Ask Loop about your local AI stack…'}
              submitLabel={thread.pending ? 'Researching' : 'Send'}
            />
            <small>Recent context stays in this tab. Research questions may take 30–90 seconds.</small>
          </div>
          <div ref={bottomRef} />
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
          {latestResponse && (latestResponse.evidence.length > 0 || latestResponse.citations.length > 0) && (
            <EvidenceRail evidence={latestResponse.evidence} citations={latestResponse.citations} />
          )}
        </aside>
      </div>
    </div>
  )
}

function ThreadAnswer({ response, latest, shared, onShare }: {
  response: AskResponse
  latest: boolean
  shared: boolean
  onShare: () => void
}) {
  const isGreeting = response.model === 'Loop'
  return (
    <>
      <div className="revamp-answer-meta">
        <span className={response.research.live ? 'live-dot' : 'offline-dot'} />
        {isGreeting ? 'Loop ready' : response.research.live ? 'Live web + X research' : 'BenchLoop evidence mode'}
        {response.evidence.length > 0 && <><i>·</i> {response.evidence.length} matching runs</>}
        {response.citations.length > 0 && <><i>·</i> {response.citations.length} sources</>}
        {response.research.cache_hit && <><i>·</i> cached</>}
      </div>
      {response.notice && <div className="revamp-answer-notice">{response.notice}</div>}
      <div className="revamp-answer-copy revamp-answer-markdown">
        <ReactMarkdown
          components={{
            a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          }}
        >{response.answer}</ReactMarkdown>
      </div>
      {latest && (
        <div className="revamp-answer-actions">
          <Link to="/download">↓ Run the benchmark</Link>
          <Link to="/runs">⌁ Explore all runs</Link>
          <button type="button" onClick={onShare}>{shared ? '✓ Link copied' : '↗ Share first question'}</button>
        </div>
      )}
    </>
  )
}

function AnswerLoading() {
  return (
    <div className="revamp-answer-loading in-thread" aria-live="polite">
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
