const MAX_QUERY_LENGTH = 800
const MAX_HISTORY_MESSAGES = 8
const MAX_HISTORY_MESSAGE_LENGTH = 4_000
const MAX_HISTORY_TOTAL_LENGTH = 12_000
const MAX_BRIDGE_RESPONSE_BYTES = 512_000
const CACHE_TTL_SECONDS = 15 * 60
const MAX_EVIDENCE_RUNS = 12

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "can", "do", "for", "from",
  "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "should", "the",
  "this", "to", "use", "what", "which", "with", "best", "benchmark", "benchloop",
  "fastest", "hardware", "local", "max", "measured", "model", "models", "now",
  "quality", "right", "run", "runs", "setup", "speed",
])

const MODEL_PREFIXES = [
  "command", "deepseek", "gemma", "glm", "gpt", "granite", "internlm", "lfm", "llama",
  "mistral", "mixtral", "nemotron", "phi", "qwen", "seed", "smollm", "yi",
]

type AskRequestBody = {
  query: string
  history: AskHistoryMessage[]
}

type AskHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

type AskRunRow = {
  id: string
  run_id: string
  run_timestamp: string
  model: string
  family: string | null
  quantization: string | null
  harness: string | null
  provider: string | null
  hardware_label: string | null
  gpu: string | null
  cpu: string | null
  remote_host: string | null
  machine_id: string
  gpu_memory_gb: number | null
  system_memory_gb: number | null
  overall_score: number | null
  quality_score: number | null
  speed_score: number | null
  reliability_score: number | null
  generation_tok_per_sec: number | null
  ttft_ms: number | null
  command_used: string | null
}

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

type BridgeResearch = {
  answer: string
  citations: AskCitation[]
  model: string
  response_id: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    x_search_calls?: number
    web_search_calls?: number
  }
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

const jsonResponse = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseAskBody(value: unknown): AskRequestBody | null {
  if (!isRecord(value) || typeof value.query !== "string") return null
  const query = value.query.trim()
  if (query.length < 3 || query.length > MAX_QUERY_LENGTH) return null
  if (value.history !== undefined && !Array.isArray(value.history)) return null

  const candidates = Array.isArray(value.history) ? value.history.slice(-MAX_HISTORY_MESSAGES) : []
  if (candidates.length % 2 !== 0) return null
  const history: AskHistoryMessage[] = []
  let totalLength = 0
  for (const [index, candidate] of candidates.entries()) {
    if (!isRecord(candidate) || (candidate.role !== "user" && candidate.role !== "assistant") || typeof candidate.content !== "string") {
      return null
    }
    if (candidate.role !== (index % 2 === 0 ? "user" : "assistant")) return null
    const content = candidate.content.trim()
    if (!content || content.length > MAX_HISTORY_MESSAGE_LENGTH) return null
    totalLength += content.length
    if (totalLength > MAX_HISTORY_TOTAL_LENGTH) return null
    history.push({ role: candidate.role, content })
  }
  return { query, history }
}

function isGreeting(query: string): boolean {
  const normalized = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
  return /^(hi|hello|hey|yo|sup)( there)?( loop| benchloop)?$/.test(normalized)
}

function greetingResponse(query: string): AskResponse {
  return {
    query,
    answer: "## Hi — I’m Loop.\n\nTell me your hardware and what you care about—speed, quality, context, coding, vision, or tool use—and I’ll combine measured BenchLoop runs with current web and X research.\n\nTry: **What is the best Qwen3.8-27B setup for an RTX 4090?**",
    model: "Loop",
    generated_at: new Date().toISOString(),
    citations: [],
    evidence: [],
    research: {
      live: false,
      cache_hit: false,
      response_id: null,
      x_search_calls: 0,
      web_search_calls: 0,
    },
  }
}

function queryTokens(query: string): string[] {
  const candidates = query.toLowerCase().match(/[a-z0-9][a-z0-9+._-]*/g) ?? []
  return [...new Set(candidates.filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))].slice(0, 8)
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function finiteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function compactRun(row: AskRunRow): AskEvidence {
  return {
    id: row.id,
    run_id: row.run_id,
    timestamp: row.run_timestamp,
    model: row.model,
    family: row.family ?? "",
    quantization: row.quantization ?? "",
    harness: row.harness ?? "",
    provider: row.provider ?? "",
    hardware: row.hardware_label || row.gpu || row.cpu || row.remote_host || row.machine_id,
    gpu_memory_gb: finiteNumber(row.gpu_memory_gb),
    system_memory_gb: finiteNumber(row.system_memory_gb),
    overall_score: finiteNumber(row.overall_score),
    quality_score: finiteNumber(row.quality_score),
    speed_score: finiteNumber(row.speed_score),
    reliability_score: finiteNumber(row.reliability_score),
    generation_tok_per_sec: finiteNumber(row.generation_tok_per_sec),
    ttft_ms: finiteNumber(row.ttft_ms),
    command_used: row.command_used ?? "",
    source_url: `https://api.bench-loop.com/runs/${encodeURIComponent(row.id)}`,
  }
}

