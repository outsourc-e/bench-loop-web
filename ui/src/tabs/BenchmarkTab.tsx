import { useEffect, useMemo, useRef, useState } from 'react'
import { useModels, useRuns, startBenchmark, type RunSummary } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

const ALL_SUITES = [
  { id: 'speed', label: 'Speed', short: 'SPD', color: 'var(--blue)' },
  { id: 'toolcall', label: 'Tool Calling', short: 'TOOL', color: 'var(--accent)' },
  { id: 'coding', label: 'Coding', short: 'CODE', color: '#5fb7ff' },
  { id: 'dataextract', label: 'Data Extract', short: 'DATA', color: 'var(--yellow)' },
  { id: 'instructfollow', label: 'Instruct Follow', short: 'INST', color: 'var(--orange)' },
  { id: 'reasonmath', label: 'Reason & Math', short: 'MATH', color: '#c084fc' },
  { id: 'agent', label: 'Agent Loop', short: 'AGENT', color: '#2dd47f' },
] as const

const SUITE_META = Object.fromEntries(ALL_SUITES.map((suite) => [suite.id, suite]))

/**
 * Turn a raw backend health-check failure into an actionable diagnosis.
 *
 * Most "unable to load model" errors on local Ollama are one of:
 *   - the Ollama binary is too old to understand the model's architecture
 *     or tensor quantization type (TQ, MXFP4, Qwen3.5/3.6 family, etc.)
 *   - the blob sha references a file that isn't on disk
 *   - the model name doesn't exist in `ollama list`
 *   - the endpoint is not running Ollama at all
 *
 * We parse the raw error and map it to a hint the user can act on, so the
 * benchmark surface stops printing raw 500s with no context.
 */
function diagnoseModelLoadError(
  rawError: string,
  model: string,
  endpoint: string,
): string {
  const err = rawError.trim()
  const lower = err.toLowerCase()

  // Missing blob — file was deleted or never fully pulled
  if (lower.includes('no such file or directory')) {
    return (
      `Model file missing on disk for \`${model}\`. The model registry references ` +
      `a blob that is not present. Fix: \`ollama rm ${model} && ollama pull ${model}\`.\n\n` +
      `Raw error: ${err.slice(0, 300)}`
    )
  }

  // Classic "unable to load model" — almost always an Ollama/llama.cpp
  // version mismatch against a new architecture or quant.
  if (lower.includes('unable to load model') || lower.includes('failed to load model')) {
    const isBlobPath = /blobs\/sha256-/.test(err)
    const base =
      `Ollama could not load \`${model}\`. This usually means the installed ` +
      `Ollama version is older than the model's architecture or quantization format ` +
      `(e.g. Qwen3.5/3.6, TQ1_0/TQ2_0, MXFP4).\n\n` +
      `Fix options (in order):\n` +
      `  1. Upgrade Ollama: \`brew upgrade ollama\` then restart \`ollama serve\`. ` +
      `Target version 0.12+ for TQ and qwen35 support.\n` +
      `  2. Try a different quant of the same model (Q4_K_M, Q8_0) — these are ` +
      `supported by most Ollama releases.\n` +
      `  3. Run the GGUF directly with a current \`llama-server\` and point BenchLoop ` +
      `at that endpoint instead.\n`
    return base + (isBlobPath ? `\nRaw error (blob path): ${err.slice(0, 300)}` : `\nRaw error: ${err.slice(0, 300)}`)
  }

  // Model not in registry
  if (lower.includes('model') && lower.includes('not found')) {
    return (
      `Model \`${model}\` is not installed at ${endpoint}. Fix: \`ollama pull ${model}\`.\n\n` +
      `Raw error: ${err.slice(0, 300)}`
    )
  }

  // Non-Ollama surface (404 on /api/chat, wrong endpoint)
  if (lower.includes('404') || lower.includes('not found') || lower.includes('cannot get /api/chat')) {
    return (
      `The endpoint ${endpoint} responded, but does not expose \`/api/chat\`. ` +
      `Make sure the Endpoint field points at an Ollama-compatible server ` +
      `(Ollama's /api/chat, or an OpenAI-compatible server wrapped accordingly).\n\n` +
      `Raw error: ${err.slice(0, 300)}`
    )
  }

  // CUDA / memory exhaustion
  if (lower.includes('out of memory') || lower.includes('cuda') || lower.includes('cudamalloc')) {
    return (
      `Model \`${model}\` failed to load due to GPU memory pressure. ` +
      `Fix: free VRAM (\`ollama stop --all\` on other machines), lower context size, ` +
      `or pick a smaller quant.\n\n` +
      `Raw error: ${err.slice(0, 300)}`
    )
  }

  // Default: show raw but with a clear label
  return `Model health check failed for \`${model}\` at ${endpoint}. Raw error: ${err.slice(0, 400)}`
}

