import { useState, useEffect, useRef } from 'react'
import { useModels, useRuns, startBenchmark, type RunSummary } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

const ALL_SUITES = [
  { id: 'speed', label: 'Speed' },
  { id: 'toolcall', label: 'Tool Calling' },
  { id: 'dataextract', label: 'Data Extract' },
  { id: 'instructfollow', label: 'Instruct Follow' },
  { id: 'reasonmath', label: 'Reason & Math' },
]

interface Props {
  preselectedModel: string | null
  preselectedEndpoint: string | null
  onClearPreselected: () => void
}

export default function BenchmarkTab({ preselectedModel, preselectedEndpoint, onClearPreselected }: Props) {
  const { data: modelsData, loading: modelsLoading } = useModels()
  const { runs, refresh: refreshRuns } = useRuns()

  // Flatten models from all providers
  const allModels = (modelsData?.providers || []).flatMap((p) =>
    p.models.map((m) => ({ ...m, providerUrl: p.url, providerLabel: p.label }))
  )

  const [selectedModel, setSelectedModel] = useState('')
  const [endpoint, setEndpoint] = useState('http://localhost:11434')

  // Sync endpoint with selected model's provider
  useEffect(() => {
    const match = allModels.find((m) => m.name === selectedModel)
    if (match) setEndpoint(match.providerUrl)
  }, [selectedModel, allModels])
  const [selectedSuites, setSelectedSuites] = useState<string[]>(['speed', 'toolcall', 'dataextract', 'instructfollow', 'reasonmath'])
  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<any[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (preselectedModel) {
      setSelectedModel(preselectedModel)
      if (preselectedEndpoint) setEndpoint(preselectedEndpoint)
      onClearPreselected()
    }
  }, [preselectedModel, preselectedEndpoint, onClearPreselected])

  useEffect(() => {
    if (!selectedModel && allModels.length > 0) {
      setSelectedModel(allModels[0].name)
    }
  }, [allModels, selectedModel])

  const toggleSuite = (id: string) => {
    setSelectedSuites((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const handleRun = async () => {
    if (!selectedModel || selectedSuites.length === 0) return
    setRunning(true)
    setEvents([])
    setResult(null)
    setError(null)

    // Pre-run health check
    try {
      const healthResp = await fetch(endpoint.replace(/\/$/, '') + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: [{ role: 'user', content: 'Say ok' }], stream: false }),
      })
      if (!healthResp.ok) {
        const errText = await healthResp.text().catch(() => healthResp.statusText)
        setError(`Model health check failed (${healthResp.status}): ${errText.slice(0, 200)}`)
        setRunning(false)
        return
      }
    } catch (e: any) {
      setError(`Cannot reach model at ${endpoint}: ${e.message || e}`)
      setRunning(false)
      return
    }

    try {
      const { run_id } = await startBenchmark({
        model: selectedModel,
        endpoint,
        suites: selectedSuites,
      })
      setRunId(run_id)

      // Poll via SSE
      const evtSource = new EventSource(`/api/benchmark/stream/${run_id}`)
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          setEvents((prev) => [...prev, data])

          if (data.type === 'done') {
            evtSource.close()
            // Fetch full result
            fetch(`/api/benchmark/runs/${run_id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d.result) setResult(d.result)
                refreshRuns()
              })
              .finally(() => setRunning(false))
          } else if (data.type === 'error') {
            evtSource.close()
            setError(data.data?.error || 'Benchmark failed')
            setRunning(false)
          }
        } catch {}
      }
      evtSource.onerror = () => {
        evtSource.close()
        // If still running, poll for result
        if (running) {
          const poll = setInterval(() => {
            fetch(`/api/benchmark/runs/${run_id}`)
              .then(r => r.json())
              .then(d => {
                if (d.status === 'completed' || d.status === 'failed') {
                  clearInterval(poll)
                  if (d.result) setResult(d.result)
                  if (d.error) setError(d.error)
                  setRunning(false)
                  refreshRuns()
                }
              })
          }, 2000)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start benchmark')
      setRunning(false)
    }
  }

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Config */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Run Configuration</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>Model</label>
            <select
              className="input"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={running || modelsLoading}
            >
              {modelsLoading && <option>Loading...</option>}
              {allModels.map((m) => (
                <option key={`${m.providerUrl}-${m.name}`} value={m.name}>{m.name}{m.size_gb ? ` (${m.size_gb} GB)` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 4 }}>Endpoint</label>
            <input
              className="input"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              disabled={running}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 6 }}>Suites</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_SUITES.map((suite) => (
              <label
                key={suite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${selectedSuites.includes(suite.id) ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedSuites.includes(suite.id) ? 'rgba(59,130,246,0.1)' : 'transparent',
                  cursor: running ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSuites.includes(suite.id)}
                  onChange={() => toggleSuite(suite.id)}
                  disabled={running}
                  style={{ display: 'none' }}
                />
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: `1.5px solid ${selectedSuites.includes(suite.id) ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: selectedSuites.includes(suite.id) ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                }}>
                  {selectedSuites.includes(suite.id) && (
                    <span style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 'bold' }}>✓</span>
                  )}
                </span>
                {suite.label}
              </label>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running || !selectedModel || selectedSuites.length === 0}
          style={{ alignSelf: 'flex-start', padding: '10px 24px' }}
        >
          {running ? 'Running...' : 'Run Benchmark'}
        </button>
      </div>

      {/* Progress / Results */}
      {(running || result || error) && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {running ? 'Running...' : error ? 'Failed' : 'Results'}
          </div>

          {running && (
            <div className="progress-bar" style={{ marginBottom: 8 }}>
              <div className="progress-bar-fill" style={{ width: '100%', animation: 'pulse 2s infinite' }} />
            </div>
          )}

          {events.length > 0 && (
            <div style={{
              background: 'var(--bg)',
              borderRadius: 6,
              padding: 12,
              maxHeight: 200,
              overflow: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: '0.75rem',
              lineHeight: 1.6,
              color: 'var(--text-dim)',
            }}>
              {events.map((ev, i) => (
                <div key={i}>
                  {ev.type === 'error' ? (
                    <span style={{ color: 'var(--red)' }}>Error: {ev.data?.error}</span>
                  ) : ev.type === 'complete' ? (
                    <span style={{ color: 'var(--green)' }}>✓ Complete — Score: {ev.data?.overall_score?.toFixed(1)}</span>
                  ) : ev.type === 'done' ? (
                    <span style={{ color: 'var(--green)' }}>Done ({ev.data?.status})</span>
                  ) : (
                    <span>{JSON.stringify(ev)}</span>
                  )}
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          )}

          {error && (
            <div style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}>{error}</div>
          )}

          {result && <ResultSummary result={result} />}
        </div>
      )}

      {/* History */}
      <RunHistory runs={runs} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function ResultSummary({ result }: { result: any }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>Overall</div>
          <ScoreBadge score={result.overall_score || 0} size="lg" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>Quality</div>
          <ScoreBadge score={result.quality_score || 0} size="md" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>Speed</div>
          <ScoreBadge score={result.speed_score || 0} size="md" />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>Reliability</div>
          <ScoreBadge score={result.reliability_score || 0} size="md" />
        </div>
      </div>

      {result.suites && Object.keys(result.suites).length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Suite</th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Score</th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Pass Rate</th>
              <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Latency</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.suites).map(([name, suite]: [string, any]) => (
              <tr key={name} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>{name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <ScoreBadge score={suite.score || 0} size="sm" />
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)' }}>
                  {suite.task_count ? `${suite.pass_count}/${suite.task_count}` : '-'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  {suite.median_latency_ms ? `${suite.median_latency_ms.toFixed(0)}ms` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RunHistory({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return null

  return (
    <div>
      <div className="section-title">Run History</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Model</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Overall</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Quality</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Speed</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Reliability</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Runtime</th>
              <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{run.model}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <ScoreBadge score={run.overall_score} size="sm" />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <ScoreBadge score={run.quality_score} size="sm" />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <ScoreBadge score={run.speed_score} size="sm" />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <ScoreBadge score={run.reliability_score} size="sm" />
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>
                  {run.total_runtime_sec.toFixed(1)}s
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                  {new Date(run.timestamp).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
