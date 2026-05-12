import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRuns } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

// "Full" = at least these quality suites + speed. Coding is optional bonus.
const REQUIRED_FULL_SUITES = new Set([
  'speed',
  'toolcall',
  'dataextract',
  'instructfollow',
  'reasonmath',
])

type RunRow = ReturnType<typeof useRuns>['runs'][number]
type RankMode = 'overall' | 'quality' | 'speed' | 'efficiency' | 'tok_per_sec'

function isFullRun(r: RunRow): boolean {
  if (typeof r.is_full_benchmark === 'boolean') return r.is_full_benchmark
  const suiteNames = new Set(Object.keys(r.suites || {}))
  for (const need of REQUIRED_FULL_SUITES) if (!suiteNames.has(need)) return false
  return true
}

function efficiencyScore(r: RunRow): number {
  // Quality per second of model runtime — rewards models that get high quality
  // AND finish fast. Normalized to 0-100 with most local models in the 5-50 range.
  const q = r.quality_score || 0
  const sec = r.total_runtime_sec || 1
  // Tasks per minute proxy: quality*60/runtime, capped at 100.
  return Math.min(100, (q * 60) / sec)
}

function bestRunPerModelHarness(runs: RunRow[], scoreField: (r: RunRow) => number): RunRow[] {
  const best = new Map<string, RunRow>()
  for (const run of runs) {
    const key = `${run.model}::${run.harness || 'raw'}`
    const existing = best.get(key)
    if (!existing || scoreField(run) > scoreField(existing)) {
      best.set(key, run)
    }
  }
  return [...best.values()].sort((a, b) => scoreField(b) - scoreField(a))
}

const cellStyle: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap' }
const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  color: 'var(--text-dim)',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const RANK_MODES: { id: RankMode; label: string; desc: string }[] = [
  { id: 'overall', label: 'Overall', desc: '0.55·quality + 0.20·speed + 0.25·reliability' },
  { id: 'quality', label: 'Quality only', desc: 'Mean of non-speed suite scores. Size-fair.' },
  { id: 'speed', label: 'Speed only', desc: 'tok/s based score' },
  { id: 'tok_per_sec', label: 'Raw tok/s', desc: 'Sort by generation tok/s' },
  { id: 'efficiency', label: 'Efficiency', desc: 'Quality × 60 / runtime — rewards fast + smart' },
]

