import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import ScoreBadge from '../components/ScoreBadge'

interface RunDetail {
  status?: string
  error?: string | null
  result?: any
  hardware?: any
  traceback?: string
  events?: any[]
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
    let cancelled = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const fetchOnce = async () => {
      try {
        const r = await fetch(`/api/benchmark/runs/${runId}`)
        const d = await r.json()
        if (cancelled) return
        setData(d)
        // Auto-poll while the run is still active so the UI updates in real-time.
        if (d.status === 'running' || d.status === 'pending') {
          pollTimer = setTimeout(fetchOnce, 2500)
        }
      } catch {
        if (!cancelled) setData({ error: 'Failed to load run' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    fetchOnce()

    return () => {
      cancelled = true
      if (pollTimer) clearTimeout(pollTimer)
    }
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
  const isFailed = data.status === 'failed' || !!data.error
  const isRunning = data.status === 'running'
  const model = run.model?.model_id || run.model || 'unknown'
  const suites = run.suites || {}
  const sm = run.speed_metrics || {}
  const machine = run.machine || {}

  return (
    <div>
      {isFailed && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }}>
          <div style={{ color: '#ff8888', fontWeight: 700, marginBottom: 6 }}>Run failed</div>
          <div style={{ color: 'var(--text)', fontSize: '0.88rem', marginBottom: 10 }}>
            {data.error || 'Unknown failure'}
          </div>
          {data.traceback && (
            <details>
              <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Show traceback</summary>
              <pre style={{ marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.4)', borderRadius: 6, fontSize: '0.72rem', overflow: 'auto', maxHeight: 360 }}>{data.traceback}</pre>
            </details>
          )}
        </div>
      )}

      {isRunning && (
        <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: 'rgba(45,212,127,0.35)', background: 'rgba(45,212,127,0.05)' }}>
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.88rem' }}>
            ⏵ Run in progress — page auto-refreshes when complete.
          </div>
        </div>
      )}

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

      {/* Agent suite: show per-task trace */}
      {suites.agent && Array.isArray(suites.agent.tasks) && (
        <AgentTrace suite={suites.agent} />
      )}

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

/**
 * Agent suite trace viewer. Each task is collapsible; expanding it shows the
 * model’s turn-by-turn conversation including the actual tools BenchLoop
 * executed and what they returned.
 */
function AgentTrace({ suite }: { suite: any }) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ ...headStyle, padding: 0, marginBottom: 4 }}>Agent suite trace</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
            Click a task to see the model’s actual turn-by-turn conversation and the tools BenchLoop executed for it.
          </div>
        </div>
        <ScoreBadge score={suite.score || 0} size="md" />
      </div>
      <div style={{ padding: 4 }}>
        {suite.tasks.map((task: any) => {
          const meta = task.metadata || {}
          const components = meta.agent_components || {}
          const turns = meta.turns || []
          const halluc = meta.hallucinated_tools || []
          const passed = task.passed
          return (
            <details key={task.task_id} style={{ borderBottom: '1px solid var(--border)' }}>
              <summary style={{
                cursor: 'pointer',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: '0.85rem',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 99,
                  background: passed ? '#7fd99a' : '#ff8888',
                  boxShadow: passed ? '0 0 8px #7fd99a' : '0 0 8px #ff8888',
                }} />
                <strong style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem' }}>{task.task_id}</strong>
                <span style={{ color: 'var(--text-dim)' }}>{turns.length} turns · {meta.tool_calls_total || 0} tool calls · stop: {meta.stop_reason || '?'}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <ComponentBadge label="answer" ok={components.correct_final === 25} />
                  <ComponentBadge label="efficient" ok={components.efficient === 25} />
                  <ComponentBadge label="no halluc" ok={components.no_hallucinated_tools === 25} />
                  <ComponentBadge label="required" ok={components.all_required_called === 25} />
                </span>
                <ScoreBadge score={task.score || 0} size="sm" />
              </summary>
              <div style={{ padding: '8px 14px 14px 24px', background: 'rgba(255,255,255,0.018)' }}>
                {halluc.length > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: '0.78rem', color: '#ff9999' }}>
                    Hallucinated tools: <code>{halluc.join(', ')}</code>
                  </div>
                )}
                {turns.map((t: any, i: number) => (
                  <TurnRow key={i} turn={t} />
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}

function ComponentBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span style={{
      fontSize: '0.66rem',
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 999,
      border: `1px solid ${ok ? 'rgba(127,217,154,0.4)' : 'rgba(255,136,136,0.4)'}`,
      color: ok ? '#7fd99a' : '#ff8888',
      background: ok ? 'rgba(127,217,154,0.07)' : 'rgba(255,136,136,0.07)',
    }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function TurnRow({ turn }: { turn: any }) {
  const role = turn.role || 'unknown'
  const tone = role === 'user' ? '#9ec5ff' : role === 'assistant' ? '#7fd99a' : '#f6c143'
  const labelText = role === 'tool' ? `tool: ${turn.tool_name || '?'}` : role
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '120px 1fr',
      gap: 12,
      padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      alignItems: 'start',
      fontSize: '0.8rem',
    }}>
      <div style={{ color: tone, fontFamily: 'var(--mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
        {labelText}
      </div>
      <div style={{ color: 'var(--text)' }}>
        {role === 'tool' && turn.tool_args && (
          <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: '0.72rem', marginBottom: 4 }}>
            args: {JSON.stringify(turn.tool_args)}
          </div>
        )}
        <div style={{ whiteSpace: 'pre-wrap', fontFamily: role === 'tool' ? 'var(--mono)' : 'inherit', fontSize: role === 'tool' ? '0.78rem' : '0.82rem', color: role === 'tool' ? '#e0d49a' : 'inherit' }}>
          {turn.content || (turn.tool_result ? turn.tool_result : '—')}
        </div>
      </div>
    </div>
  )
}
