import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiBaseUrl, apiFetch } from '../lib/backend'

const ASK_URL = `${apiBaseUrl}/ask`
const CLIENT_KEY = 'benchloop-ask-client'
const THREAD_KEY = 'benchloop-ask-thread-v1'
const MAX_THREAD_TURNS = 20
const MAX_HISTORY_MESSAGES = 8
const MAX_HISTORY_CHARS = 12_000

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

export type AskTurn = {
  id: string
  query: string
  status: 'loading' | 'success' | 'error'
  response?: AskResponse
  error?: string
}

type HistoryMessage = {
  role: 'user' | 'assistant'
  content: string
}

type PersistedThread = {
  id: string
  seed: string | null
  turns: AskTurn[]
}

export type ThreadPersistence = 'local' | 'saving' | 'account' | 'error'

function clientId(): string {
  const existing = localStorage.getItem(CLIENT_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(CLIENT_KEY, created)
  return created
}

function validResponse(value: unknown): value is AskResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<AskResponse>
  return typeof candidate.query === 'string'
    && typeof candidate.answer === 'string'
    && typeof candidate.model === 'string'
    && Array.isArray(candidate.citations)
    && Array.isArray(candidate.evidence)
    && !!candidate.research
}

function loadThread(seed: string | null): PersistedThread | null {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedThread>
    if (parsed.seed !== seed || !Array.isArray(parsed.turns) || parsed.turns.length === 0) return null
    const turns = parsed.turns.slice(-MAX_THREAD_TURNS)
    if (!turns.every((turn) => turn?.status === 'success' && typeof turn.id === 'string' && typeof turn.query === 'string' && validResponse(turn.response))) {
      return null
    }
    return {
      id: typeof parsed.id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(parsed.id) ? parsed.id : crypto.randomUUID(),
      seed,
      turns,
    }
  } catch {
    return null
  }
}

function historyFrom(turns: AskTurn[]): HistoryMessage[] {
  const completed = turns
    .filter((turn) => turn.status === 'success' && turn.response)
    .slice(-(MAX_HISTORY_MESSAGES / 2))

  const bounded: HistoryMessage[] = []
  let chars = 0
  for (const turn of completed.reverse()) {
    const pair: HistoryMessage[] = [
      { role: 'user', content: turn.query.slice(0, 4_000) },
      { role: 'assistant', content: turn.response!.answer.slice(0, 4_000) },
    ]
    const pairChars = pair[0].content.length + pair[1].content.length
    if (chars + pairChars > MAX_HISTORY_CHARS) break
    bounded.unshift(...pair)
    chars += pairChars
  }
  return bounded
}

async function requestAnswer(query: string, history: HistoryMessage[], signal: AbortSignal): Promise<AskResponse> {
  const response = await fetch(ASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-BenchLoop-Client': clientId(),
    },
    body: JSON.stringify({ query, history }),
    signal,
  })
  const payload: unknown = await response.json()
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Ask Loop failed (${response.status})`
    throw new Error(error)
  }
  if (!validResponse(payload)) throw new Error('Ask Loop returned an invalid response.')
  return payload
}

export function useAskThread(seed: string | null) {
  const { user } = useAuth()
  const [turns, setTurns] = useState<AskTurn[]>([])
  const [pending, setPending] = useState(false)
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID())
  const [persistence, setPersistence] = useState<ThreadPersistence>('local')
  const turnsRef = useRef<AskTurn[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)

  const updateTurns = useCallback((updater: (current: AskTurn[]) => AskTurn[]) => {
    setTurns((current) => {
      const next = updater(current).slice(-MAX_THREAD_TURNS)
      turnsRef.current = next
      return next
    })
  }, [])

  const runTurn = useCallback(async (id: string, query: string, history: HistoryMessage[]) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    pendingRef.current = true
    setPending(true)
    try {
      const response = await requestAnswer(query, history, controller.signal)
      updateTurns((current) => current.map((turn) => turn.id === id
        ? { ...turn, status: 'success', response, error: undefined }
        : turn))
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      updateTurns((current) => current.map((turn) => turn.id === id
        ? { ...turn, status: 'error', error: error instanceof Error ? error.message : 'Ask Loop could not answer right now.' }
        : turn))
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        pendingRef.current = false
        setPending(false)
      }
    }
  }, [updateTurns])

  const send = useCallback((value: string) => {
    const query = value.trim()
    if (!query || pendingRef.current) return
    const history = historyFrom(turnsRef.current)
    const id = crypto.randomUUID()
    updateTurns((current) => [...current, { id, query, status: 'loading' }])
    void runTurn(id, query, history)
  }, [runTurn, updateTurns])

  const retry = useCallback((id: string) => {
    if (pendingRef.current) return
    const index = turnsRef.current.findIndex((turn) => turn.id === id)
    if (index < 0) return
    const turn = turnsRef.current[index]
    const history = historyFrom(turnsRef.current.slice(0, index))
    updateTurns((current) => current.map((item) => item.id === id
      ? { ...item, status: 'loading', error: undefined }
      : item))
    void runTurn(id, turn.query, history)
  }, [runTurn, updateTurns])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    pendingRef.current = false
    turnsRef.current = []
    setTurns([])
    setPending(false)
    setThreadId(crypto.randomUUID())
    setPersistence('local')
    sessionStorage.removeItem(THREAD_KEY)
  }, [])

  useEffect(() => {
    controllerRef.current?.abort()
    const restored = loadThread(seed)
    if (restored) {
      turnsRef.current = restored.turns
      setTurns(restored.turns)
      setThreadId(restored.id)
      pendingRef.current = false
      setPending(false)
      return
    }
    turnsRef.current = []
    setTurns([])
    setThreadId(crypto.randomUUID())
    pendingRef.current = false
    setPending(false)
    if (!seed) return
    const id = crypto.randomUUID()
    const initial = [{ id, query: seed, status: 'loading' as const }]
    turnsRef.current = initial
    setTurns(initial)
    void runTurn(id, seed, [])
  }, [runTurn, seed])

  useEffect(() => {
    if (turns.length === 0) return
    sessionStorage.setItem(THREAD_KEY, JSON.stringify({ id: threadId, seed, turns } satisfies PersistedThread))
    if (!user) {
      setPersistence('local')
      return
    }

    setPersistence('saving')
    const timer = window.setTimeout(() => {
      const title = turns[0]?.query.trim().slice(0, 160) || 'New Ask Loop thread'
      void apiFetch<{ ok: boolean }>(`/threads/${encodeURIComponent(threadId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          title,
          turns: turns.map((turn) => ({
            id: turn.id,
            query: turn.query,
            response: turn.status === 'success' ? turn.response || null : null,
          })),
        }),
      })
        .then(() => setPersistence('account'))
        .catch(() => setPersistence('error'))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [seed, threadId, turns, user])

  return { turns, pending, send, retry, reset, threadId, persistence }
}
