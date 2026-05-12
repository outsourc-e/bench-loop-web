import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import HardwareSummary from '../components/HardwareSummary'
import {
  getHFModelDetails,
  pullModel,
  useActivePulls,
  useHardware,
  useModels,
} from '../hooks/useApi'
import type { HFModelDetails, PullInfo } from '../hooks/useApi'
import {
  FIT_META,
  buildGgufSearch,
  estimateRequiredVramGb,
  fitTone,
  formatBytes,
  formatGb,
  formatNumber,
  getCardFit,
  getHfPullTarget,
  getLargestKnownFileGb,
  getOllamaEndpoint,
  getRepoDisplayParts,
  getUsableMemoryGb,
  hasOllamaProvider,
} from '../lib/hfModelUtils'

interface Props {
  onBenchmark: (model: string, endpoint: string) => void
}

function decodeRepoId(raw?: string) {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function HFModelDetailPage({ onBenchmark }: Props) {
  const { repoId: rawRepoId } = useParams()
  const navigate = useNavigate()
  const repoId = decodeRepoId(rawRepoId)
  const [details, setDetails] = useState<HFModelDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)

  const { data: hardware } = useHardware()
  const { data: modelsData, refresh: refreshModels } = useModels()
  const activePulls = useActivePulls(1000)

  useEffect(() => {
    let alive = true

    if (!repoId) {
      setLoading(false)
      return
    }

    setLoading(true)
    getHFModelDetails(repoId)
      .then((resp) => {
        if (alive) setDetails(resp)
      })
      .catch(() => {
        if (alive) {
          setDetails({
            repo: repoId,
            id: repoId,
            gguf_files: [],
            largest_gguf: null,
            total_gguf_size_gb: null,
            error: 'Failed to load model details',
          })
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [repoId])

  const display = getRepoDisplayParts(repoId)
  const providers = modelsData?.providers || []
  const hasOllama = hasOllamaProvider(providers)
  const ollamaEndpoint = getOllamaEndpoint(providers)
  const pullTarget = getHfPullTarget(repoId)
  const activePull = activePulls.find((pull) => pull.model === pullTarget)
  const installedModel = providers.flatMap((provider) => provider.models.map((model) => ({ provider, model }))).find(({ model }) => model.name === pullTarget)
  const usableMemGb = getUsableMemoryGb(hardware ?? null)
  const fit = getCardFit({ author: display.author, name: display.name }, usableMemGb)
  const requiredVramGb = useMemo(() => estimateRequiredVramGb(details, { author: display.author, name: display.name }), [details, display.author, display.name])
  const largestFileGb = getLargestKnownFileGb(details)
  const fitsVram = requiredVramGb && usableMemGb ? usableMemGb >= requiredVramGb : null
  const fitsDisk = largestFileGb && hardware?.disk_free_gb ? hardware.disk_free_gb >= largestFileGb * 1.2 : null
  const ggufFiles = details?.gguf_files || []
  const hasGgufFiles = ggufFiles.length > 0
  const canPull = hasOllama && hasGgufFiles
  const usefulCardData = useMemo(() => {
    const cardData = details?.cardData || {}
    const entries = Object.entries(cardData).filter(([, value]) => {
      if (value == null) return false
      if (Array.isArray(value) && value.length === 0) return false
      if (typeof value === 'string' && value.trim() === '') return false
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false
      return true
    })

    return entries.slice(0, 8)
  }, [details?.cardData])

  const handlePull = async () => {
    if (!canPull || pulling) return
    setPulling(true)
    try {
      await pullModel({ model: pullTarget, endpoint: ollamaEndpoint })
      refreshModels()
    } finally {
      setPulling(false)
    }
  }

  const handleSearchGguf = () => {
    navigate(`/models?search=${encodeURIComponent(buildGgufSearch(repoId, display.name))}&format=gguf`)
  }

  return (
    <div>
      <HardwareSummary />

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <button className="btn btn-secondary" style={{ marginBottom: 16, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => navigate('/models')}>
              ← Back to models
            </button>
            <div style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontFamily: 'var(--mono)', marginBottom: 6 }}>{display.author}</div>
            <h1 style={{ margin: 0, color: '#fff', fontSize: '1.8rem', lineHeight: 1.1, wordBreak: 'break-word' }}>{display.name}</h1>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12, color: 'var(--text-dim)', fontSize: '0.82rem', fontFamily: 'var(--mono)' }}>
              <span>↓ {formatNumber(details?.downloads)}</span>
              <span>♥ {formatNumber(details?.likes)}</span>
              <span>{repoId}</span>
            </div>
            {fit.level !== 'unknown' && (
              <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${FIT_META[fit.level].color}`, color: FIT_META[fit.level].color, borderRadius: 999, padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                <span>{FIT_META[fit.level].label}</span>
                {fit.estGb ? <span style={{ opacity: 0.9 }}>~{fit.estGb.toFixed(1)} GB</span> : null}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 240 }}>
            {installedModel ? (
              <button className="btn btn-primary" onClick={() => onBenchmark(installedModel.model.name, installedModel.provider.url)}>
                Benchmark model
              </button>
            ) : activePull ? (
              <PullProgressCard pull={activePull} onBenchmark={onBenchmark} onRefreshModels={refreshModels} />
            ) : canPull ? (
              <button className="btn btn-primary" onClick={handlePull} disabled={pulling || fitsDisk === false}>
                {pulling ? 'Starting pull...' : 'Pull with Ollama'}
              </button>
            ) : hasOllama ? (
              <button className="btn btn-primary" onClick={handleSearchGguf}>
                Search GGUF version
              </button>
            ) : (
              <a className="btn btn-primary" href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center' }}>
                Install Ollama
              </a>
            )}

            <a className="btn btn-secondary" href={`https://huggingface.co/${repoId}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', textAlign: 'center' }}>
              View on Hugging Face
            </a>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 24, color: 'var(--text-dim)' }}>Loading model details...</div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          <section className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Metadata</div>

            {!!details?.tags?.length && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {details.tags!.slice(0, 24).map((tag) => (
                    <span key={tag} style={badgeStyle}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {!!usefulCardData.length && (
              <div>
                <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Card data</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {usefulCardData.map(([key, value]) => (
                    <div key={key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 4, textTransform: 'uppercase' }}>{key}</div>
                      <div style={{ color: '#fff', fontSize: '0.86rem', wordBreak: 'break-word' }}>{formatCardValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!details?.tags?.length && !usefulCardData.length && (
              <div style={{ color: 'var(--text-dim)' }}>No extra metadata available.</div>
            )}
          </section>

          <section className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Files</div>

            {hasGgufFiles ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {ggufFiles
                  .slice()
                  .sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0))
                  .map((file) => {
                    const isLargest = file.path === details?.largest_gguf?.path
                    return (
                      <div key={file.path} style={{ background: 'var(--bg)', border: `1px solid ${isLargest ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#fff', fontFamily: 'var(--mono)', fontSize: '0.82rem', wordBreak: 'break-word' }}>{file.path}</div>
                            {isLargest && <div style={{ color: 'var(--accent)', fontSize: '0.72rem', marginTop: 6, fontWeight: 700 }}>Largest GGUF file</div>}
                          </div>
                          <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: '0.78rem', flexShrink: 0 }}>{file.size_gb ? formatGb(file.size_gb) : formatBytes(file.size_bytes)}</div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div style={{ color: 'var(--text-dim)' }}>No GGUF files found in the repo tree.</div>
            )}
          </section>

          <section className="card" style={{ padding: 20 }}>
            <div className="section-title" style={{ marginBottom: 12 }}>Hardware fit</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
              <SpecRow label="Estimated size" value={fit.estGb ? formatGb(fit.estGb) : 'Unknown'} />
              <SpecRow label="Estimated VRAM" value={requiredVramGb ? formatGb(requiredVramGb) : 'Unknown'} />
              <SpecRow label="Largest file" value={largestFileGb ? formatGb(largestFileGb) : 'Unknown'} />
              <SpecRow label="Free disk" value={hardware?.disk_free_gb ? formatGb(hardware.disk_free_gb) : 'Unknown'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              <FitCard title="Memory fit" tone={fit.level === 'unknown' ? fitTone(null) : fit.level === 'no' ? fitTone(false) : fitTone(true)} detail={fit.estGb ? `Heuristic estimate based on model name and quantization, around ${fit.estGb.toFixed(1)} GB.` : 'Could not infer model size from the repo name.'} />
              <FitCard title="VRAM fit" tone={fitTone(fitsVram)} detail={fitsVram === false ? 'Likely too large for full GPU residency.' : 'Estimate based on largest GGUF file size when available.'} />
              <FitCard title="Disk fit" tone={fitTone(fitsDisk)} detail={fitsDisk === false ? 'You likely need more free disk before pulling.' : 'Includes a small safety buffer.'} />
            </div>
            {details?.error && <div style={{ color: 'var(--yellow)', marginTop: 14, fontSize: '0.8rem' }}>HF API returned partial data, some estimates may be rough.</div>}
          </section>
        </div>
      )}
    </div>
  )
}

const badgeStyle: CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '3px 9px',
  fontSize: '0.68rem',
  fontFamily: 'var(--mono)',
  color: 'var(--text-dim)',
}

function formatCardValue(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && value) return JSON.stringify(value)
  return String(value)
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ color: '#fff', fontSize: '0.9rem', wordBreak: 'break-word' }}>{value}</div>
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

function PullProgressCard({ pull, onBenchmark, onRefreshModels }: { pull: PullInfo; onBenchmark: (model: string, endpoint: string) => void; onRefreshModels: () => void }) {
  const isDone = pull.done && !pull.error
  const isFailed = pull.done && !!pull.error
  const isActive = !pull.done

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: `1px solid ${isFailed ? 'var(--red)' : isDone ? 'var(--green)' : 'var(--border)'}` }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{isDone ? '✅' : isFailed ? '❌' : '⏳'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: isActive ? 6 : 0 }}>
          <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.78rem', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pull.model}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
            {isFailed ? pull.error : isDone ? 'Ready' : pull.status}
            {isActive && pull.completed_bytes && pull.total_bytes ? ` · ${formatBytes(pull.completed_bytes)} / ${formatBytes(pull.total_bytes)}` : ''}
          </span>
        </div>
        {isActive && (
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pull.progress}%`, background: 'var(--accent)' }} />
          </div>
        )}
      </div>
      {isDone && (
        <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '5px 12px', flexShrink: 0 }} onClick={() => { onRefreshModels(); onBenchmark(pull.model, pull.endpoint) }}>
          Benchmark
        </button>
      )}
    </div>
  )
}
