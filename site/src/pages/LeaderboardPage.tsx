import { useMemo, useState } from 'react'
import { useLeaderboard, type PublicRun } from '../hooks/useLeaderboard'

type RankMode = 'overall' | 'agent' | 'quality' | 'speed' | 'tok_per_sec'

const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'agent', label: 'Agent loop' },
  { id: 'quality', label: 'Quality' },
  { id: 'speed', label: 'Speed' },
  { id: 'tok_per_sec', label: 'Raw tok/s' },
]

const HARNESSES = ['all', 'raw', 'hermes', 'qwen', 'pi'] as const
type HarnessFilter = typeof HARNESSES[number]

function scoreClass(score: number): string {
  return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
}

function scoreOf(run: PublicRun, mode: RankMode): number {
  switch (mode) {
    case 'agent': return run.agent_score ?? -1
    case 'quality': return run.quality_score
    case 'speed': return run.speed_score
    case 'tok_per_sec': return run.generation_tok_per_sec
    default: return run.overall_score
  }
}

function endpointPort(endpoint?: string): string {
  if (!endpoint) return ''
  try {
    return new URL(endpoint).port || ''
  } catch {
    return ''
  }
}

function machineLabel(run: PublicRun): string {
  // Prefer actual GPU/CPU if known. For localhost tunnels, avoid showing plain
  // "localhost" because that is the tunnel endpoint, not meaningful hardware.
  if (run.gpu) return run.gpu
  if (run.cpu) return run.cpu

  if (run.is_remote) {
    const port = endpointPort(run.endpoint)
    const vram = run.gpu_memory_gb ? `${run.gpu_memory_gb.toFixed(1)}GB VRAM in use` : 'remote Ollama'
    // Known local launch/testing tunnel used for PC1. Generic users still see a useful remote label.
    if (port === '11435') return `PC1 remote GPU (${vram})`
    if (port === '11436') return `Studio remote GPU (${vram})`
    return `Remote endpoint${port ? ` :${port}` : ''}${run.gpu_memory_gb ? ` (${vram})` : ''}`
  }

  if (run.machine && run.machine !== 'localhost') return run.machine
  return 'unknown hardware'
}

