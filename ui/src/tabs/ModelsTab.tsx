import { useMemo, useState } from 'react'
import {
  getHFModelDetails,
  pullModel,
  useActivePulls,
  useHardware,
  useHFModels,
  useModels,
} from '../hooks/useApi'
import type { HFModel, HFModelDetails, PullInfo } from '../hooks/useApi'
import HardwareSummary from '../components/HardwareSummary'

interface Props {
  onBenchmark: (model: string, endpoint: string) => void
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatGb(gb?: number | null): string {
  if (!gb) return 'Unknown'
  return `${gb.toFixed(1)} GB`
}

function estimateRequiredVramGb(details: HFModelDetails | null, model: HFModel): number | null {
  const largest = details?.largest_gguf?.size_gb ?? details?.total_gguf_size_gb ?? null
  if (largest) return Math.max(largest * 1.15, 2)

  const name = `${model.author}/${model.name}`.toLowerCase()
  const match = name.match(/(\d+(?:\.\d+)?)b/)
  if (!match) return null
  const params = Number(match[1])
  return Math.max(params * 0.6, 2)
}

function fitTone(ok: boolean | null): { text: string; color: string } {
  if (ok === true) return { text: 'Should fit', color: 'var(--green)' }
  if (ok === false) return { text: 'Probably too large', color: 'var(--red)' }
  return { text: 'Unknown fit', color: 'var(--yellow)' }
}

export default function ModelsTab({ onBenchmark }: Props) {
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [addingEndpoint, setAddingEndpoint] = useState(false)
  const { data, loading, refresh } = useModels(customEndpoint || undefined)
  const { data: hardware } = useHardware()
  const [hfSearch, setHfSearch] = useState('')
  const [hfFormat, setHfFormat] = useState('')
  const [hfPage, setHfPage] = useState(1)
  const { data: hfData, loading: hfLoading } = useHFModels(hfSearch, hfFormat, hfPage)
  const FORMAT_OPTIONS = ['', 'gguf', 'mlx', 'gptq', 'awq', 'fp16', 'fp8', 'bf16']
  const activePulls = useActivePulls(1000)

  const [modalModel, setModalModel] = useState<HFModel | null>(null)
  const [modalDetails, setModalDetails] = useState<HFModelDetails | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [pullingModelId, setPullingModelId] = useState<string | null>(null)

  const hasProviders = data && data.providers && data.providers.length > 0
  const hasOllama = data?.providers?.some((p) => p.type === 'ollama') ?? false
  const ollamaEndpoint = data?.providers?.find((p) => p.type === 'ollama')?.url || 'http://localhost:11434'

  const findPull = (modelName: string) => activePulls.find((p) => p.model === modelName)

  const openPullModal = async (model: HFModel) => {
    setModalModel(model)
    setModalDetails(null)
    setModalLoading(true)
    try {
      const details = await getHFModelDetails(model.id)
      setModalDetails(details)
    } finally {
      setModalLoading(false)
    }
  }

  const confirmPull = async () => {
    if (!modalModel) return
    const pullTarget = `hf.co/${modalModel.id}`
    setPullingModelId(modalModel.id)
    try {
      await pullModel({ model: pullTarget, endpoint: ollamaEndpoint })
      setModalModel(null)
      setModalDetails(null)
    } finally {
      setPullingModelId(null)
    }
  }

  const isGguf = modalModel?.formats?.some((f) => f.toLowerCase() === 'gguf') ?? false
  const canPull = hasOllama

  const requiredVramGb = useMemo(() => {
    if (!modalModel) return null
    return estimateRequiredVramGb(modalDetails, modalModel)
  }, [modalDetails, modalModel])

  const availableVramGb = hardware?.gpu?.vram_total_mb ? hardware.gpu.vram_total_mb / 1024 : null
  const availableRamGb = hardware?.memory_total_mb ? hardware.memory_total_mb / 1024 : null
  const usableMemGb = availableVramGb || availableRamGb
  const largestFileGb = modalDetails?.largest_gguf?.size_gb ?? modalDetails?.total_gguf_size_gb ?? null
  const fitsVram = requiredVramGb && usableMemGb ? usableMemGb >= requiredVramGb : null
  const fitsDisk = largestFileGb && hardware?.disk_free_gb ? hardware.disk_free_gb >= largestFileGb * 1.2 : null

  return (
    <div>
      <HardwareSummary />

      {activePulls.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Active Downloads</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activePulls.map((pull) => (
              <PullProgressCard key={pull.pull_id} pull={pull} onBenchmark={onBenchmark} onRefreshModels={refresh} />
            ))}
          </div>
        </div>
      )}

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
                onKeyDown={(e) => { if (e.key === 'Enter') { refresh(); setAddingEndpoint(false) } }}
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
              <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={() => { refresh(); setAddingEndpoint(false) }}>
                Connect
              </button>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => { setCustomEndpoint(''); setAddingEndpoint(false); refresh() }}>
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
          {data?.error && <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 12, fontFamily: 'var(--mono)' }}>{data.error}</p>}
        </div>
      )}

      {hasProviders && data.providers.map((provider) => (
        <div key={provider.url} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>{provider.label}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>{provider.url}</span>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>· {provider.model_count} model{provider.model_count !== 1 ? 's' : ''}</span>
          </div>

          {provider.models.length === 0 ? (
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-dim)' }}>Provider online but no models loaded.</p>
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
                    {model.size_gb && <span style={{ fontFamily: 'var(--mono)', fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0 }}>{model.size_gb} GB</span>}
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
                  <button className="btn btn-secondary" style={{ marginTop: 'auto', width: '100%', fontSize: '0.8rem', padding: '6px' }} onClick={() => onBenchmark(model.name, provider.url)}>
                    Benchmark →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="section-title" style={{ margin: 0 }}>🔥 Trending on HuggingFace</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search models..."
            value={hfSearch}
            onChange={(e) => { setHfSearch(e.target.value); setHfPage(1) }}
            style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', color: '#fff', fontSize: '0.8rem', width: 240 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {FORMAT_OPTIONS.map((fmt) => (
              <button
                key={fmt || 'all'}
                onClick={() => { setHfFormat(fmt); setHfPage(1) }}
                style={{
                  background: hfFormat === fmt ? 'var(--accent)' : 'var(--card)',
                  color: hfFormat === fmt ? '#fff' : 'var(--text-dim)',
                  border: `1px solid ${hfFormat === fmt ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 4, padding: '4px 10px', fontSize: '0.7rem', fontFamily: 'var(--mono)', cursor: 'pointer', textTransform: 'uppercase',
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
              {hfData.models.map((m) => {
                const hfPullName = `hf.co/${m.id}`
                const cardPull = findPull(hfPullName)

                return (
                  <div key={m.id} className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <img
                        src={m.avatar_url}
                        alt={m.author}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
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
                          <span key={f} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 7px', fontSize: '0.6rem', fontFamily: 'var(--mono)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {cardPull ? (
                      <div style={{ marginTop: 'auto' }}>
                        <PullProgressCard pull={cardPull} onBenchmark={onBenchmark} onRefreshModels={refresh} compact />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                        <a href={m.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', padding: '5px', textDecoration: 'none' }}>
                          View on HF
                        </a>
                        <button className="btn btn-primary" style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', padding: '5px' }} onClick={() => openPullModal(m)}>
                          Download ↓
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {hfData.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, alignItems: 'center' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} disabled={hfPage <= 1} onClick={() => setHfPage((p) => Math.max(1, p - 1))}>
                  ← Prev
                </button>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>Page {hfData.page} of {hfData.pages}</span>
                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} disabled={hfPage >= hfData.pages} onClick={() => setHfPage((p) => p + 1)}>
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

      {modalModel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }} onClick={() => { if (!pullingModelId) setModalModel(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 720, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}>Model Fit Check</div>
                <h3 style={{ color: '#fff', marginBottom: 4 }}>{modalModel.name}</h3>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>{modalModel.author}</div>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setModalModel(null)} disabled={!!pullingModelId}>✕</button>
            </div>

            {modalLoading ? (
              <div style={{ color: 'var(--text-dim)', padding: '20px 0' }}>Loading model details...</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <SpecRow label="Largest GGUF file" value={modalDetails?.largest_gguf?.path || 'Unknown'} mono />
                  <SpecRow label="Download size" value={largestFileGb ? formatGb(largestFileGb) : 'Unknown'} />
                  <SpecRow label="Estimated VRAM needed" value={requiredVramGb ? formatGb(requiredVramGb) : 'Unknown'} />
                  <SpecRow label="Formats" value={modalModel.formats.join(', ').toUpperCase()} />
                  <SpecRow label="Your GPU" value={hardware?.gpu?.model || 'Unknown'} />
                  <SpecRow label="Your VRAM" value={availableVramGb ? formatGb(availableVramGb) : 'Unknown'} />
                  <SpecRow label="Free disk" value={hardware?.disk_free_gb ? formatGb(hardware.disk_free_gb) : 'Unknown'} />
                  <SpecRow label="Total RAM" value={hardware ? `${(hardware.memory_total_mb / 1024).toFixed(1)} GB` : 'Unknown'} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <FitCard title="VRAM fit" tone={fitTone(fitsVram)} detail={fitsVram === false ? 'Likely too large for full GPU residency.' : 'Estimate based on largest GGUF file size.'} />
                  <FitCard title="Disk fit" tone={fitTone(fitsDisk)} detail={fitsDisk === false ? 'You likely need more free disk before pulling.' : 'Includes a small safety buffer.'} />
                </div>

                {modalDetails?.error && <div style={{ color: 'var(--yellow)', fontSize: '0.8rem', marginBottom: 16 }}>Couldn’t read full model details, so this is a rough estimate.</div>}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                    {canPull ? (
                      <>Pull target: <span style={{ fontFamily: 'var(--mono)', color: '#fff' }}>{`hf.co/${modalModel.id}`}</span>{!isGguf && <span style={{ color: 'var(--yellow)', marginLeft: 8 }}>⚠ Non-GGUF — Ollama will attempt conversion</span>}</>
                    ) : (
                      <>Ollama not detected — <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>install Ollama</a> to pull directly</>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setModalModel(null)} disabled={!!pullingModelId}>Cancel</button>
                    {canPull ? (
                      <button className="btn btn-primary" onClick={confirmPull} disabled={!!pullingModelId || fitsDisk === false}>
                        {pullingModelId ? 'Starting...' : 'Pull model'}
                      </button>
                    ) : (
                      <a
                        href={`https://huggingface.co/${modalModel.id}/tree/main`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-primary"
                        style={{ textDecoration: 'none' }}
                        onClick={() => setModalModel(null)}
                      >
                        Download from HF ↓
                      </a>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SpecRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: '#fff', fontSize: '0.9rem', fontFamily: mono ? 'var(--mono)' : undefined, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

function FitCard({ title, tone, detail }: { title: string; tone: { text: string; color: string }; detail: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: `1px solid ${tone.color}`, borderRadius: 8, padding: 14 }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ color: tone.color, fontWeight: 700, marginBottom: 4 }}>{tone.text}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>{detail}</div>
    </div>
  )
}

function PullProgressCard({ pull, onBenchmark, onRefreshModels, compact = false }: { pull: PullInfo; onBenchmark: (model: string, endpoint: string) => void; onRefreshModels: () => void; compact?: boolean }) {
  const isDone = pull.done && !pull.error
  const isFailed = pull.done && !!pull.error
  const isActive = !pull.done

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 8 : 12,
      padding: compact ? '8px 10px' : '10px 14px',
      background: 'var(--bg)',
      borderRadius: 6,
      border: `1px solid ${isFailed ? 'var(--red)' : isDone ? 'var(--green)' : 'var(--border)'}`,
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{isDone ? '✅' : isFailed ? '❌' : '⏳'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isActive ? 6 : 0, gap: 10 }}>
          <span style={{ fontWeight: 600, color: '#fff', fontSize: compact ? '0.75rem' : '0.85rem', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pull.model}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {isFailed ? pull.error : isDone ? 'Ready' : pull.status}
            {isActive && pull.completed_bytes && pull.total_bytes ? ` · ${formatBytes(pull.completed_bytes)} / ${formatBytes(pull.total_bytes)}` : ''}
          </span>
        </div>
        {isActive && (
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pull.progress}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
        )}
      </div>
      {isDone && (
        <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '5px 14px', flexShrink: 0 }} onClick={() => { onRefreshModels(); onBenchmark(pull.model, pull.endpoint) }}>
          Benchmark →
        </button>
      )}
    </div>
  )
}
