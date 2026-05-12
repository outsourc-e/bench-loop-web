import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useRuns } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  color: 'var(--text-dim)',
  fontWeight: 600,
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}
const cellStyle: React.CSSProperties = { padding: '8px 12px' }

export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { runs, loading } = useRuns()
  const [runA, setRunA] = useState<any>(null)
  const [runB, setRunB] = useState<any>(null)
  const aId = params.get('a') || ''
  const bId = params.get('b') || ''

  useEffect(() => {
    if (aId) fetch(`/api/benchmark/runs/${aId}`).then((r) => r.json()).then((d) => setRunA(d.result || d))
    else setRunA(null)
  }, [aId])

  useEffect(() => {
    if (bId) fetch(`/api/benchmark/runs/${bId}`).then((r) => r.json()).then((d) => setRunB(d.result || d))
    else setRunB(null)
  }, [bId])

  const setSlot = (slot: 'a' | 'b', id: string) => {
    const next = new URLSearchParams(params)
    if (id) next.set(slot, id)
    else next.delete(slot)
    setParams(next, { replace: true })
  }

  // Union of suite names so the table aligns even when scopes differ.
  const allSuites = useMemo(() => {
    const s = new Set<string>()
    if (runA?.suites) Object.keys(runA.suites).forEach((k) => s.add(k))
    if (runB?.suites) Object.keys(runB.suites).forEach((k) => s.add(k))
    return Array.from(s).sort()
  }, [runA, runB])

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: 6 }}
        >
          ← Back
        </button>
        <h3 style={{ color: '#fff', margin: 0 }}>⚖️ Compare runs</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>
          Put two runs side-by-side. Pick from the dropdowns or share a link with <code>?a=runId&b=runId</code>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <RunSlot label="Run A" runs={runs} loading={loading} value={aId} onChange={(id) => setSlot('a', id)} />
        <RunSlot label="Run B" runs={runs} loading={loading} value={bId} onChange={(id) => setSlot('b', id)} />
      </div>

      {!runA && !runB && (
        <div className="empty-state">
          <h3>Pick two runs to compare</h3>
          <p>Use the selectors above. The leaderboard also has a "Compare" button next to each row.</p>
        </div>
      )}

      {(runA || runB) && (
        <>
          <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={headStyle}>Metric</th>
                  <th style={{ ...headStyle, textAlign: 'right' }}>{runA?.model?.model_id || 'Run A'}</th>
                  <th style={{ ...headStyle, textAlign: 'right' }}>{runB?.model?.model_id || 'Run B'}</th>
                  <th style={{ ...headStyle, textAlign: 'right' }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                <ScoreRow label="Overall" a={runA?.overall_score} b={runB?.overall_score} />
                <ScoreRow label="Quality" a={runA?.quality_score} b={runB?.quality_score} />
                <ScoreRow label="Speed" a={runA?.speed_score} b={runB?.speed_score} />
                <ScoreRow label="Reliability" a={runA?.reliability_score} b={runB?.reliability_score} />
                <Row label="Gen tok/s" a={runA?.speed_metrics?.generation_tok_per_sec} b={runB?.speed_metrics?.generation_tok_per_sec} fmt={(v) => v.toFixed(1)} />
                <Row label="TTFT (ms)" a={runA?.speed_metrics?.ttft_ms} b={runB?.speed_metrics?.ttft_ms} fmt={(v) => v.toFixed(0)} invertDelta />
                <Row label="Total runtime (s)" a={runA?.total_runtime_sec} b={runB?.total_runtime_sec} fmt={(v) => v.toFixed(1)} invertDelta />
              </tbody>
            </table>
          </div>

          {allSuites.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <th style={headStyle}>Suite</th>
                    <th style={{ ...headStyle, textAlign: 'right' }}>{runA?.model?.model_id || 'Run A'}</th>
                    <th style={{ ...headStyle, textAlign: 'right' }}>{runB?.model?.model_id || 'Run B'}</th>
                    <th style={{ ...headStyle, textAlign: 'right' }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {allSuites.map((s) => (
                    <ScoreRow
                      key={s}
                      label={s}
                      a={runA?.suites?.[s]?.score}
                      b={runB?.suites?.[s]?.score}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RunSlot({
  label,
  runs,
  loading,
  value,
  onChange,
}: {
  label: string
  runs: any[]
  loading: boolean
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ ...headStyle, padding: 0, marginBottom: 8 }}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 6, fontSize: '0.85rem' }}
      >
        <option value="">{loading ? 'Loading runs…' : 'Pick a run…'}</option>
        {runs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.model} · {r.harness || 'raw'} · overall {Math.round(r.overall_score || 0)}{(r as any).timestamp ? ` · ${(r as any).timestamp.slice(0, 10)}` : ''}
          </option>
        ))}
      </select>
      {value && (
        <Link to={`/runs/${value}`} style={{ display: 'inline-block', marginTop: 8, color: 'var(--accent)', fontSize: '0.78rem', textDecoration: 'none' }}>
          View full detail →
        </Link>
      )}
    </div>
  )
}

function ScoreRow({ label, a, b }: { label: string; a?: number; b?: number }) {
  const delta = (b ?? 0) - (a ?? 0)
  const fmtDelta = (a == null || b == null) ? '—' : (delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1))
  const color = (a == null || b == null) ? 'var(--text-dim)' : delta > 0.5 ? '#7fd99a' : delta < -0.5 ? '#ff8888' : 'var(--text-dim)'
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ ...cellStyle, fontWeight: 500 }}>{label}</td>
      <td style={{ ...cellStyle, textAlign: 'right' }}><ScoreBadge score={a || 0} size="sm" /></td>
      <td style={{ ...cellStyle, textAlign: 'right' }}><ScoreBadge score={b || 0} size="sm" /></td>
      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color }}>{fmtDelta}</td>
    </tr>
  )
}

function Row({ label, a, b, fmt, invertDelta }: { label: string; a?: number; b?: number; fmt: (n: number) => string; invertDelta?: boolean }) {
  const aFmt = a != null ? fmt(a) : '—'
  const bFmt = b != null ? fmt(b) : '—'
  const delta = (b ?? 0) - (a ?? 0)
  const better = invertDelta ? -delta : delta
  const fmtDelta = (a == null || b == null) ? '—' : (delta >= 0 ? `+${fmt(Math.abs(delta))}` : `-${fmt(Math.abs(delta))}`)
  const color = (a == null || b == null) ? 'var(--text-dim)' : better > 0 ? '#7fd99a' : better < 0 ? '#ff8888' : 'var(--text-dim)'
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ ...cellStyle, fontWeight: 500 }}>{label}</td>
      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{aFmt}</td>
      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)' }}>{bFmt}</td>
      <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color }}>{fmtDelta}</td>
    </tr>
  )
}
