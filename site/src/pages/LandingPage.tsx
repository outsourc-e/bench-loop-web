import { Link } from 'react-router-dom'
import { useLeaderboard, type PublicRun } from '../hooks/useLeaderboard'
import CliInstall from '../components/CliInstall'
import LoopLogo from '../components/LoopLogo'
import { hasMeaningfulQuality, machineLabel, providerLabel, publisherLabel, scoreOf } from '../lib/leaderboard'

const featureCards = [
  {
    title: 'Quality + speed in one loop',
    body: 'Fixed suites for tool use, coding, extraction, instruction following, reasoning, and raw throughput. No more cherry-picked screenshots.',
    icon: '↻',
  },
  {
    title: 'Local-first by default',
    body: 'Works against Ollama, LM Studio, MLX / Osaurus, vLLM, Jan, and any OpenAI-compatible endpoint. Your hardware, your runs.',
    icon: '⌂',
  },
  {
    title: 'Harness comparisons',
    body: 'Same model, four prompting contracts: raw, Hermes, Qwen, and Pi-style. See which harness actually wins.',
    icon: '⚖',
  },
  {
    title: 'Receipts, not vibes',
    body: 'Every run is persisted with per-task outputs, latency, token counts, machine info, and scores. Built for blog posts and bug reports.',
    icon: '◆',
  },
]

const howSteps: { num: string; title: string; body: string; code?: string }[] = [
  {
    num: '01',
    title: 'Install the CLI',
    body: 'One pipx command. No Docker, no API keys, no signup.',
    code: 'pipx install benchloop-cli',
  },
  {
    num: '02',
    title: 'Run the loop',
    body: 'Point at any local endpoint — Ollama, LM Studio, MLX, vLLM. Seven suites, one run.',
    code: 'benchloop run --model qwen3:8b',
  },
  {
    num: '03',
    title: 'Compare + publish',
    body: 'Every completed run auto-publishes to the public leaderboard with your optional profile name, avatar, and hardware context.',
    code: '→ published to https://bench-loop.com/leaderboard',
  },
]

const suiteRows: [string, string][] = [
  ['speed', 'Latency, throughput, TTFT, generation tok/s'],
  ['toolcall', 'Single-shot tool-call correctness across realistic tasks'],
  ['coding', 'Executable Python tasks verified in a sandboxed subprocess'],
  ['dataextract', 'JSON / data extraction from messy text'],
  ['instructfollow', 'Constraint following, formatting, and exactness'],
  ['reasonmath', 'Small reasoning + math tasks with deterministic checks'],
  ['agent', 'Multi-turn agent loop — BenchLoop executes tools and feeds results back'],
]

function featuredRun(runs: PublicRun[], mode: 'overall' | 'tok_per_sec' | 'agent', qualityFloor = 60): PublicRun | null {
  const filtered = runs.filter((run) => hasMeaningfulQuality(run, qualityFloor) && (mode !== 'agent' || (run.agent_score ?? -1) >= 0))
  if (!filtered.length) return null
  return filtered.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode))[0] ?? null
}