type SuiteId = typeof ALL_SUITES[number]['id']
type BenchmarkEvent = Record<string, any>

type SuiteProgress = {
  status: 'pending' | 'running' | 'completed'
  completedTasks: number
  totalTasks: number
  score?: number
  passCount?: number
  currentTaskId?: string
  latestLatencyMs?: number
  latestPassed?: boolean
}

interface Props {
  preselectedModel: string | null
  preselectedEndpoint: string | null
  onClearPreselected: () => void
}

export default function BenchmarkTab({ preselectedModel, preselectedEndpoint, onClearPreselected }: Props) {
  const { data: modelsData, loading: modelsLoading } = useModels()
  const { runs, refresh: refreshRuns } = useRuns()

  const allModels = (modelsData?.providers || []).flatMap((p) =>
    p.models.map((m) => ({
      ...m,
      providerUrl: p.url,
      providerLabel: p.label,
      providerType: p.type, // 'ollama' or 'openai' (OpenAI-compatible like Osaurus/LM Studio/vLLM)
    }))
  )

  const [selectedModel, setSelectedModel] = useState('')
  const [endpoint, setEndpoint] = useState('http://localhost:11434')
  const [selectedSuites, setSelectedSuites] = useState<string[]>(['speed', 'toolcall', 'coding', 'dataextract', 'instructfollow', 'reasonmath', 'agent'])
  const [selectedHarness, setSelectedHarness] = useState<string>('raw')
  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<BenchmarkEvent[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const match = allModels.find((m) => m.name === selectedModel)
    if (match) setEndpoint(match.providerUrl)
  }, [selectedModel, allModels])

  // Resolve which provider/harness to send to the API based on the selected
  // model's source. 'ollama' → ollama provider. 'openai' → openai_compat
  // (covers LM Studio, vLLM, Osaurus/MLX, Jan, etc.). Falls back to ollama.
  const resolvedProviderName = (() => {
    const match = allModels.find((m) => m.name === selectedModel)
    if (!match) return 'ollama'
    return match.providerType === 'openai' ? 'openai_compat' : 'ollama'
  })()

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
    setRunId(null)
    setEvents([])
    setResult(null)
    setError(null)

    // Preflight: ask the API to verify the model can actually load.
    // Falls back to diagnosing raw /api/chat errors if the preflight endpoint
    // isn't available (older backend).
    try {
      const preflightUrl = `/api/models/preflight?endpoint=${encodeURIComponent(
        endpoint,
      )}&model=${encodeURIComponent(selectedModel)}`
      const preflightResp = await fetch(preflightUrl)
      if (preflightResp.ok) {
        const data = await preflightResp.json()
        if (!data.ok) {
          setError(data.message || `Preflight failed: ${data.reason || 'unknown'}`)
          setRunning(false)
          return
        }
      } else if (preflightResp.status !== 404) {
        // Preflight exists but returned error — fall through to raw chat path
        // so we still get a real diagnosis.
      }
    } catch {
      // Preflight unreachable — fall through to raw chat probe
    }

    // Health probe: ollama uses /api/chat, openai-compat uses /v1/chat/completions.
    // Skip the probe entirely if the preflight already greenlit the model (preflight
    // call above would have set error and returned if it failed).
    try {
      const isOpenAI = resolvedProviderName === 'openai_compat'
      const probeUrl = isOpenAI
        ? endpoint.replace(/\/$/, '') + '/v1/chat/completions'
        : endpoint.replace(/\/$/, '') + '/api/chat'
      const probeBody = isOpenAI
        ? { model: selectedModel, messages: [{ role: 'user', content: 'Say ok' }], max_tokens: 4 }
        : { model: selectedModel, messages: [{ role: 'user', content: 'Say ok' }], stream: false }
      const healthResp = await fetch(probeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(probeBody),
      })
      if (!healthResp.ok) {
        const errText = await healthResp.text().catch(() => healthResp.statusText)
        const diagnosis = diagnoseModelLoadError(errText, selectedModel, endpoint)
        setError(diagnosis)
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
        provider: resolvedProviderName,
        harness: selectedHarness,
      })
      setRunId(run_id)

      const evtSource = new EventSource(`/api/benchmark/stream/${run_id}`)
      evtSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          setEvents((prev) => [...prev, data])

          if (data.type === 'done') {
            evtSource.close()
            fetch(`/api/benchmark/runs/${run_id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d.result) setResult(d.result)
                if (d.error) setError(d.error)
                refreshRuns()
              })
              .finally(() => setRunning(false))
          } else if (data.type === 'error' || data.type === 'run_failed') {
            evtSource.close()
            setError(data.error || 'Benchmark failed')
            setRunning(false)
          }
        } catch {
          setError('Failed to parse benchmark event stream')
          setRunning(false)
        }
      }
      evtSource.onerror = () => {
        evtSource.close()
        const poll = setInterval(() => {
          fetch(`/api/benchmark/runs/${run_id}`)
            .then((r) => r.json())
            .then((d) => {
              if (d.status === 'completed' || d.status === 'failed') {
                clearInterval(poll)
                if (d.result) setResult(d.result)
                if (d.error) setError(d.error)
                setRunning(false)
                refreshRuns()
              }
            })
            .catch(() => {})
        }, 2000)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start benchmark')
      setRunning(false)
    }
  }

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const progressState = useMemo(() => deriveProgressState(events, selectedSuites), [events, selectedSuites])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
              {allModels.map((m: any) => {
                const unsupported = m.supported === false
                const prefix = unsupported ? '⚠️ ' : ''
                return (
                  <option
                    key={`${m.providerUrl}-${m.name}`}
                    value={m.name}
                  >
                    {prefix}
                    {m.name}
                    {m.size_gb ? ` (${m.size_gb} GB)` : ''}
                    {unsupported ? ' — needs Ollama upgrade' : ''}
                  </option>
                )
              })}
            </select>
            {(() => {
              const current: any = allModels.find((m) => m.name === selectedModel)
              if (current && current.supported === false && current.warning) {
                return (
                  <div
                    style={{
                      marginTop: 6,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: 'rgba(234, 179, 8, 0.1)',
                      border: '1px solid rgba(234, 179, 8, 0.3)',
                      fontSize: '0.75rem',
                      color: 'var(--text)',
                      lineHeight: 1.45,
                    }}
                  >
                    ⚠️ {current.warning}
                  </div>
                )
              }
              return null
            })()}
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
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 6 }}>
            Harness <span style={{ color: 'var(--text-muted)' }}>— prompt + parse contract for tool calling</span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { id: 'raw', label: 'Raw', desc: 'Native OpenAI-style tool calling (default)' },
              { id: 'hermes', label: 'Hermes', desc: '<tool_call>{...}</tool_call> XML tags' },
              { id: 'qwen', label: 'Qwen', desc: '<function_call>{...}</function_call> tags' },
              { id: 'pi', label: 'Pi', desc: '<think>...</think> + Hermes tags' },
            ].map((h) => (
              <label
                key={h.id}
                title={h.desc}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px',
                  borderRadius: 999,
                  border: `1px solid ${selectedHarness === h.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: selectedHarness === h.id ? 'var(--accent-soft)' : 'transparent',
                  cursor: running ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: selectedHarness === h.id ? 700 : 500,
                  color: selectedHarness === h.id ? 'var(--accent)' : 'var(--text)',
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="harness"
                  value={h.id}
                  checked={selectedHarness === h.id}
                  onChange={(e) => setSelectedHarness(e.target.value)}
                  disabled={running}
                  style={{ display: 'none' }}
                />
                {h.label}
              </label>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 6 }}>Suites</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_SUITES.map((suite) => (
              <label
                key={suite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: `1px solid ${selectedSuites.includes(suite.id) ? suite.color : 'var(--border)'}`,
                  background: selectedSuites.includes(suite.id) ? 'var(--accent-soft)' : 'transparent',
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
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: selectedSuites.includes(suite.id) ? suite.color : 'var(--border)',
                  boxShadow: selectedSuites.includes(suite.id) ? `0 0 10px ${suite.color}` : 'none',
                }} />
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

      {(running || result || error || events.length > 0) && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>
            {running ? 'Live Benchmark Run' : error ? 'Run Status' : 'Results Overview'}
          </div>

          {(running || events.length > 0) && (
            <LiveProgressPanel progress={progressState} runId={runId} running={running} />
          )}

          {error && (
            <div style={{
              color: 'var(--red)',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10,
              padding: '12px 14px',
              fontFamily: 'var(--mono)',
              fontSize: '0.8rem',
            }}>
              {error}
            </div>
          )}

          {result && <ResultSummary result={result} />}

          {events.length > 0 && (
            <EventTimeline events={events} eventsEndRef={eventsEndRef} />
          )}
        </div>
      )}

      <RunHistory runs={runs} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  )
}