async function findEvidence(query: string, env: Env): Promise<AskEvidence[]> {
  const fields = ["model", "family", "quantization", "harness", "provider", "hardware_label", "gpu", "cpu"]
  const tokens = queryTokens(query)
  const select = `SELECT
    id, run_id, run_timestamp, model, family, quantization, harness, provider,
    hardware_label, gpu, cpu, remote_host, machine_id, gpu_memory_gb, system_memory_gb,
    overall_score, quality_score, speed_score, reliability_score,
    generation_tok_per_sec, ttft_ms, command_used
    FROM runs`

  let statement: D1PreparedStatement
  if (tokens.length > 0) {
    const groups = tokens.map(() => `(${fields.map((field) => `lower(coalesce(${field}, '')) LIKE ? ESCAPE '\\'`).join(" OR ")})`)
    const values: Array<string | number> = tokens.flatMap((token) => fields.map(() => `%${escapeLike(token)}%`))
    const modelAnchors = tokens.filter((token) => MODEL_PREFIXES.some((prefix) => token.startsWith(prefix)))
    const modelConstraint = modelAnchors.length > 0
      ? ` AND (${modelAnchors.map(() => "lower(coalesce(model, '') || ' ' || coalesce(family, '')) LIKE ? ESCAPE '\\'").join(" OR ")})`
      : ""
    values.push(...modelAnchors.map((token) => `%${escapeLike(token)}%`), MAX_EVIDENCE_RUNS)
    statement = env.DB.prepare(`${select}
      WHERE (${groups.join(" OR ")})${modelConstraint}
      ORDER BY overall_score DESC, generation_tok_per_sec DESC, submitted_at DESC
      LIMIT ?`).bind(...values)
  } else {
    statement = env.DB.prepare(`${select}
      ORDER BY overall_score DESC, generation_tok_per_sec DESC, submitted_at DESC
      LIMIT ?`).bind(MAX_EVIDENCE_RUNS)
  }

  const result = await statement.all<AskRunRow>()
  return (result.results ?? []).map(compactRun)
}

async function digestHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function validCitation(value: unknown): AskCitation | null {
  if (!isRecord(value) || typeof value.url !== "string") return null
  try {
    const url = new URL(value.url)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return {
      url: url.toString(),
      title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : url.hostname,
    }
  } catch {
    return null
  }
}

function parseBridgeResearch(value: unknown): BridgeResearch | null {
  if (!isRecord(value) || typeof value.answer !== "string" || typeof value.model !== "string") return null
  const citations = Array.isArray(value.citations)
    ? value.citations.map(validCitation).filter((item): item is AskCitation => item !== null).slice(0, 20)
    : []
  const usageValue = isRecord(value.usage) ? value.usage : undefined
  return {
    answer: value.answer.trim(),
    citations,
    model: value.model,
    response_id: typeof value.response_id === "string" ? value.response_id : "",
    usage: usageValue ? {
      input_tokens: typeof usageValue.input_tokens === "number" ? usageValue.input_tokens : undefined,
      output_tokens: typeof usageValue.output_tokens === "number" ? usageValue.output_tokens : undefined,
      total_tokens: typeof usageValue.total_tokens === "number" ? usageValue.total_tokens : undefined,
      x_search_calls: typeof usageValue.x_search_calls === "number" ? usageValue.x_search_calls : undefined,
      web_search_calls: typeof usageValue.web_search_calls === "number" ? usageValue.web_search_calls : undefined,
    } : undefined,
  }
}

