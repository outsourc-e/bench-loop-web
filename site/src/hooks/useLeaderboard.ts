import { useEffect, useState } from 'react'

export interface PublicRun {
  id: string
  model: string
  harness: string
  provider: string
  machine: string
  overall_score: number
  quality_score: number
  speed_score: number
  reliability_score: number
  generation_tok_per_sec: number
  ttft_ms: number
  is_full_benchmark: boolean
  is_quality_full?: boolean
  is_agent_only?: boolean
  agent_score?: number | null
  agent_pass?: number | null
  agent_task_count?: number | null
  suites: Record<string, { score: number }>
}

/**
 * Fetch the static published leaderboard JSON. The hosted site never talks to
 * a backend — runs are exported from the local app and committed/uploaded to
 * /public/data/leaderboard.json. This keeps benchloop.com deployable as a
 * static bundle on Vercel/Cloudflare/Fly static.
 */
export function useLeaderboard() {
  const [runs, setRuns] = useState<PublicRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/leaderboard.json', { cache: 'no-cache' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const list: PublicRun[] = (d.runs || []).slice().sort((a: PublicRun, b: PublicRun) => (b.overall_score || 0) - (a.overall_score || 0))
        setRuns(list)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { runs, loading, error }
}
