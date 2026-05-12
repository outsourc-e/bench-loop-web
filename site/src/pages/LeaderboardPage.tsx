import { useMemo, useState } from 'react'
import { useLeaderboard, type PublicRun } from '../hooks/useLeaderboard'

type RankMode = 'overall' | 'quality' | 'speed' | 'tok_per_sec'

const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'quality', label: 'Quality' },
  { id: 'speed', label: 'Speed' },
  { id: 'tok_per_sec', label: 'Raw tok/s' },
]

function scoreClass(score: number): string {
  return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
}

function scoreOf(run: PublicRun, mode: RankMode): number {
  switch (mode) {
    case 'quality': return run.quality_score
    case 'speed': return run.speed_score
    case 'tok_per_sec': return run.generation_tok_per_sec
    default: return run.overall_score
  }
}

export default function LeaderboardPage() {
  const { runs, loading, error } = useLeaderboard()
  const [mode, setMode] = useState<RankMode>('overall')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'full' | 'all'>('full')

  const ranked = useMemo(() => {
    const filtered = runs.filter((r) => {
      if (search && !r.model.toLowerCase().includes(search.toLowerCase())) return false
      if (scope === 'full' && !r.is_full_benchmark) return false
      return true
    })
    return filtered.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode))
  }, [runs, mode, search, scope])

  return (
    <div>
      <div className="page-kicker">Public leaderboard</div>
      <h1>Local LLMs, scored on real work.</h1>
      <p className="page-subtitle">
        Submitted runs from real hardware. Each row is reproducible — install BenchLoop, run the same suites,
        compare your numbers.
      </p>

      <div className="card" style={{ padding: 14, marginTop: 24, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
        <input
          type="search"
          placeholder="Search model"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 220, maxWidth: 320, marginLeft: 'auto' }}
        />
        <select value={scope} onChange={(e) => setScope(e.target.value as 'full' | 'all')} style={{ maxWidth: 220 }}>
          <option value="full">Full benchmarks only</option>
          <option value="all">All scopes</option>
        </select>
      </div>

      {loading && <div className="card">Loading public runs…</div>}
      {error && <div className="card">Couldn’t load runs: {error}</div>}
      {!loading && !error && ranked.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>No published runs yet.</strong>
          <p style={{ marginTop: 6 }}>
            Run BenchLoop locally, export, and submit a PR to populate this leaderboard.
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
                <th>Provider</th>
                <th>Machine</th>
                <th style={{ textAlign: 'right' }}>Overall</th>
                <th style={{ textAlign: 'right' }}>Quality</th>
                <th style={{ textAlign: 'right' }}>Speed</th>
                <th style={{ textAlign: 'right' }}>Tok/s</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id}>
                  <td className="lb-score">{i + 1}</td>
                  <td><strong>{r.model}</strong></td>
                  <td>{r.harness || 'raw'}</td>
                  <td>{r.provider || '—'}</td>
                  <td>{r.machine || '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.overall_score)}`}>{r.overall_score.toFixed(1)}</span></td>
                  <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.quality_score)}`}>{r.quality_score.toFixed(1)}</span></td>
                  <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.speed_score)}`}>{r.speed_score.toFixed(1)}</span></td>
                  <td style={{ textAlign: 'right' }} className="lb-score">{r.generation_tok_per_sec.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