async function callResearchBridge(query: string, history: AskHistoryMessage[], evidence: AskEvidence[], env: Env): Promise<BridgeResearch> {
  const baseUrl = env.HERMES_BRIDGE_URL.replace(/\/$/, "")
  if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://127.0.0.1")) {
    throw new Error("Ask research bridge URL is not allowed")
  }

  const response = await fetch(`${baseUrl}/research`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.HERMES_BRIDGE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, history, evidence }),
    signal: AbortSignal.timeout(95_000),
  })

  const lengthHeader = response.headers.get("Content-Length")
  const length = lengthHeader ? Number.parseInt(lengthHeader, 10) : Number.NaN
  if (!Number.isFinite(length) || length > MAX_BRIDGE_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error("Ask research bridge returned an invalid response size")
  }

  const payload: unknown = await response.json()
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`
    throw new Error(`Ask research bridge failed: ${message}`)
  }
  const research = parseBridgeResearch(payload)
  if (!research || !research.answer) throw new Error("Ask research bridge returned an invalid payload")
  return research
}

function fallbackAnswer(query: string, evidence: AskEvidence[]): string {
  if (evidence.length === 0) {
    return `## No matching verified runs yet\n\nBenchLoop does not have enough measured evidence to answer **${query}** confidently. Try naming the model, quant, runtime, and hardware, or publish a run from the CLI.`
  }
  const lines = evidence.slice(0, 5).map((run) => {
    const speed = run.generation_tok_per_sec == null ? "speed not reported" : `${run.generation_tok_per_sec.toFixed(1)} tok/s`
    const score = run.overall_score == null ? "score not reported" : `${run.overall_score.toFixed(1)} overall`
    return `- **${run.model}** on **${run.hardware}** — ${speed}, ${score}${run.quantization ? `, ${run.quantization}` : ""}`
  })
  return `## Live research is temporarily unavailable\n\nBenchLoop still found these matching measured runs:\n\n${lines.join("\n")}\n\nRetry shortly for the Grok-powered web and X research layer.`
}

function cacheKeyRequest(hash: string): Request {
  return new Request(`https://ask-cache.bench-loop.internal/${hash}`, { method: "GET" })
}

export async function handleAsk(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const contentLength = Number.parseInt(request.headers.get("Content-Length") ?? "0", 10)
  if (contentLength > 32_768) return jsonResponse({ error: "request too large" }, 413)

  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return jsonResponse({ error: "invalid JSON" }, 400)
  }
  const body = parseAskBody(parsed)
  if (!body) return jsonResponse({ error: `query must be between 3 and ${MAX_QUERY_LENGTH} characters` }, 400)
  if (isGreeting(body.query)) return jsonResponse(greetingResponse(body.query))

  const clientId = request.headers.get("X-BenchLoop-Client")?.slice(0, 128) ?? "anonymous"
  const connectingIp = request.headers.get("CF-Connecting-IP") ?? "unknown"
  const rate = await env.ASK_RATE_LIMITER.limit({ key: `${clientId}:${connectingIp}` })
  if (!rate.success) {
    return jsonResponse({ error: "Ask Loop is cooling down. Try again in about a minute." }, 429, { "Retry-After": "60" })
  }

  const normalizedQuery = body.query.toLowerCase().replace(/\s+/g, " ")
  const normalizedHistory = body.history.map((message) => ({
    role: message.role,
    content: message.content.toLowerCase().replace(/\s+/g, " "),
  }))
  const hash = await digestHex(`ask-v6:${JSON.stringify({ query: normalizedQuery, history: normalizedHistory })}`)
  const cacheRequest = cacheKeyRequest(hash)
  const cached = await caches.default.match(cacheRequest)
  if (cached) {
    const cachedPayload = await cached.json<AskResponse>()
    cachedPayload.research.cache_hit = true
    return jsonResponse(cachedPayload, 200, { "X-BenchLoop-Cache": "HIT" })
  }

  const evidenceQuery = [
    ...body.history.filter((message) => message.role === "user").slice(-2).map((message) => message.content),
    body.query,
  ].join("\n").slice(-2_400)
  const evidence = await findEvidence(evidenceQuery, env)
  let responsePayload: AskResponse
  try {
    const research = await callResearchBridge(body.query, body.history, evidence, env)
    responsePayload = {
      query: body.query,
      answer: research.answer,
      model: research.model,
      generated_at: new Date().toISOString(),
      citations: research.citations,
      evidence,
      research: {
        live: true,
        cache_hit: false,
        response_id: research.response_id || null,
        x_search_calls: research.usage?.x_search_calls ?? 0,
        web_search_calls: research.usage?.web_search_calls ?? 0,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown research error"
    console.error(JSON.stringify({ event: "ask_research_failed", error: message }))
    responsePayload = {
      query: body.query,
      answer: fallbackAnswer(body.query, evidence),
      model: "BenchLoop evidence",
      generated_at: new Date().toISOString(),
      citations: [],
      evidence,
      research: {
        live: false,
        cache_hit: false,
        response_id: null,
        x_search_calls: 0,
        web_search_calls: 0,
      },
      notice: "Live Grok research is temporarily unavailable; the answer is based on BenchLoop measurements only.",
    }
  }

  const cacheResponse = new Response(JSON.stringify(responsePayload), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
    },
  })
  ctx.waitUntil(caches.default.put(cacheRequest, cacheResponse))
  return jsonResponse(responsePayload, 200, { "X-BenchLoop-Cache": "MISS" })
}