function LiveProgressPanel({ progress, runId, running }: { progress: ReturnType<typeof deriveProgressState>, runId: string | null, running: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
      }}>
        <MetricCard label="Run ID" value={runId || 'pending'} mono />
        <MetricCard label="Progress" value={`${progress.completedTasks}/${progress.totalTasks || progress.selectedSuites.length}`} />
        <MetricCard label="Suites Done" value={`${progress.completedSuites}/${progress.selectedSuites.length}`} />
        <MetricCard label="Status" value={running ? 'running' : progress.runCompleted ? 'complete' : 'queued'} tone={running ? 'var(--accent)' : 'var(--text)'} />
      </div>

      <div style={{
        position: 'relative',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 12,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text)' }}>Overall benchmark progress</span>
          <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{progress.overallPercent}%</span>
        </div>
        <div className="progress-bar" style={{ height: 12, borderRadius: 999 }}>
          <div className="progress-bar-fill" style={{ width: `${progress.overallPercent}%`, borderRadius: 999, position: 'relative' }}>
            {running && progress.overallPercent < 100 && (
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  width: '40%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                  animation: 'scan 1.8s linear infinite',
                }} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {progress.selectedSuites.map((suiteId) => (
          <SuiteProgressCard key={suiteId} suiteId={suiteId as SuiteId} progress={progress.suites[suiteId] || emptySuiteProgress()} />
        ))}
      </div>
    </div>
  )
}

