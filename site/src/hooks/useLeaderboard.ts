import { useEffect, useState } from 'react'

export interface PublicRun {
  id: string
  run_id?: string
  machine_id?: string
  timestamp?: string
  submitted_at?: string
  model: string
  harness: string
  provider: string
  machine: string
  hardware_label?: string
  cpu?: string
  gpu?: string
  gpu_memory_gb?: number
  system_memory_gb?: number
  os?: string
  overall_score: number
  quality_score: number
  speed_score: number
  reliability_score: number
  generation_tok_per_sec: number
  ttft_ms: number
  total_runtime_sec?: number | null
  is_remote?: boolean
  remote_host?: string
  endpoint?: string
  is_full_benchmark: boolean
  is_quality_full?: boolean
  is_agent_only?: boolean
  agent_score?: number | null
  agent_pass?: number | null
  agent_task_count?: number | null
  suites: Record<string, { score: number; pass_count?: number; task_count?: number }>
}

/**
 * Fetch the public leaderboard. Primary source is the Cloudflare Worker at
 * api.bench-loop.com/leaderboard, which is populated by the local BenchLoop
 * CLI auto-submitting completed runs. Falls back to the static JSON bundled
 * with the site (useful for offline / first-deploy / API outage).
 */
const API_URL = 'https://api.bench-loop.com/leaderboard'
const FALLBACK_URL = '/data/leaderboard.json'

export function useLeaderboard() {
  const [runs, setRuns] = useState<PublicRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      for (const url of [API_URL, FALLBACK_URL]) {
        try {
          const r = await fetch(url, { cache: 'no-cache' })
          if (!r.ok) continue
          const d = await r.json()
          if (cancelled) return
          const list: PublicRun[] = (d.runs || [])
            .slice()
            .sort((a: PublicRun, b: PublicRun) => (b.overall_score || 0) - (a.overall_score || 0))
          setRuns(list)
          return
        } catch {
          /* try next */
        }
      }
      if (!cancelled) setError('Failed to load leaderboard')
    }
    load()
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { runs, loading, error }
}
