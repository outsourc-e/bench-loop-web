/// <reference types="@cloudflare/workers-types" />

// BenchLoop public submit API.
// POST /submit       — accept a run.json payload, validate, store
// GET  /leaderboard  — return best-per-(model,harness) sorted by overall_score
// GET  /runs/:id     — return a specific run
// GET  /health       — basic health probe

interface Env {
  DB: D1Database
  ALLOWED_ORIGINS: string
}

const corsHeaders = (origin: string | null, allowed: string) => {
  const allow =
    allowed === "*" || !origin ? "*" : allowed.split(",").map((s) => s.trim()).includes(origin) ? origin : "null"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  }
}

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  })

// Hard caps on the leaderboard cutoff. Scoring was overhauled 2026-05-01.
const MIN_RUN_TIMESTAMP = "2026-05-01T00:00:00Z"

const REQUIRED_FULL = ["speed", "toolcall", "dataextract", "instructfollow", "reasonmath"]
const REQUIRED_QUALITY = ["toolcall", "dataextract", "instructfollow", "reasonmath"]

interface RunPayload {
  run_id?: string
  timestamp?: string
  model?: { model_id?: string; family?: string; parameter_count?: string; quantization?: string }
  machine?: {
    machine_id?: string
    cpu?: string
    gpu?: string
    gpu_memory_gb?: number
    system_memory_gb?: number
    os?: string
    is_remote?: boolean
    remote_host?: string
    endpoint?: string
    hardware_label?: string
  }
  provider?: string
  harness?: string
  total_runtime_sec?: number
  overall_score?: number
  quality_score?: number
  speed_score?: number
  reliability_score?: number
  value_score?: number
  speed_metrics?: { ttft_ms?: number; generation_tok_per_sec?: number }
  suites?: Record<string, { score?: number; pass_count?: number; task_count?: number }>
}

function validate(payload: RunPayload): { ok: true; data: Required<Pick<RunPayload, "model" | "machine" | "suites">> & RunPayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") return { ok: false, error: "body must be an object" }
  if (!payload.model?.model_id) return { ok: false, error: "model.model_id required" }
  if (!payload.machine?.machine_id) return { ok: false, error: "machine.machine_id required" }
  if (!payload.timestamp) return { ok: false, error: "timestamp required" }
  if (payload.timestamp < MIN_RUN_TIMESTAMP) return { ok: false, error: `run too old (< ${MIN_RUN_TIMESTAMP})` }
  if (typeof payload.overall_score !== "number") return { ok: false, error: "overall_score required" }
  if (!payload.suites || typeof payload.suites !== "object") return { ok: false, error: "suites required" }
  // Model id sanity — reject obvious paths leaking from local filesystem.
  if (payload.model.model_id.length > 200) return { ok: false, error: "model_id too long" }
  return { ok: true, data: payload as any }
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  let body: RunPayload
  try {
    body = (await request.json()) as RunPayload
  } catch {
    return json({ error: "invalid JSON" }, 400)
  }
  const v = validate(body)
  if (!v.ok) return json({ error: v.error }, 400)
  const p = v.data
  const suiteNames = Object.keys(p.suites!)
  const isFull = REQUIRED_FULL.every((s) => suiteNames.includes(s))
  const isQualityFull = REQUIRED_QUALITY.every((s) => suiteNames.includes(s))
  const isAgentOnly = suiteNames.length === 1 && suiteNames[0] === "agent"

  // Strip leaked filesystem paths from model id (legacy lmstudio runs).
  let modelId = p.model!.model_id!
  if (modelId.includes("/") && modelId.endsWith(".gguf")) {
    modelId = modelId.split("/").pop() || modelId
  }

  const runId = (p as any).run_id || `${p.machine!.machine_id}-${Date.parse(p.timestamp!)}`
  const id = `${p.machine!.machine_id}:${runId}`

  const submitterIp = request.headers.get("CF-Connecting-IP") || ""
  const userAgent = request.headers.get("User-Agent") || ""

  await env.DB.prepare(
    `INSERT OR REPLACE INTO runs (
      id, run_id, machine_id, submitted_at, run_timestamp,
      model, family, parameter_count, quantization,
      harness, provider,
      cpu, gpu, gpu_memory_gb, system_memory_gb, os,
      is_remote, remote_host, endpoint, hardware_label,
      overall_score, quality_score, speed_score, reliability_score, value_score,
      generation_tok_per_sec, ttft_ms, total_runtime_sec,
      is_full_benchmark, is_quality_full, is_agent_only,
      suites_json, submitter_ip, user_agent
    ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?)`,
  )
    .bind(
      id,
      runId,
      p.machine!.machine_id!,
      new Date().toISOString(),
      p.timestamp!,
      modelId,
      p.model!.family || "",
      p.model!.parameter_count || "",
      p.model!.quantization || "",
      p.harness || "raw",
      p.provider || "",
      p.machine!.cpu || "",
      p.machine!.gpu || "",
      p.machine!.gpu_memory_gb ?? 0,
      p.machine!.system_memory_gb ?? 0,
      p.machine!.os || "",
      p.machine!.is_remote ? 1 : 0,
      p.machine!.remote_host || "",
      p.machine!.endpoint || "",
      p.machine!.hardware_label || "",
      p.overall_score!,
      p.quality_score ?? null,
      p.speed_score ?? null,
      p.reliability_score ?? null,
      p.value_score ?? null,
      p.speed_metrics?.generation_tok_per_sec ?? null,
      p.speed_metrics?.ttft_ms ?? null,
      p.total_runtime_sec ?? null,
      isFull ? 1 : 0,
      isQualityFull ? 1 : 0,
      isAgentOnly ? 1 : 0,
      JSON.stringify(p.suites),
      submitterIp,
      userAgent,
    )
    .run()

  return json({ ok: true, id, is_full_benchmark: isFull, is_quality_full: isQualityFull, is_agent_only: isAgentOnly })
}

