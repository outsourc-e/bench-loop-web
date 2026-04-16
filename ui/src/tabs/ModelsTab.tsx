import { useState } from 'react'
import { useModels, useHFModels, useActivePulls, pullModel } from '../hooks/useApi'
import type { PullInfo } from '../hooks/useApi'
import HardwareSummary from '../components/HardwareSummary'

interface Props {
  onBenchmark: (model: string, endpoint: string) => void
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function ModelsTab({ onBenchmark }: Props) {
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [addingEndpoint, setAddingEndpoint] = useState(false)
  const { data, loading, refresh } = useModels(customEndpoint || undefined)
  const [hfSearch, setHfSearch] = useState('')
  const [hfFormat, setHfFormat] = useState('')
  const [hfPage, setHfPage] = useState(1)
  const { data: hfData, loading: hfLoading } = useHFModels(hfSearch, hfFormat, hfPage)
  const FORMAT_OPTIONS = ['', 'gguf', 'mlx', 'gptq', 'awq', 'fp16', 'fp8', 'bf16']
  const [pullInput, setPullInput] = useState('')
  const [pullEndpoint, setPullEndpoint] = useState('http://localhost:11434')
  const [pulling, setPulling] = useState(false)
  const activePulls = useActivePulls(1000)

  const hasProviders = data && data.providers && data.providers.length > 0
  const hasOllama = data?.providers?.some((p) => p.type === 'ollama') ?? false

  const handlePull = async (modelName?: string) => {
    const name = (modelName || pullInput).trim()
    if (!name) return
    setPulling(true)
    try {
      await pullModel(name, pullEndpoint)
      if (!modelName) setPullInput('')
    } catch (e) {
      console.error('Pull failed:', e)
    } finally {
      setPulling(false)
    }
  }

  return (
    <div>
      <HardwareSummary />

      {/* Quick Pull */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: activePulls.length > 0 ? 14 : 0 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Pull Model</span>
          <input
            type="text"
            placeholder="e.g. qwen3:8b, llama3.2:3b, phi4-mini..."
            value={pullInput}
            onChange={(e) => setPullInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePull() }}
            className="input"
            style={{ flex: 1, padding: '8px 12px' }}
            disabled={pulling}
          />
          <button
            className="btn btn-primary"
            style={{ padding: '8px 20px', whiteSpace: 'nowrap' }}
            onClick={() => handlePull()}
            disabled={pulling || !pullInput.trim()}
          >
            {pulling ? 'Starting...' : 'Pull'}
          </button>
        </div>

        {/* Active Pulls */}
        {activePulls.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePulls.map((pull) => (
              <PullProgressCard key={pull.pull_id} pull={pull} onBenchmark={onBenchmark} hasOllama={hasOllama} onRefreshModels={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* Provider section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="section-title" style={{ margin: 0 }}>Model Providers</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!addingEndpoint ? (
            <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => setAddingEndpoint(true)}>
              + Add Endpoint
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                placeholder="http://192.168.1.100:11434"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { refresh(); setAddingEndpoint(false); } }}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--mono)',
                  width: 260,
                }}
              />
              <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => { refresh(); setAddingEndpoint(false); }}>
                Connect
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { setCustomEndpoint(''); setAddingEndpoint(false); refresh(); }}>
                ✕
              </button>
            </div>
          )}
          <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', padding: '16px 0' }}>Scanning for providers...</div>}

      {!loading && !hasProviders && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', marginBottom: 24 }}>
          <h3 style={{ marginBottom: 8, color: '#fff' }}>No model providers detected</h3>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16, maxWidth: 480, margin: '0 auto 16px' }}>
            BenchLoop auto-scans for Ollama, LM Studio, oMLX, Jan, and vLLM on their default ports.
            Start one of these, or add a custom endpoint.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="btn btn-primary" style={{ fontSize: '0.8rem' }}>
              Install Ollama
            </a>
            <a href="https://lmstudio.ai/" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
              LM Studio
            </a>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={() => setAddingEndpoint(true)}>
              Add Remote Endpoint
            </button>
          </div>
          {data?.error && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 12, fontFamily: 'var(--mono)' }}>
              {data.error}
            </p>
          )}
        </div>
      )}

      {hasProviders && data.providers.map((provider) => (
        <div key={provider.url} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>{provider.label}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>
              {provider.url}
            </span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>
              · {provider.model_count} model{provider.model_count !== 1 ? 's' : ''}
            </span>
          </div>

          {provider.models.length === 0 ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-dim)' }}>Provider online but no models loaded.</p>
              {provider.type === 'ollama' && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Pull a model: <code style={{ color: 'var(--accent)' }}>ollama pull qwen3:8b</code>
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {provider.models.map((model) => (
                <div key={model.name} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.9rem' }}>{model.name}</div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: 2 }}>
                        {[model.parameter_size, model.family, model.format].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {model.size_gb && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                        {model.size_gb} GB
                      </span>
                    )}
                  </div>
                  {model.quantization && (
                    <span style={{
                      display: 'inline-block', background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '1px 8px', fontSize: '0.65rem', fontFamily: 'var(--mono)',
                      color: 'var(--text-dim)', alignSelf: 'flex-start',
                    }}>
                      {model.quantization}
                    </span>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ marginTop: 'auto', width: '100%', fontSize: '0.8rem', padding: '6px' }}
                    onClick={() => onBenchmark(model.name, provider.url)}
                  >
                    Benchmark →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Trending on HuggingFace */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="section-title" style={{ margin: 0 }}>🔥 Trending on HuggingFace</div>
        </div>

        {/* Search + Format filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search models..."
            value={hfSearch}
            onChange={(e) => { setHfSearch(e.target.value); setHfPage(1); }}
            style={{
              background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 12px', color: '#fff', fontSize: '0.8rem', width: 240,
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {FORMAT_OPTIONS.map((fmt) => (
              <button
                key={fmt || 'all'}
                onClick={() => { setHfFormat(fmt); setHfPage(1); }}
                style={{
                  background: hfFormat === fmt ? 'var(--accent)' : 'var(--card-bg)',
                  color: hfFormat === fmt ? '#fff' : 'var(--text-dim)',
                  border: `1px solid ${hfFormat === fmt ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 4, padding: '4px 10px', fontSize: '0.7rem',
                  fontFamily: 'var(--mono)', cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                {fmt || 'All'}
              </button>
            ))}
          </div>
        </div>

        {hfLoading && <div style={{ color: 'var(--text-dim)', padding: '16px 0' }}>Loading...</div>}

        {!hfLoading && hfData && hfData.models.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
              {hfData.models.map((m) => (
                <div key={m.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <img
                      src={m.avatar_url}
                      alt={m.author}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      style={{
                        width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                        background: 'var(--bg)', border: '1px solid var(--border)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{m.author}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: '0.7rem', fontFamily: 'var(--mono)', color: 'var(--text-dim)', flexShrink: 0 }}>
                      <span title="Downloads">↓ {formatNumber(m.downloads)}</span>
                      <span title="Likes">♥ {formatNumber(m.likes)}</span>
                    </div>
                  </div>

                  {m.formats.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {m.formats.map((f) => (
                        <span key={f} style={{
                          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                          padding: '1px 7px', fontSize: '0.6rem', fontFamily: 'var(--mono)',
                          color: 'var(--text-dim)', textTransform: 'uppercase',
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', padding: '5px', textDecoration: 'none' }}
                    >
                      View on HF
                    </a>
                    <a
                      href={`https://huggingface.co/${m.id}/tree/main`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', padding: '5px', textDecoration: 'none' }}
                    >
                      Download ↓
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {hfData.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                  disabled={hfPage <= 1}
                  onClick={() => setHfPage((p) => Math.max(1, p - 1))}
                >
                  ← Prev
                </button>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>
                  Page {hfData.page} of {hfData.pages}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 12px' }}
                  disabled={hfPage >= hfData.pages}
                  onClick={() => setHfPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        {!hfLoading && hfData && hfData.models.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--text-dim)' }}>No models found{hfSearch ? ` for "${hfSearch}"` : ''}{hfFormat ? ` in ${hfFormat.toUpperCase()} format` : ''}.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function PullProgressCard({ pull, onBenchmark, hasOllama, onRefreshModels }: { pull: PullInfo; onBenchmark: (model: string, endpoint: string) => void; hasOllama: boolean; onRefreshModels: () => void }) {
  const isDone = pull.done && !pull.error
  const isFailed = pull.done && !!pull.error
  const isActive = !pull.done

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: 'var(--bg)',
      borderRadius: 6,
      border: `1px solid ${isFailed ? 'var(--red)' : isDone ? 'var(--green)' : 'var(--border)'}`,
    }}>
      {/* Status icon */}
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>
        {isDone ? '✅' : isFailed ? '❌' : '⏳'}
      </span>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isActive ? 6 : 0 }}>
          <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem', fontFamily: 'var(--mono)' }}>
            {pull.model}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {isFailed ? pull.error : isDone ? 'Ready' : pull.status}
            {isActive && pull.total_bytes > 0 && ` · ${formatBytes(pull.completed_bytes)} / ${formatBytes(pull.total_bytes)}`}
          </span>
        </div>

        {/* Progress bar */}
        {isActive && (
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pull.progress}%`,
              background: 'var(--accent)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}
      </div>

      {/* Actions */}
      {isDone && (
        <button
          className="btn btn-primary"
          style={{ fontSize: '0.75rem', padding: '5px 14px', flexShrink: 0 }}
          onClick={() => { onRefreshModels(); onBenchmark(pull.model, pull.endpoint); }}
        >
          Benchmark →
        </button>
      )}
    </div>
  )
}