function suiteSummary(run: PublicRun): string {
  const names = Object.keys(run.suites || {})
  if (!names.length) return 'No suites recorded'
  return names.join(', ')
}

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function LeaderboardPage() {
  const { runs, loading, error } = useLeaderboard()
  const [mode, setMode] = useState<RankMode>('overall')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'full' | 'all'>('all')
  const [harnessFilter, setHarnessFilter] = useState<HarnessFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const ranked = useMemo(() => {
    const filtered = runs.filter((r) => {
      if (search && !r.model.toLowerCase().includes(search.toLowerCase())) return false
      if (mode === 'agent') return (r.agent_score ?? -1) >= 0
      if (scope === 'full' && !r.is_full_benchmark) return false
      if (harnessFilter !== 'all' && (r.harness || 'raw') !== harnessFilter) return false
      return true
    })
    return filtered.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode))
  }, [runs, mode, search, scope, harnessFilter])

  const stats = useMemo(() => {
    const totalRuns = runs.length
    const fullRuns = runs.filter((r) => r.is_full_benchmark).length
    const uniqueModels = new Set(runs.map((r) => r.model)).size
    const uniqueMachines = new Set(runs.map(machineLabel).filter((m) => m && m !== 'unknown')).size
    const bestOverall = runs.length ? Math.max(...runs.map((r) => r.overall_score)) : 0
    return { totalRuns, fullRuns, uniqueModels, uniqueMachines, bestOverall }
  }, [runs])

  return (
    <div>
      <div className="page-kicker">Public leaderboard</div>
      <h1>Local LLMs, scored on real work.</h1>
      <p className="page-subtitle">
        Submitted runs from real hardware. Every entry is reproducible — install BenchLoop, run the same suites,
        compare your numbers. Dedup is best run per (model, harness) so models can't game the board with cherry-picked runs.
      </p>

      {/* Live stats strip */}
      {!loading && !error && runs.length > 0 && (
        <div className="metric-grid metric-grid-tight" style={{ marginTop: 18, marginBottom: 18 }}>
          <Stat label="Published runs" value={String(stats.totalRuns)} />
          <Stat label="Full benchmarks" value={String(stats.fullRuns)} />
          <Stat label="Unique models" value={String(stats.uniqueModels)} />
          <Stat label="Unique machines" value={String(stats.uniqueMachines)} />
        </div>
      )}

      {/* Filter bar */}
      <div className="card lb-filters">
        <div className="lb-rank-modes">
          {RANK_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`btn ${mode === m.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '7px 13px', fontSize: '0.78rem' }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="lb-filter-controls">
          <input
            type="search"
            placeholder="Search model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="lb-search"
          />
          <select value={harnessFilter} onChange={(e) => setHarnessFilter(e.target.value as HarnessFilter)}>
            {HARNESSES.map((h) => (
              <option key={h} value={h}>{h === 'all' ? 'All harnesses' : `${h} harness`}</option>
            ))}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'full' | 'all')}>
            <option value="full">Full benchmarks only</option>
            <option value="all">All scopes</option>
          </select>
        </div>
      </div>

      {loading && <div className="card">Loading public runs…</div>}
      {error && <div className="card">Couldn't load runs: {error}</div>}
      {!loading && !error && ranked.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>No runs match this filter.</strong>
          <p style={{ marginTop: 6 }}>
            Install BenchLoop and run any benchmark — every completed run auto-publishes here.
          </p>
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <div className="card lb-card">
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Harness</th>
                <th>Hardware</th>
                <th style={{ textAlign: 'right' }}>Overall</th>
                <th style={{ textAlign: 'right' }}>Quality</th>
                <th style={{ textAlign: 'right' }}>Speed</th>
                <th style={{ textAlign: 'right' }}>Reliab.</th>
                <th style={{ textAlign: 'right' }}>Agent</th>
                <th style={{ textAlign: 'right' }}>Tok/s</th>
                <th style={{ textAlign: 'right' }}>TTFT</th>
                <th style={{ textAlign: 'right' }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const expanded = expandedId === r.id
                return (
                  <>
                    <tr
                      key={r.id}
                      className="lb-row-clickable"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      title="Click for run details"
                    >
                      <td className="lb-score">{i + 1}</td>
                      <td>
                        <strong>{r.model}</strong>
                        {r.is_full_benchmark ? <span className="lb-badge full">FULL</span> : <span className="lb-badge partial">PARTIAL</span>}
                        {r.is_agent_only && <span className="lb-badge agent">AGENT</span>}
                      </td>
                      <td><code>{r.harness || 'raw'}</code></td>
                      <td title={`${r.cpu || ''}${r.gpu ? ' / ' + r.gpu : ''}${r.gpu_memory_gb ? ' / ' + r.gpu_memory_gb + 'GB VRAM' : ''}`}>
                        {machineLabel(r)}
                      </td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.overall_score)}`}>{r.overall_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.quality_score)}`}>{r.quality_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.speed_score)}`}>{r.speed_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.reliability_score)}`}>{r.reliability_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {r.agent_score != null && r.agent_score >= 0
                          ? <span className={`lb-score ${scoreClass(r.agent_score)}`}>{r.agent_score.toFixed(1)}</span>
                          : <span className="lb-score" style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }} className="lb-score">{r.generation_tok_per_sec ? r.generation_tok_per_sec.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right' }} className="lb-score" title={r.ttft_ms ? `${r.ttft_ms.toFixed(0)} ms time to first token` : ''}>
                        {r.ttft_ms ? `${r.ttft_ms.toFixed(0)}ms` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.75rem' }} title={r.timestamp}>
                        {timeAgo(r.timestamp)} {expanded ? '▴' : '▾'}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${r.id}-details`} className="lb-details-row">
                        <td colSpan={12}>
                          <div className="lb-details-grid">
                            <Detail label="Run ID" value={r.run_id || r.id} mono />
                            <Detail label="Posted by / Machine" value={machineLabel(r)} />
                            <Detail label="Machine ID" value={r.machine_id || '—'} mono />
                            <Detail label="Provider" value={r.provider || '—'} />
                            <Detail label="Harness" value={r.harness || 'raw'} mono />
                            <Detail label="Scope" value={r.is_full_benchmark ? 'Full benchmark' : 'Partial / smoke run'} />
                            <Detail label="Endpoint" value={r.endpoint || (r.is_remote ? 'remote endpoint' : 'local default')} mono />
                            <Detail label="Remote" value={r.is_remote ? `yes${r.remote_host ? ` (${r.remote_host})` : ''}` : 'no'} />
                            <Detail label="GPU/VRAM" value={r.gpu ? `${r.gpu}${r.gpu_memory_gb ? ` / ${r.gpu_memory_gb.toFixed(1)}GB` : ''}` : r.gpu_memory_gb ? `${r.gpu_memory_gb.toFixed(1)}GB VRAM in use` : 'not reported'} />
                            <Detail label="Runtime" value={r.total_runtime_sec ? `${r.total_runtime_sec.toFixed(1)}s` : '—'} />
                            <Detail label="Suites" value={suiteSummary(r)} />
                            <Detail label="Submitted" value={r.submitted_at || r.timestamp || '—'} mono />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 24, color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        Hardware shown is what the local CLI detected at run time. Tunneled or remote endpoints may report
        the orchestrator's hardware rather than the model server's. We're working on cleaner remote attribution.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card stat-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="lb-detail-item">
      <div className="lb-detail-label">{label}</div>
      <div className={mono ? 'lb-detail-value mono' : 'lb-detail-value'}>{value}</div>
    </div>
  )
}