function SuiteProgressCard({ suiteId, progress }: { suiteId: SuiteId, progress: SuiteProgress }) {
  // Guard against suites missing from SUITE_META (forward-compat for new suites
  // shipped by the API but not yet declared in ALL_SUITES on the UI side).
  const meta = SUITE_META[suiteId] || { id: suiteId, label: String(suiteId), short: String(suiteId).slice(0, 4).toUpperCase(), color: 'var(--accent)' }
  const percent = progress.totalTasks ? Math.round((progress.completedTasks / progress.totalTasks) * 100) : progress.status === 'completed' ? 100 : 0

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>{meta.label}</div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{progress.status}</div>
        </div>
        <div style={{
          minWidth: 42,
          textAlign: 'center',
          padding: '4px 8px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.04)',
          color: meta.color,
          fontFamily: 'var(--mono)',
          fontSize: '0.75rem',
        }}>
          {percent}%
        </div>
      </div>

      <div className="progress-bar" style={{ height: 8 }}>
        <div className="progress-bar-fill" style={{ width: `${percent}%`, background: meta.color }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-dim)', fontSize: '0.76rem', fontFamily: 'var(--mono)' }}>
        <span>{progress.completedTasks}/{progress.totalTasks || 0} tasks</span>
        <span>{progress.latestLatencyMs ? `${progress.latestLatencyMs.toFixed(0)}ms` : '...'}</span>
      </div>

      <TaskDotStrip completedTasks={progress.completedTasks} totalTasks={progress.totalTasks} passed={progress.latestPassed} color={meta.color} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, minHeight: 18 }}>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem' }}>
          {progress.currentTaskId ? `Current: ${progress.currentTaskId}` : progress.status === 'completed' ? 'Suite complete' : 'Waiting'}
        </span>
        {typeof progress.score === 'number' && <ScoreBadge score={progress.score} size="sm" />}
      </div>
    </div>
  )
}

