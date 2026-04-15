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

export interface RunSummary {
  id: string
  timestamp: string
  model: string
  overall_score: number
  quality_score: number
  speed_score: number
  reliability_score: number
  total_runtime_sec: number
  suites: Record<string, { score: number; pass_count: number; task_count: number }>
  provider: string
  machine: string
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

export async function startBenchmark(params: {
  model: string
  endpoint: string
  suites: string[]
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
