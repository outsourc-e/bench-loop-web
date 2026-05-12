import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ScoreBadge from '../components/ScoreBadge'

interface RunDetail {
  status?: string
  error?: string | null
  result?: any
  hardware?: any
}

const cellStyle: React.CSSProperties = { padding: '8px 12px' }
const headStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  color: 'var(--text-dim)',
  fontWeight: 600,
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    setLoading(true)
    fetch(`/api/benchmark/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ error: 'Failed to load run' }))
      .finally(() => setLoading(false))
  }, [runId])

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-dim)' }}>Loading run {runId}…</div>
  }

  if (!data || data.error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="empty-state">
          <h3>Run not found</h3>
          <p>{data?.error || `No run with id ${runId}`}</p>
          <button
            onClick={() => navigate('/leaderboard')}
            style={{ marginTop: 12, padding: '6px 14px', background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, cursor: 'pointer' }}
          >
            Back to leaderboard
          </button>
        </div>
      </div>
    )
  }

  // Run data shape: on completed runs from disk it's r.result; on active runs it could be r itself.
  const run = data.result || data
  const model = run.model?.model_id || run.model || 'unknown'
  const suites = run.suites || {}
  const sm = run.speed_metrics || {}
  const machine = run.machine || {}

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: 6 }}
          >
            ← Back
          </button>
          <h3 style={{ color: '#fff', margin: 0 }}>{model}</h3>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: 4 }}>
            Run <code style={{ fontFamily: 'var(--mono)' }}>{runId}</code> · {run.timestamp || '—'} · harness <strong>{run.harness || 'raw'}</strong> · provider <strong>{run.provider || '—'}</strong>
          </div>
        </div>
        <Link
          to={`/compare?a=${encodeURIComponent(runId || '')}`}
          style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 14px', borderRadius: 6, fontSize: '0.85rem', textDecoration: 'none' }}
        >
          Compare with…
        </Link>
      </div>

      {/* Top-line scores */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          <ScoreCell label="Overall" score={run.overall_score} />
          <ScoreCell label="Quality" score={run.quality_score} />
          <ScoreCell label="Speed" score={run.speed_score} />
          <ScoreCell label="Reliability" score={run.reliability_score} />
        </div>
      </div>

      {/* Per-suite scores */}
      <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <th style={headStyle}>Suite</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Score</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Passed</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Failed</th>
              <th style={{ ...headStyle, textAlign: 'right' }}>Median latency</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(suites).map(([suiteName, suite]: [string, any]) => (
              <tr key={suiteName} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...cellStyle, fontWeight: 500 }}>{suiteName}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <ScoreBadge score={suite.score || 0} size="sm" />
                </td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: '#7fd99a' }}>{suite.pass_count ?? 0}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: suite.fail_count ? '#ff8888' : 'var(--text-dim)' }}>{suite.fail_count ?? 0}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{suite.median_latency_ms ? `${suite.median_latency_ms.toFixed(0)} ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Speed metrics + machine */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ ...headStyle, padding: 0, marginBottom: 8 }}>Speed metrics</div>
          <KV label="Generation tok/s" value={sm.generation_tok_per_sec ? sm.generation_tok_per_sec.toFixed(1) : '—'} />
          <KV label="Prompt eval tok/s" value={sm.prompt_eval_tok_per_sec ? sm.prompt_eval_tok_per_sec.toFixed(1) : '—'} />
          <KV label="TTFT" value={sm.ttft_ms ? `${sm.ttft_ms.toFixed(0)} ms` : '—'} />
          <KV label="Total latency" value={sm.total_latency_ms ? `${(sm.total_latency_ms / 1000).toFixed(1)} s` : '—'} />
          <KV label="Total runtime" value={run.total_runtime_sec ? `${run.total_runtime_sec.toFixed(1)} s` : '—'} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ ...headStyle, padding: 0, marginBottom: 8 }}>Machine</div>
          <KV label="Machine ID" value={machine.machine_id || '—'} />
          <KV label="CPU" value={machine.cpu || '—'} />
          <KV label="GPU" value={machine.gpu || '—'} />
          <KV label="GPU memory" value={machine.gpu_memory_gb ? `${machine.gpu_memory_gb} GB` : '—'} />
          <KV label="System memory" value={machine.system_memory_gb ? `${machine.system_memory_gb} GB` : '—'} />
          <KV label="OS" value={machine.os || '—'} />
          <KV label="Backend" value={machine.backend || run.provider || '—'} />
        </div>
      </div>

      {/* Raw JSON */}
      <details className="card" style={{ padding: 12 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          Raw run.json
        </summary>
        <pre style={{ marginTop: 12, padding: 12, background: 'var(--bg)', borderRadius: 6, overflow: 'auto', maxHeight: 600, fontSize: '0.72rem', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
          {JSON.stringify(run, null, 2)}
        </pre>
      </details>
    </div>
  )
}

function ScoreCell({ label, score }: { label: string; score?: number }) {
  return (
    <div>
      <div style={{ ...headStyle, padding: 0, marginBottom: 4 }}>{label}</div>
      <ScoreBadge score={score || 0} size="lg" />
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}
