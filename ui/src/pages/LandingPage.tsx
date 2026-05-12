import { Link } from 'react-router-dom'
import { useRuns } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

const featureCards = [
  {
    title: 'Quality + speed in one loop',
    body: 'Run fixed suites for tool use, coding, extraction, instruction following, reasoning, and raw throughput.',
    icon: '↻',
  },
  {
    title: 'Local-first by default',
    body: 'Works against Ollama, LM Studio, Osaurus/MLX, vLLM, Jan, and any OpenAI-compatible endpoint.',
    icon: '⌂',
  },
  {
    title: 'Harness comparisons',
    body: 'Compare raw, Hermes, Qwen, and Pi-style tool-call contracts against the exact same model.',
    icon: '⚖',
  },
  {
    title: 'Receipts, not vibes',
    body: 'Every run is persisted to disk with per-task outputs, latency, token metrics, machine info, and scores.',
    icon: '◆',
  },
]

const suiteRows = [
  ['speed', 'Latency, throughput, TTFT, generation tok/s'],
  ['toolcall', 'Structured tool-call correctness across realistic tasks'],
  ['coding', 'Executable Python tasks with sandboxed verification'],
  ['dataextract', 'JSON/data extraction from messy text'],
  ['instructfollow', 'Constraint following, formatting, and exactness'],
  ['reasonmath', 'Small reasoning + math tasks with deterministic checks'],
]

export default function LandingPage() {
  const { runs, loading } = useRuns()
  const fullRuns = runs.filter((r) => r.is_full_benchmark)
  const best = [...fullRuns].sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))[0]
  const recent = runs.slice(0, 4)

  return (
    <div className="landing-page">
      <section className="landing-hero card-premium">
        <div className="landing-hero-copy">
          <div className="page-kicker">Local LLM benchmark lab</div>
          <h1>Benchmark local models by what actually matters.</h1>
          <p className="landing-lede">
            BenchLoop scores quality, speed, reliability, and harness behavior across repeatable local workloads.
            Stop comparing screenshots and vibes. Run the loop, get the receipts.
          </p>
          <div className="landing-actions">
            <Link to="/models" className="btn btn-primary">Start a benchmark</Link>
            <Link to="/leaderboard" className="btn btn-secondary">View leaderboard</Link>
          </div>
          <div className="landing-trust-row">
            <span>Ollama</span>
            <span>LM Studio</span>
            <span>MLX / Osaurus</span>
            <span>vLLM</span>
            <span>OpenAI-compatible</span>
          </div>
        </div>

        <div className="hero-terminal" aria-label="BenchLoop preview">
          <div className="terminal-topbar">
            <span /> <span /> <span />
            <strong>benchloop run</strong>
          </div>
          <div className="terminal-body">
            <div className="terminal-line muted">model</div>
            <div className="terminal-line model">{best?.model || 'qwen3:8b'}</div>
            <div className="terminal-grid">
              <Metric label="Overall" value={best?.overall_score?.toFixed(1) || '72.9'} tone="green" />
              <Metric label="Quality" value={best?.quality_score?.toFixed(1) || '73.6'} />
              <Metric label="Speed" value={best?.speed_score?.toFixed(1) || '78.9'} />
              <Metric label="Tok/s" value={best?.generation_tok_per_sec?.toFixed(1) || '74.6'} />
            </div>
            <div className="terminal-progress"><span style={{ width: '83%' }} /></div>
            <div className="terminal-foot">6 suites · raw harness · persisted to ~/.bench-loop/runs</div>
          </div>
        </div>
      </section>

      <section className="landing-section metric-grid">
        <Stat label="Runs indexed" value={loading ? '…' : String(runs.length)} />
        <Stat label="Full benchmarks" value={loading ? '…' : String(fullRuns.length)} />
        <Stat label="Best overall" value={best ? best.overall_score.toFixed(1) : '—'} />
        <Stat label="Top model" value={best ? best.model.split('/').pop() || best.model : '—'} compact />
      </section>

      <section className="landing-section">
        <div className="page-header">
          <div>
            <div className="page-kicker">Product</div>
            <h2 className="page-title">Built for people tuning real local stacks.</h2>
            <p className="page-subtitle">
              BenchLoop is not another static leaderboard. It is a repeatable local benchmark rig for models,
              hardware, inference backends, and prompt harnesses.
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

      <section className="landing-section split-section">
        <div className="card-premium suite-panel">
          <div className="page-kicker">Suites</div>
          <h2>Six ways to catch model lies.</h2>
          <p className="page-subtitle">
            Speed is useful, but speed alone is how you accidentally crown a toaster. BenchLoop blends quality,
            reliability, and throughput into one comparable run.
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
        <div className="card comparison-card">
          <div className="section-title">Live local leaderboard</div>
          {recent.length === 0 ? (
            <div className="empty-mini">Run a benchmark to populate this board.</div>
          ) : (
            recent.map((r, i) => (
              <Link key={r.id} to={`/runs/${r.id}`} className="mini-run-row">
                <span className="rank">#{i + 1}</span>
                <span className="mini-model">{r.model}</span>
                <ScoreBadge score={r.overall_score || 0} size="sm" />
              </Link>
            ))
          )}
          <Link to="/leaderboard" className="btn btn-secondary" style={{ marginTop: 14, width: '100%' }}>
            Open full leaderboard
          </Link>
        </div>
      </section>

      <section className="landing-section launch-strip card-premium">
        <div>
          <div className="page-kicker">Ship path</div>
          <h2>Ready for benchloop.com once the run catalog is filled.</h2>
          <p>
            Local UI first, hosted leaderboard next: collect credible runs, publish the landing page,
            then open community submissions.
          </p>
        </div>
        <div className="launch-actions">
          <Link to="/benchmark" className="btn btn-primary">Run another model</Link>
          <Link to="/compare" className="btn btn-secondary">Compare runs</Link>
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