export default function LandingPage() {
  const { runs, loading } = useLeaderboard()
  const best = featuredRun(runs, 'overall', 60) ?? runs[0]
  const top = runs.slice(0, 4)
  const bestOverall = featuredRun(runs, 'overall', 60)
  const fastestUsable = featuredRun(runs, 'tok_per_sec', 60)
  const bestAgent = featuredRun(runs, 'agent', 60)
  const featuredPublishers = runs
    .filter((run, index, list) => {
      const label = publisherLabel(run)
      return label !== 'anonymous' && list.findIndex((entry) => publisherLabel(entry) === label) === index
    })
    .slice(0, 5)

  return (
    <div className="landing-page">
      <section className="landing-hero card-premium">
        <div className="aurora-orb" aria-hidden="true" />
        <div className="landing-hero-copy">
          <div className="page-kicker page-kicker-lg">
            <LoopLogo size={18} /> Local LLM benchmark lab
          </div>
          <h1>
            <span className="hero-line-1">Benchmark local models</span>
            <span className="hero-line-2 grad-text">by what actually matters.</span>
          </h1>
          <p className="landing-lede">
            BenchLoop scores quality, speed, reliability, and real agent-loop behavior across repeatable local workloads.
            Stop comparing screenshots and vibes. Run the loop, get the receipts.
          </p>
          <div className="landing-actions">
            <Link to="/download" className="btn btn-primary btn-lg">
              Install BenchLoop <span aria-hidden="true">→</span>
            </Link>
            <Link to="/leaderboard" className="btn btn-secondary btn-lg">View leaderboard</Link>
          </div>
          <div className="landing-trust-row">
            <small>Plays nice with</small>
            <span>Ollama</span>
            <span>LM Studio</span>
            <span>MLX / Osaurus</span>
            <span>vLLM</span>
            <span>Jan</span>
            <span>OpenAI-compatible</span>
          </div>
        </div>

        <div className="hero-terminal" aria-label="BenchLoop preview">
          <div className="terminal-topbar">
            <span /> <span /> <span />
            <strong>benchloop run</strong>
          </div>
          <div className="terminal-body">
            <div className="terminal-line muted">$ benchloop run --model</div>
            <div className="terminal-line model">{best?.model || 'qwen3:8b'}</div>
            <div className="terminal-grid">
              <Metric label="Overall" value={best?.overall_score?.toFixed(1) || '72.9'} tone="green" />
              <Metric label="Quality" value={best?.quality_score?.toFixed(1) || '73.6'} />
              <Metric label="Speed" value={best?.speed_score?.toFixed(1) || '78.9'} />
              <Metric label="Tok/s" value={best?.generation_tok_per_sec?.toFixed(1) || '74.6'} />
            </div>
            <div className="terminal-progress"><span style={{ width: '83%' }} /></div>
            <div className="terminal-foot">
              <span className="dot live" /> 7 suites · {best?.harness || 'raw'} harness · quality floor 60+ on the public board
            </div>
          </div>
        </div>
      </section>

      <section className="metric-grid metric-grid-tight">
        <Stat label="Runs indexed" value={loading ? '…' : String(runs.length)} />
        <Stat label="Full benchmarks" value={loading ? '…' : String(runs.filter((r) => r.is_full_benchmark).length)} />
        <Stat label="Best overall" value={bestOverall ? bestOverall.overall_score.toFixed(1) : '—'} />
        <Stat label="Top model" value={best ? best.model.split('/').pop() || best.model : '—'} compact />
      </section>

      <section>
        <div className="page-header">
          <div>
            <div className="page-kicker">Why this board is different</div>
            <h2 className="page-title">Fast is nice. Useful is the point.</h2>
            <p className="page-subtitle">
              Localmaxxing-style speed charts are fun, but if a model is spitting gibberish at 200 tok/s it should not win. BenchLoop keeps quality, reliability, and agent behavior in the loop.
            </p>
          </div>
        </div>
        <div className="lb-highlights-grid">
          <FeaturedRunCard
            title="Best overall"
            blurb="The run you would actually want to copy."
            run={bestOverall}
            stat={bestOverall ? `${bestOverall.overall_score.toFixed(1)} overall` : '—'}
          />
          <FeaturedRunCard
            title="Fastest usable"
            blurb="Raw tok/s, but only after clearing a quality floor."
            run={fastestUsable}
            stat={fastestUsable ? `${fastestUsable.generation_tok_per_sec.toFixed(1)} tok/s` : '—'}
          />
          <FeaturedRunCard
            title="Best agent loop"
            blurb="Multi-turn agent tasks — models must actually execute tools and complete the job, not just generate plausible text."
            run={bestAgent}
            stat={bestAgent?.agent_score != null ? `${bestAgent.agent_score.toFixed(1)} agent` : '—'}
            emptyMessage="Waiting for agent suite runs. The CLI agent tasks verify multi-turn tool use and task completion."
          />
        </div>
      </section>

      <section>
        <div className="page-header">
          <div>
            <div className="page-kicker">How it works</div>
            <h2 className="page-title">Three steps. One repeatable run.</h2>
            <p className="page-subtitle">
              No accounts. No telemetry. Your benchmark, your hardware, your numbers.
            </p>
          </div>
        </div>
        <div className="how-grid">
          {howSteps.map((s) => (
            <div key={s.num} className="how-card card">
              <div className="how-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              {s.code && (
                <pre className="how-code"><span className="prompt">$</span>{s.code}</pre>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="page-header">
          <div>
            <div className="page-kicker">Why BenchLoop</div>
            <h2 className="page-title">Built for people tuning real local stacks.</h2>
            <p className="page-subtitle">
              Not a static leaderboard. A repeatable rig for models, hardware, inference backends, and prompt harnesses.
            </p>
          </div>
        </div>
        <div className="feature-grid">
          {featureCards.map((f) => (
            <div key={f.title} className="feature-card card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="split-section">
        <div className="card-premium suite-panel">
          <div className="page-kicker">Suites</div>
          <h2>Seven ways to catch model lies.</h2>
          <p className="page-subtitle">
            Speed alone is how you accidentally crown a toaster. BenchLoop blends quality, reliability, throughput,
            and a real multi-turn agent loop into one comparable run.
          </p>
          <div className="suite-list">
            {suiteRows.map(([name, desc]) => (
              <div key={name} className="suite-row">
                <code>{name}</code>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card preview-card">
          <div className="page-kicker">Live leaderboard</div>
          <div className="preview-note">Default board uses a quality floor so speed-only nonsense does not dominate.</div>
          {top.length === 0 ? (
            <div className="preview-row">
              <span className="preview-rank">—</span>
              <span className="preview-model">No public runs yet.</span>
              <span className="preview-score">…</span>
            </div>
          ) : (
            top.map((r, i) => (
              <div key={r.id} className="preview-row preview-row-rich">
                <span className="preview-rank">#{i + 1}</span>
                <div className="preview-model-wrap">
                  <span className="preview-model">{r.model}</span>
                  <span className="preview-harness">{r.harness || 'raw'} harness · {providerLabel(r)}</span>
                  <span className="preview-subline">{machineLabel(r)} · {publisherLabel(r)}</span>
                </div>
                <span className={`preview-score ${r.overall_score >= 80 ? 'green' : ''}`}>{r.overall_score.toFixed(1)}</span>
              </div>
            ))
          )}
          <Link to="/leaderboard" className="btn btn-secondary" style={{ marginTop: 12 }}>
            See full leaderboard
          </Link>
        </div>
      </section>

      {featuredPublishers.length > 0 && (
        <section>
          <div className="page-header">
            <div>
              <div className="page-kicker">Published by real builders</div>
              <h2 className="page-title">Runs can carry a real profile.</h2>
              <p className="page-subtitle">
                Add your name, avatar, and link when you publish so great setups are traceable back to the people who tuned them.
              </p>
            </div>
          </div>
          <div className="publisher-grid">
            {featuredPublishers.map((run) => (
              <a
                key={`${run.id}-${publisherLabel(run)}`}
                className="card publisher-card"
                href={run.profile_url || undefined}
                target={run.profile_url ? '_blank' : undefined}
                rel={run.profile_url ? 'noreferrer' : undefined}
              >
                {run.profile_avatar_url ? (
                  <img src={run.profile_avatar_url} alt={publisherLabel(run)} className="publisher-card-avatar" />
                ) : (
                  <div className="publisher-card-avatar publisher-card-avatar-fallback">{publisherLabel(run).slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <strong>{publisherLabel(run)}</strong>
                  <div className="publisher-card-meta">{run.model}</div>
                  <div className="publisher-card-meta">{machineLabel(run)}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="page-header">
          <div>
            <div className="page-kicker">CLI</div>
            <h2 className="page-title">One command, full report.</h2>
            <p className="page-subtitle">
              Pipe-friendly output, persisted runs, scriptable enough to wire into CI for hardware regression checks.
            </p>
          </div>
        </div>
        <CliInstall />
      </section>

      <section className="launch-strip card-premium">
        <div>
          <div className="page-kicker">Ship path</div>
          <h2>Ready to publish your own runs?</h2>
          <p>
            Run locally. Every completed benchmark auto-publishes to the public leaderboard, with per-suite scores, hardware context, and optional profile attribution. Reproducibility is the whole point.
          </p>
        </div>
        <div className="launch-actions">
          <Link to="/download" className="btn btn-primary btn-lg">Install</Link>
          <Link to="/docs" className="btn btn-secondary btn-lg">Read the docs</Link>
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'green' }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={tone === 'green' ? 'green' : ''}>{value}</strong>
    </div>
  )
}

function Stat({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="metric-card stat-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${compact ? 'metric-value-compact' : ''}`}>{value}</div>
    </div>
  )
}

function FeaturedRunCard({ title, blurb, run, stat, emptyMessage }: { title: string; blurb: string; run: PublicRun | null; stat: string; emptyMessage?: string }) {
  return (
    <div className="card lb-highlight-card">
      <div className="metric-label">{title}</div>
      <div className="lb-highlight-score">{stat}</div>
      {run ? (
        <>
          <strong>{run.model}</strong>
          <div className="lb-highlight-meta">{providerLabel(run)} · {machineLabel(run)}</div>
          <div className="lb-highlight-meta">{publisherLabel(run)} · {run.harness || 'raw'} harness</div>
        </>
      ) : (
        <div className="lb-highlight-meta">{emptyMessage || 'No matching run yet'}</div>
      )}
      <p className="lb-highlight-subtitle">{blurb}</p>
    </div>
  )
}