export default function LeaderboardTab() {
  const navigate = useNavigate()
  const { runs, loading, refresh } = useRuns()
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'full' | 'all' | 'partial'>('full')
  const [providerFilter, setProviderFilter] = useState<string>('all')
  const [harnessFilter, setHarnessFilter] = useState<string>('all')
  const [rankMode, setRankMode] = useState<RankMode>('overall')

  const scoreOf = (r: RunRow): number => {
    switch (rankMode) {
      case 'quality': return r.quality_score || 0
      case 'speed': return r.speed_score || 0
      case 'tok_per_sec': return r.generation_tok_per_sec || 0
      case 'efficiency': return efficiencyScore(r)
      default: return r.overall_score || 0
    }
  }

  const ranked = useMemo(() => bestRunPerModelHarness(runs, scoreOf), [runs, rankMode])

  const providers = useMemo(
    () => Array.from(new Set(ranked.map((r) => r.provider).filter(Boolean))),
    [ranked]
  )
  const harnesses = useMemo(
    () => Array.from(new Set(ranked.map((r) => r.harness || 'raw').filter(Boolean))),
    [ranked]
  )

  const filtered = useMemo(() => {
    return ranked.filter((r) => {
      if (search && !r.model.toLowerCase().includes(search.toLowerCase())) return false
      if (providerFilter !== 'all' && r.provider !== providerFilter) return false
      if (harnessFilter !== 'all' && (r.harness || 'raw') !== harnessFilter) return false
      const full = isFullRun(r)
      if (scope === 'full' && !full) return false
      if (scope === 'partial' && full) return false
      return true
    })
  }, [ranked, search, scope, providerFilter, harnessFilter])

  // Mark when speed score is at 100 cap so users know it might understate actual differences
  const speedAtCapCount = filtered.filter((r) => (r.speed_score || 0) >= 99.9).length
  const totalRuns = ranked.length
  const filteredPartialCount = ranked.length - ranked.filter(isFullRun).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '8px 0' }}>
        <div>
          <h3 style={{ color: '#fff', marginBottom: 4 }}>🏆 Leaderboard</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            Best run per model + harness. Rank by overall, quality, speed, raw tok/s, or efficiency.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          style={{
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          Refresh
        </button>
      </div>

      {/* Ranking mode selector */}
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Rank by
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {RANK_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setRankMode(m.id)}
              title={m.desc}
              style={{
                background: rankMode === m.id ? 'rgba(100,140,255,0.2)' : 'var(--bg)',
                color: rankMode === m.id ? '#aeb8ff' : 'var(--text)',
                border: `1px solid ${rankMode === m.id ? 'rgba(100,140,255,0.6)' : 'var(--border)'}`,
                padding: '5px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: rankMode === m.id ? 600 : 400,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {RANK_MODES.find((m) => m.id === rankMode)?.desc}
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search model"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: '0.85rem',
            minWidth: 200,
          }}
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as 'full' | 'all' | 'partial')}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: '0.85rem',
          }}
        >
          <option value="full">Full benchmarks only (apples-to-apples)</option>
          <option value="all">All scopes</option>
          <option value="partial">Partial / speed-only</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: '0.85rem',
          }}
        >
          <option value="all">All providers</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={harnessFilter}
          onChange={(e) => setHarnessFilter(e.target.value)}
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: '0.85rem',
          }}
        >
          <option value="all">All harnesses</option>
          {harnesses.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <div style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
          {loading ? 'Loading…' : `${filtered.length} of ${totalRuns}`}
        </div>
      </div>

      {/* Warnings */}
      {scope === 'full' && filteredPartialCount > 0 && (
        <div
          style={{
            background: 'rgba(80,120,200,0.08)',
            border: '1px solid rgba(80,120,200,0.3)',
            color: 'var(--text-dim)',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.78rem',
            marginBottom: 12,
          }}
        >
          ℹ️ Hiding {filteredPartialCount} partial run{filteredPartialCount === 1 ? '' : 's'}. Partial runs only ran some suites
          and can't be fairly compared to full benchmarks. Switch to "All scopes" to include them.
        </div>
      )}
      {(rankMode === 'overall' || rankMode === 'speed') && speedAtCapCount >= 2 && (
        <div
          style={{
            background: 'rgba(200,160,80,0.08)',
            border: '1px solid rgba(200,160,80,0.3)',
            color: '#e0b56a',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: '0.78rem',
            marginBottom: 12,
          }}
        >
          ⚠️ {speedAtCapCount} runs have speed score at the 100 ceiling. Switch to "Raw tok/s" to see actual speed differences.
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <h3>No benchmark data yet</h3>
          <p>Run some benchmarks to see your models compared here.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <th style={{ ...headStyle, textAlign: 'center', width: 40 }}>#</th>
                <th style={headStyle}>Model</th>
                <th style={headStyle}>Quant</th>
                <th style={headStyle}>Harness</th>
                <th style={headStyle}>Provider</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Overall</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Quality</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Speed</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Tok/s</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>TTFT</th>
                <th style={headStyle}>Machine</th>
                <th style={headStyle}>Scope</th>
                <th style={{ ...headStyle, textAlign: 'right' }}>Runtime</th>
                <th style={{ ...headStyle, textAlign: 'center', width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run, i) => {
                const full = isFullRun(run)
                const suiteCount = run.suite_count ?? Object.keys(run.suites || {}).length
                const machineLabel = run.gpu || run.cpu || run.machine || '—'
                const speedAtCap = (run.speed_score || 0) >= 99.9
                return (
                  <tr
                    key={run.id}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => navigate(`/runs/${run.id}`)}
                  >
                    <td style={{ ...cellStyle, textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {i + 1}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 500 }} title={run.id}>
                      <Link to={`/runs/${run.id}`} style={{ color: 'var(--text)', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                        {run.model}
                      </Link>
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--text-dim)' }}>{run.quantization || '—'}</td>
                    <td style={{ ...cellStyle, color: 'var(--text-dim)' }}>{run.harness || 'raw'}</td>
                    <td style={{ ...cellStyle, color: 'var(--text-dim)' }}>{run.provider || '—'}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      <ScoreBadge score={run.overall_score} size="sm" />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>
                      <ScoreBadge score={run.quality_score} size="sm" />
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }} title={speedAtCap ? 'Score at 100 ceiling — see raw tok/s' : ''}>
                      <ScoreBadge score={run.speed_score} size="sm" />
                      {speedAtCap ? <span style={{ marginLeft: 4, opacity: 0.5 }}>⬆</span> : null}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>
                      {run.generation_tok_per_sec ? run.generation_tok_per_sec.toFixed(1) : '—'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {run.ttft_ms ? `${run.ttft_ms.toFixed(0)} ms` : '—'}
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--text-dim)' }} title={`${run.backend || ''} / ${run.os || ''}`}>
                      {machineLabel}
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: '0.7rem',
                          background: full ? 'rgba(80,200,120,0.15)' : 'rgba(200,160,80,0.15)',
                          color: full ? '#7fd99a' : '#e0b56a',
                          border: `1px solid ${full ? 'rgba(80,200,120,0.4)' : 'rgba(200,160,80,0.4)'}`,
                        }}
                      >
                        {full ? `full (${suiteCount})` : `partial (${suiteCount})`}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                      {run.total_runtime_sec ? `${run.total_runtime_sec.toFixed(1)}s` : '—'}
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <Link
                        to={`/compare?a=${encodeURIComponent(run.id)}`}
                        style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4 }}
                      >
                        Compare
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
