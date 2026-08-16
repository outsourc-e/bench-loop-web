import { useEffect, useState } from 'react'

const ASK_URL = 'https://api.bench-loop.com/ask'
const CLIENT_KEY = 'benchloop-ask-client'

export type AskEvidence = {
  id: string
  run_id: string
  timestamp: string
  model: string
  family: string
  quantization: string
  harness: string
  provider: string
  hardware: string
  gpu_memory_gb: number | null
  system_memory_gb: number | null
  overall_score: number | null
  quality_score: number | null
  speed_score: number | null
  reliability_score: number | null
  generation_tok_per_sec: number | null
  ttft_ms: number | null
  command_used: string
  source_url: string
}

export type AskCitation = {
  url: string
  title: string
}

export type AskResponse = {
  query: string
  answer: string
  model: string
  generated_at: string
  citations: AskCitation[]
  evidence: AskEvidence[]
  research: {
    live: boolean
    cache_hit: boolean
    response_id: string | null
    x_search_calls: number
    web_search_calls: number
  }
  notice?: string
}

type AskState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: AskResponse; error: null }
  | { status: 'error'; data: null; error: string }

function clientId(): string {
  const existing = localStorage.getItem(CLIENT_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(CLIENT_KEY, created)
  return created
}

export function useAsk(query: string) {
  const [retryKey, setRetryKey] = useState(0)
  const [state, setState] = useState<AskState>({ status: 'loading', data: null, error: null })

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })

    fetch(ASK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BenchLoop-Client': clientId(),
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json() as AskResponse | { error?: string }
        if (!response.ok) {
          throw new Error('error' in payload && payload.error ? payload.error : `Ask Loop failed (${response.status})`)
        }
        setState({ status: 'success', data: payload as AskResponse, error: null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Ask Loop could not answer right now.',
        })
      })

    return () => controller.abort()
  }, [query, retryKey])

  return { ...state, retry: () => setRetryKey((value) => value + 1) }
}