function TaskDotStrip({ completedTasks, totalTasks, passed, color }: { completedTasks: number, totalTasks: number, passed?: boolean, color: string }) {
  const dotCount = Math.min(Math.max(totalTasks || completedTasks || 6, 6), 24)
  const filled = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * dotCount) : completedTasks > 0 ? Math.min(completedTasks, dotCount) : 0

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dotCount}, 1fr)`, gap: 4 }}>
      {Array.from({ length: dotCount }).map((_, index) => {
        const active = index < filled
        return (
          <div
            key={index}
            style={{
              height: 8,
              borderRadius: 999,
              background: active ? (passed === false && index === filled - 1 ? 'var(--red)' : color) : 'rgba(255,255,255,0.07)',
              boxShadow: active ? `0 0 10px ${passed === false && index === filled - 1 ? 'rgba(239,68,68,0.5)' : color}` : 'none',
              opacity: active ? 1 : 0.7,
            }}
          />
        )
      })}
    </div>
  )
}

function ResultSummary({ result }: { result: any }) {
  const suiteEntries = Object.entries(result.suites || {}) as [string, any][]
  const radarData = [
    { label: 'Overall', score: result.overall_score || 0, color: '#ffffff' },
    { label: 'Quality', score: result.quality_score || 0, color: 'var(--accent)' },
    { label: 'Speed', score: result.speed_score || 0, color: 'var(--blue)' },
    { label: 'Reliability', score: result.reliability_score || 0, color: 'var(--yellow)' },
  ]

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          background: 'linear-gradient(180deg, rgba(34,197,94,0.06), rgba(34,197,94,0.01))',
        }}>
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

          <div style={{ display: 'grid', gap: 10 }}>
            {radarData.map((metric) => (
              <BarMetric key={metric.label} label={metric.label} score={metric.score} color={metric.color} />
            ))}
          </div>
        </div>

        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          background: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <RadarChart metrics={radarData} />
        </div>
      </div>

      {suiteEntries.length > 0 && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>Suite breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {suiteEntries.map(([name, suite]) => (
              <SuiteResultCard key={name} name={name} suite={suite} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SuiteResultCard({ name, suite }: { name: string, suite: any }) {
  const meta = SUITE_META[name as SuiteId] || { label: name, color: 'var(--accent)' }
  const passRate = suite.task_count ? (suite.pass_count / suite.task_count) * 100 : 0

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 14,
      background: 'rgba(255,255,255,0.02)',
      display: 'grid',
      gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: 'var(--text)', fontWeight: 600 }}>{meta.label}</div>
        <ScoreBadge score={suite.score || 0} size="sm" />
      </div>

      <BarMetric label="Suite score" score={suite.score || 0} color={meta.color} />
      <BarMetric label="Pass rate" score={passRate} color="var(--yellow)" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <MiniStat label="Pass" value={`${suite.pass_count || 0}/${suite.task_count || 0}`} />
        <MiniStat label="Latency" value={suite.median_latency_ms ? `${suite.median_latency_ms.toFixed(0)}ms` : '-'} />
        <MiniStat label="Partial" value={String(suite.partial_count || 0)} />
      </div>
    </div>
  )
}

function EventTimeline({ events, eventsEndRef }: { events: BenchmarkEvent[], eventsEndRef: React.RefObject<HTMLDivElement | null> }) {
  const condensed = events.slice(-12).reverse()

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>Recent activity</div>
      <div style={{
        background: 'var(--bg)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        padding: 12,
        maxHeight: 280,
        overflow: 'auto',
        display: 'grid',
        gap: 8,
      }}>
        {condensed.map((ev, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr auto',
            gap: 10,
            alignItems: 'center',
            paddingBottom: 8,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            fontSize: '0.78rem',
          }}>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{ev.type}</span>
            <span style={{ color: 'var(--text)' }}>{formatEvent(ev)}</span>
            {'score' in ev && typeof ev.score === 'number' ? <ScoreBadge score={ev.score} size="sm" /> : <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>{ev.completed_tasks && ev.total_tasks ? `${ev.completed_tasks}/${ev.total_tasks}` : ''}</span>}
          </div>
        ))}
        <div ref={eventsEndRef} />
      </div>
    </div>
  )
}

function RunHistory({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return null

  const th = { textAlign: 'right' as const, padding: '10px 10px', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' as const }
  const td = { padding: '10px 10px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const }
  const mono = { fontFamily: 'var(--mono)', color: 'var(--text-dim)' }

  return (
    <div>
      <div className="section-title">Run History</div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
              <th style={{ ...th, textAlign: 'left' }}>Model</th>
              <th style={th}>Overall</th>
              <th style={th}>Quality</th>
              <th style={th}>Speed</th>
              <th style={th}>Reliability</th>
              <th style={th}>tok/s</th>
              <th style={th}>TTFT</th>
              <th style={{ ...th, textAlign: 'left' }}>Hardware</th>
              <th style={th}>Runtime</th>
              <th style={th}>Date</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const modelName = run.model || 'unknown-model'
              const gpu = (run.gpu || '').replace('NVIDIA GeForce ', '').replace('Apple ', '')
              const vram = typeof run.gpu_memory_gb === 'number' && run.gpu_memory_gb > 0 ? `${run.gpu_memory_gb.toFixed(0)}G` : ''
              const hw = [gpu, vram].filter(Boolean).join(' ') || run.machine || '-'
              const genTokPerSec = typeof run.generation_tok_per_sec === 'number' ? run.generation_tok_per_sec : 0
              const ttft = typeof run.ttft_ms === 'number' ? run.ttft_ms : 0
              const runtimeSec = typeof run.total_runtime_sec === 'number' ? run.total_runtime_sec : null
              const sysMem = typeof run.system_memory_gb === 'number' ? run.system_memory_gb : null
              return (
                <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 500 }} title={run.harness ? `${modelName} (${run.harness})` : modelName}>
                    {modelName.length > 30 ? modelName.slice(0, 28) + '…' : modelName}
                  </td>
                  <td style={td}><ScoreBadge score={run.overall_score} size="sm" /></td>
                  <td style={td}><ScoreBadge score={run.quality_score} size="sm" /></td>
                  <td style={td}><ScoreBadge score={run.speed_score} size="sm" /></td>
                  <td style={td}><ScoreBadge score={run.reliability_score} size="sm" /></td>
                  <td style={{ ...td, ...mono }}>{genTokPerSec ? genTokPerSec.toFixed(1) : '-'}</td>
                  <td style={{ ...td, ...mono }}>{ttft ? `${ttft.toFixed(0)}ms` : '-'}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'left', color: 'var(--text-dim)', fontSize: '0.72rem' }} title={`${run.gpu || ''}${run.cpu ? ' / ' + run.cpu : ''}${sysMem ? ' / ' + sysMem.toFixed(0) + 'G RAM' : ''}`}>
                    {hw}
                  </td>
                  <td style={{ ...td, ...mono, fontSize: '0.72rem' }}>{runtimeSec != null ? `${runtimeSec.toFixed(1)}s` : '-'}</td>
                  <td style={{ ...td, color: 'var(--text-dim)', fontSize: '0.72rem' }}>{run.timestamp ? new Date(run.timestamp).toLocaleDateString() : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MetricCard({ label, value, mono, tone }: { label: string, value: string, mono?: boolean, tone?: string }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 12,
      display: 'grid',
      gap: 6,
    }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ color: tone || 'var(--text)', fontFamily: mono ? 'var(--mono)' : 'var(--sans)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string, value: string }) {
  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '10px 8px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
    </div>
  )
}

function BarMetric({ label, score, color }: { label: string, score: number, color: string }) {
  const safe = Math.max(0, Math.min(100, score || 0))
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
        <span style={{ color: 'var(--text-dim)' }}>{label}</span>
        <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{safe.toFixed(1)}</span>
      </div>
      <div className="progress-bar" style={{ height: 10 }}>
        <div className="progress-bar-fill" style={{ width: `${safe}%`, background: color }} />
      </div>
    </div>
  )
}

function RadarChart({ metrics }: { metrics: Array<{ label: string, score: number, color: string }> }) {
  const size = 260
  const center = size / 2
  const radius = 84
  const levels = [25, 50, 75, 100]
  const points = metrics.map((metric, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2
    const r = (Math.max(0, Math.min(100, metric.score)) / 100) * radius
    return {
      ...metric,
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      labelX: center + Math.cos(angle) * (radius + 28),
      labelY: center + Math.sin(angle) * (radius + 28),
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
    }
  })

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 260 }}>
      {levels.map((level) => {
        const ringPoints = metrics.map((_, index) => {
          const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2
          const r = (level / 100) * radius
          return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`
        }).join(' ')
        return <polygon key={level} points={ringPoints} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
      })}

      {points.map((point) => (
        <line key={point.label} x1={center} y1={center} x2={point.axisX} y2={point.axisY} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}

      <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="rgba(34,197,94,0.18)" stroke="var(--accent)" strokeWidth="2" />

      {points.map((point) => (
        <g key={point.label}>
          <circle cx={point.x} cy={point.y} r="4" fill="var(--accent)" />
          <text x={point.labelX} y={point.labelY} textAnchor="middle" fill="var(--text-dim)" fontSize="10">{point.label}</text>
        </g>
      ))}
    </svg>
  )
}

