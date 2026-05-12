import { useState, useEffect, useCallback } from 'react'

export interface HardwareInfo {
  captured_at: string
  hostname: string
  os_name: string
  os_version: string
  architecture: string
  cpu_model: string
  cpu_physical_cores: number
  cpu_logical_cores: number
  memory_total_mb: number
  memory_used_mb: number
  memory_available_mb: number
  disk_total_gb?: number
  disk_free_gb?: number
  gpu: {
    model: string
    vendor: string
    vram_total_mb: number | null
  }
}

export interface ModelInfo {
  name: string
  size_gb: number | null
  quantization: string
  family: string
  parameter_size: string
  format: string
}

export interface ProviderInfo {
  name: string
  label: string
  url: string
  type: string
  available: boolean
  model_count: number
  models: ModelInfo[]
}

export interface ModelsResponse {
  providers: ProviderInfo[]
  total_models: number
  error?: string
}

export interface HFModel {
  id: string
  author: string
  name: string
  avatar_url: string
  downloads: number
  likes: number
  pipeline_tag: string
  tags: string[]
  formats: string[]
  url: string
  created_at: string
}

export interface HFSearchResult {
  query: string
  format_filter: string
  models: HFModel[]
  count: number
  total: number
  page: number
  pages: number
  error?: string
}

export interface HFModelDetails {
  repo: string
  id: string
  downloads?: number
  likes?: number
  tags?: string[]
  cardData?: Record<string, any>
  gguf_files: Array<{ path: string; size_bytes: number; size_gb: number | null }>
  largest_gguf: { path: string; size_bytes: number; size_gb: number | null } | null
  total_gguf_size_gb: number | null
  error?: string
}

export interface PullInfo {
  pull_id: string
  model: string
  endpoint: string
  status: string
  progress: number
  completed?: number
  total?: number
  completed_bytes?: number
  total_bytes?: number
  digest?: string
  error?: string
  done: boolean
  started_at: number
  updated_at?: number
  finished_at?: number
}

export interface RunSummary {
  id: string
  timestamp: string
  model: string
  quantization?: string
  family?: string
  parameter_count?: string
  overall_score: number
  quality_score: number
  speed_score: number
  reliability_score: number
  value_score?: number
  total_runtime_sec: number
  suites: Record<string, { score: number; pass_count: number; task_count: number }>
  suite_count?: number
  suite_names?: string[]
  is_full_benchmark?: boolean
  provider: string
  backend?: string
  harness?: string
  machine: string
  gpu?: string
  gpu_memory_gb?: number
  cpu?: string
  system_memory_gb?: number
  os?: string
  generation_tok_per_sec?: number
  prompt_eval_tok_per_sec?: number
  ttft_ms?: number
}

export interface ChatMetric {
  latencyMs: number
  ttftMs: number
  promptTokens: number
  completionTokens: number
  tokensPerSecond: number
  model: string
  provider: string
  endpoint: string
  harness: string
}

export interface ChatResponse {
  message: { role: 'assistant'; content: string }
  metrics: ChatMetric
}

export async function chatGenerate(params: {
  model: string
  endpoint: string
  provider: string
  prompt: string
  system?: string
}): Promise<ChatResponse> {
  const resp = await fetch('/api/chat/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`chat failed: ${resp.status} ${text}`)
  }
  return resp.json()
}

export function useHardware() {
  const [data, setData] = useState<HardwareInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/hardware')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}

export function useModels(endpoint?: string) {
  const [data, setData] = useState<ModelsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    const url = endpoint ? `/api/models?endpoint=${encodeURIComponent(endpoint)}` : '/api/models'
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [endpoint])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, refresh }
}

export function useHFModels(query: string, format: string, page: number, limit: number = 12) {
  const [data, setData] = useState<HFSearchResult | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(limit), page: String(page) })
    if (query) params.set('query', query)
    if (format) params.set('format', format)
    fetch(`/api/models/search-hf?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [query, format, page, limit])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, refresh }
}

export function usePullStatus(pullId?: string, enabled: boolean = true, pollMs: number = 1000) {
  const [data, setData] = useState<PullInfo | null>(null)
  const [loading, setLoading] = useState(Boolean(pullId && enabled))

  const refresh = useCallback(async () => {
    if (!pullId || !enabled) return
    try {
      const resp = await fetch(`/api/models/pull/${encodeURIComponent(pullId)}`)
      const json = await resp.json()
      setData(json)
    } catch {
      // ignore transient polling failures
    } finally {
      setLoading(false)
    }
  }, [pullId, enabled])

  useEffect(() => {
    if (!pullId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    refresh()
    const timer = window.setInterval(() => {
      refresh()
    }, pollMs)

    return () => window.clearInterval(timer)
  }, [pullId, enabled, pollMs, refresh])

  return { data, loading, refresh }
}

export function useActivePulls(pollMs: number = 1000) {
  const [pulls, setPulls] = useState<PullInfo[]>([])

  useEffect(() => {
    let active = true

    const poll = () => {
      fetch('/api/models/pull/active')
        .then((r) => r.json())
        .then((d) => {
          if (active) setPulls(d.pulls || [])
        })
        .catch(() => {})
    }

    poll()
    const id = window.setInterval(poll, pollMs)

    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [pollMs])

  return pulls
}

export function useRuns() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch('/api/benchmark/runs')
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { runs, loading, refresh }
}

export async function pullModel(params: { model: string; endpoint?: string }): Promise<{ pull_id: string; model: string }> {
  const resp = await fetch('/api/models/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return resp.json()
}

export async function startBenchmark(params: {
  model: string
  endpoint: string
  suites: string[]
  provider?: string
  harness?: string
}): Promise<{ run_id: string }> {
  const resp = await fetch('/api/benchmark/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return resp.json()
}

export async function getRunDetail(runId: string) {
  const resp = await fetch(`/api/benchmark/runs/${runId}`)
  return resp.json()
}

export async function getHFModelDetails(repo: string): Promise<HFModelDetails> {
  const resp = await fetch(`/api/models/hf-details?repo=${encodeURIComponent(repo)}`)
  return resp.json()
}