async function handleLeaderboard(env: Env): Promise<Response> {
  // Best run per (model, harness) by overall_score.
  const { results } = await env.DB.prepare(
    `SELECT r.* FROM runs r
     INNER JOIN (
       SELECT model, harness, MAX(overall_score) AS best
       FROM runs
       GROUP BY model, harness
     ) m ON r.model = m.model AND r.harness = m.harness AND r.overall_score = m.best
     ORDER BY r.overall_score DESC`,
  ).all()

  const runs = (results as any[]).map((r) => ({
    id: r.id,
    run_id: r.run_id,
    machine_id: r.machine_id,
    timestamp: r.run_timestamp,
    submitted_at: r.submitted_at,
    model: r.model,
    family: r.family,
    parameter_count: r.parameter_count,
    quantization: r.quantization,
    harness: r.harness,
    provider: r.provider,
    machine: r.hardware_label || r.gpu || r.cpu || r.remote_host || r.machine_id,
    hardware_label: r.hardware_label,
    cpu: r.cpu,
    gpu: r.gpu,
    gpu_memory_gb: r.gpu_memory_gb,
    system_memory_gb: r.system_memory_gb,
    os: r.os,
    is_remote: !!r.is_remote,
    remote_host: r.remote_host,
    endpoint: r.endpoint,
    overall_score: r.overall_score,
    quality_score: r.quality_score,
    speed_score: r.speed_score,
    reliability_score: r.reliability_score,
    generation_tok_per_sec: r.generation_tok_per_sec,
    ttft_ms: r.ttft_ms,
    total_runtime_sec: r.total_runtime_sec,
    is_full_benchmark: !!r.is_full_benchmark,
    is_quality_full: !!r.is_quality_full,
    is_agent_only: !!r.is_agent_only,
    suites: JSON.parse(r.suites_json || "{}"),
  }))

  return json({
    generated_at: new Date().toISOString(),
    count: runs.length,
    source: "bench-loop.com public submissions",
    runs,
  }, 200, { "Cache-Control": "public, max-age=60" })
}

async function handleRun(id: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM runs WHERE id = ? OR run_id = ?").bind(id, id).first<any>()
  if (!row) return json({ error: "not found" }, 404)
  return json({
    ...row,
    suites: JSON.parse(row.suites_json || "{}"),
    suites_json: undefined,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get("Origin")
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS)

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })

    let resp: Response
    try {
      if (url.pathname === "/health") resp = json({ ok: true, ts: new Date().toISOString() })
      else if (url.pathname === "/submit" && request.method === "POST") resp = await handleSubmit(request, env)
      else if (url.pathname === "/leaderboard") resp = await handleLeaderboard(env)
      else if (url.pathname.startsWith("/runs/")) resp = await handleRun(decodeURIComponent(url.pathname.slice(6)), env)
      else resp = json({ error: "not found", routes: ["/health", "POST /submit", "/leaderboard", "/runs/:id"] }, 404)
    } catch (err: any) {
      resp = json({ error: err.message || "internal error" }, 500)
    }

    Object.entries(cors).forEach(([k, v]) => resp.headers.set(k, v as string))
    return resp
  },
}