function deriveProgressState(events: BenchmarkEvent[], selectedSuites: string[]) {
  const suites: Record<string, SuiteProgress> = Object.fromEntries(selectedSuites.map((suiteId) => [suiteId, emptySuiteProgress()]))
  let totalTasks = 0
  let completedTasks = 0
  let runCompleted = false

  for (const event of events) {
    if (event.type === 'run_started') {
      totalTasks = event.total_tasks || totalTasks
      for (const [suiteId, count] of Object.entries(event.suite_task_counts || {})) {
        suites[suiteId] = {
          ...(suites[suiteId] || emptySuiteProgress()),
          totalTasks: Number(count) || 0,
        }
      }
    }

    if (event.type === 'suite_started' && event.suite) {
      suites[event.suite] = {
        ...(suites[event.suite] || emptySuiteProgress()),
        status: 'running',
        totalTasks: event.task_count || suites[event.suite]?.totalTasks || 0,
      }
    }

    if (event.type === 'task_completed' && event.suite) {
      completedTasks = event.completed_tasks || completedTasks
      totalTasks = event.total_tasks || totalTasks
      suites[event.suite] = {
        ...(suites[event.suite] || emptySuiteProgress()),
        status: 'running',
        completedTasks: Math.min((suites[event.suite]?.completedTasks || 0) + 1, event.total_tasks || suites[event.suite]?.totalTasks || 0),
        totalTasks: suites[event.suite]?.totalTasks || 0,
        currentTaskId: event.task_id,
        latestLatencyMs: event.latency_ms,
        latestPassed: event.passed,
      }
    }

    if (event.type === 'suite_completed' && event.suite) {
      suites[event.suite] = {
        ...(suites[event.suite] || emptySuiteProgress()),
        status: 'completed',
        completedTasks: event.task_count || suites[event.suite]?.completedTasks || 0,
        totalTasks: event.task_count || suites[event.suite]?.totalTasks || 0,
        score: event.score,
        passCount: event.pass_count,
      }
    }

    if (event.type === 'run_completed' || event.type === 'done') {
      runCompleted = true
    }
  }

  const completedSuites = Object.values(suites).filter((suite) => suite.status === 'completed').length
  const overallPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : completedSuites > 0 ? Math.round((completedSuites / Math.max(selectedSuites.length, 1)) * 100) : 0

  return {
    suites,
    totalTasks,
    completedTasks,
    completedSuites,
    overallPercent,
    runCompleted,
    selectedSuites,
  }
}

function emptySuiteProgress(): SuiteProgress {
  return {
    status: 'pending',
    completedTasks: 0,
    totalTasks: 0,
  }
}

function formatEvent(ev: BenchmarkEvent) {
  if (ev.type === 'run_started') return `Starting ${ev.total_tasks || 0} tasks across ${(ev.suites || []).length} suites`
  if (ev.type === 'suite_started') return `Suite ${labelForSuite(ev.suite)} started with ${ev.task_count || 0} tasks`
  if (ev.type === 'task_completed') return `${labelForSuite(ev.suite)} finished ${ev.task_id || 'task'} ${ev.passed ? '✓' : '✗'}`
  if (ev.type === 'suite_completed') return `${labelForSuite(ev.suite)} complete, ${ev.pass_count || 0}/${ev.task_count || 0} passed`
  if (ev.type === 'run_completed') return `Run complete in ${(ev.total_runtime_sec || 0).toFixed(1)}s`
  if (ev.type === 'done') return `Stream closed: ${ev.status || 'done'}`
  if (ev.type === 'run_failed') return ev.error || 'Run failed'
  return JSON.stringify(ev)
}

function labelForSuite(suiteId?: string) {
  if (!suiteId) return 'Unknown'
  return (SUITE_META[suiteId as SuiteId]?.label) || suiteId
}
