import { handleAsk } from "./ask"
import { authAvailable, createAuth, siteOrigins } from "./auth"
import { handleCommunity } from "./community"
import { authenticateRunner, handleRunner } from "./runner"
import { handleThreads } from "./threads"

// BenchLoop public submit API.
// POST /submit       — accept a legacy public run.json payload, validate, store
// POST /v1/runs      — publish an account-owned run with a Runner bearer token
// GET  /leaderboard  — return best-per-(model,harness) sorted by overall_score
// GET  /runs/:id     — return a specific run
// POST /ask          — answer from BenchLoop evidence + live research
// GET  /health       — basic health probe
// ALL  /api/auth/*   — Better Auth on Cloudflare D1
// ALL  /account/*    — viewer profile and rig APIs
// ALL  /community/*  — social feed, posts, comments, follows
// ALL  /threads/*    — persistent Ask Loop threads
// POST /runner/pair/* — one-time Runner device authorization

const publicCorsHeaders = (origin: string | null, allowed: string) => {
  const allow =
    allowed === "*" || !origin ? "*" : allowed.split(",").map((s) => s.trim()).includes(origin) ? origin : "null"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-BenchLoop-Client",
    "Access-Control-Max-Age": "86400",
  }
}

const credentialCorsHeaders = (origin: string | null, env: Env) => {
  const trusted = siteOrigins(env)
  const allow = origin && trusted.includes(origin) ? origin : "null"
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-BenchLoop-Client",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

function withHeaders(response: Response, headers: Record<string, string>): Response {
  const nextHeaders = new Headers(response.headers)
  for (const [name, value] of Object.entries(headers)) nextHeaders.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  })
}

const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  })

// Hard caps on the leaderboard cutoff. Scoring was overhauled 2026-05-01.
const MIN_RUN_TIMESTAMP = "2026-05-01T00:00:00Z"
const DEFAULT_LEADERBOARD_LIMIT = 2000
const MAX_LEADERBOARD_LIMIT = 2000

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
  profile?: {
    name?: string
    avatar_url?: string
    profile_url?: string
  }
  command_used?: string
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

type RunnerContext = {
  id: number
  ownerId: string
  name: string
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

async function handleSubmit(request: Request, env: Env, runner: RunnerContext | null = null): Promise<Response> {
  let body: RunPayload
  let visibility = "public"
  let createPost = false
  try {
    const raw: unknown = await request.json()
    if (runner && raw && typeof raw === "object" && !Array.isArray(raw) && "run" in raw) {
      const envelope = raw as { run?: unknown; visibility?: unknown; create_post?: unknown }
      body = envelope.run as RunPayload
      visibility = typeof envelope.visibility === "string" ? envelope.visibility : "public"
      createPost = envelope.create_post !== false
    } else {
      body = raw as RunPayload
    }
  } catch {
    return json({ error: "invalid JSON" }, 400)
  }
  if (!['public', 'unlisted', 'private'].includes(visibility)) return json({ error: "invalid_visibility" }, 400)
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

  const runId = p.run_id || `${p.machine!.machine_id}-${Date.parse(p.timestamp!)}`
  const id = `${p.machine!.machine_id}:${runId}`

  const submitterIp = request.headers.get("CF-Connecting-IP") || ""
  const userAgent = request.headers.get("User-Agent") || ""
  let rigId: number | null = null
  let profileName = p.profile?.name || ""
  let profileAvatarUrl = p.profile?.avatar_url || ""
  let profileUrl = p.profile?.profile_url || ""

  if (runner) {
    const hardwareLabel = (p.machine!.hardware_label || p.machine!.gpu || p.machine!.cpu || runner.name).slice(0, 200)
    const rig = await env.DB.prepare(
      `INSERT INTO rigs
        (owner_id, name, hardware_label, cpu, gpu, system_memory_gb, gpu_memory_gb,
         operating_system, visibility, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(owner_id, name) DO UPDATE SET
         hardware_label = excluded.hardware_label,
         cpu = excluded.cpu,
         gpu = excluded.gpu,
         system_memory_gb = excluded.system_memory_gb,
         gpu_memory_gb = excluded.gpu_memory_gb,
         operating_system = excluded.operating_system,
         visibility = excluded.visibility,
         last_seen_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
    ).bind(
      runner.ownerId,
      runner.name.slice(0, 80),
      hardwareLabel,
      p.machine!.cpu || null,
      p.machine!.gpu || null,
      p.machine!.system_memory_gb ?? null,
      p.machine!.gpu_memory_gb ?? null,
      p.machine!.os || null,
      visibility,
    ).first<{ id: number }>()
    rigId = rig?.id ?? null
    const owner = await env.DB.prepare(
      "SELECT handle, display_name, avatar_url FROM profiles WHERE id = ?",
    ).bind(runner.ownerId).first<{ handle: string; display_name: string; avatar_url: string | null }>()
    profileName = owner?.display_name || runner.name
    profileAvatarUrl = owner?.avatar_url || ""
    profileUrl = owner ? `${verificationOrigin(env)}/u/${encodeURIComponent(owner.handle)}` : ""
  }
  const suitesSummary = Object.fromEntries(
    Object.entries(p.suites!).map(([name, suite]) => [
      name,
      {
        score: suite.score ?? null,
        pass_count: suite.pass_count ?? null,
        task_count: suite.task_count ?? null,
      },
    ]),
  )

  await env.DB.prepare(
    `INSERT OR REPLACE INTO runs (
      id, run_id, machine_id, submitted_at, run_timestamp,
      model, family, parameter_count, quantization,
      harness, provider,
      cpu, gpu, gpu_memory_gb, system_memory_gb, os,
      is_remote, remote_host, endpoint, hardware_label,
      profile_name, profile_avatar_url, profile_url, command_used,
      overall_score, quality_score, speed_score, reliability_score, value_score,
      generation_tok_per_sec, ttft_ms, total_runtime_sec,
      is_full_benchmark, is_quality_full, is_agent_only,
      suites_json, suites_summary_json, submitter_ip, user_agent,
      owner_id, rig_id, visibility, verification_level
    ) VALUES (?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?)`,
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
      runner ? "" : p.machine!.remote_host || "",
      runner ? "" : p.machine!.endpoint || "",
      p.machine!.hardware_label || "",
      profileName,
      profileAvatarUrl,
      profileUrl,
      p.command_used || "",
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
      JSON.stringify(suitesSummary),
      submitterIp,
      userAgent,
      runner?.ownerId || null,
      rigId,
      visibility,
      runner ? "signed" : "captured",
    )
    .run()

  let postId: number | null = null
  if (runner) {
    await env.DB.prepare("UPDATE runner_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
      .bind(runner.id, runner.ownerId).run()
    if (createPost && visibility === "public") {
      const speed = p.speed_metrics?.generation_tok_per_sec
      const hardware = p.machine!.hardware_label || p.machine!.gpu || p.machine!.cpu || runner.name
      const summary = `${modelId} scored ${p.overall_score!.toFixed(1)} overall on ${hardware}${typeof speed === "number" ? ` at ${speed.toFixed(1)} tok/s` : ""}. Captured and signed by BenchLoop Runner.`
      const post = await env.DB.prepare(
        `INSERT INTO posts (author_id, run_id, title, body, visibility, created_at, updated_at)
         SELECT ?, ?, ?, ?, 'public', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          WHERE NOT EXISTS (SELECT 1 FROM posts WHERE author_id = ? AND run_id = ?)
         RETURNING id`,
      ).bind(
        runner.ownerId,
        id,
        `${modelId} on ${hardware}`.slice(0, 180),
        summary.slice(0, 10_000),
        runner.ownerId,
        id,
      ).first<{ id: number }>()
      postId = post?.id ?? null
    }
  }

  return json({
    ok: true,
    id,
    run_id: id,
    post_id: postId,
    url: postId ? `${verificationOrigin(env)}/posts/${postId}` : `${verificationOrigin(env)}/runs`,
    is_full_benchmark: isFull,
    is_quality_full: isQualityFull,
    is_agent_only: isAgentOnly,
  }, runner ? 201 : 200)
}

function verificationOrigin(env: Env): string {
  return siteOrigins(env).find((origin) => origin.startsWith("https://") && !origin.includes("www."))
    || "https://bench-loop.com"
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value == null) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

async function handleLeaderboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const limit = boundedInteger(url.searchParams.get("limit"), DEFAULT_LEADERBOARD_LIMIT, 1, MAX_LEADERBOARD_LIMIT)
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 100_000)

  // Return one deterministic winner per (model, harness). Raw task outputs live
  // in suites_json and can exceed 200 KB per run, so the public list reads the
  // compact summary column instead of materializing private/raw model output.
  const [leaderboardResult, statsResult] = await env.DB.batch<any>([
    env.DB.prepare(
      `WITH ranked AS (
         SELECT
           id, run_id, machine_id, run_timestamp, submitted_at,
           model, family, parameter_count, quantization, harness, provider,
           cpu, gpu, gpu_memory_gb, system_memory_gb, os,
           is_remote, remote_host, endpoint, hardware_label,
           profile_name, profile_avatar_url, profile_url, command_used,
           overall_score, quality_score, speed_score, reliability_score,
           generation_tok_per_sec, ttft_ms, total_runtime_sec,
           is_full_benchmark, is_quality_full, is_agent_only,
           suites_summary_json,
           ROW_NUMBER() OVER (
             PARTITION BY model, harness
             ORDER BY overall_score DESC, submitted_at DESC, id ASC
           ) AS group_rank
         FROM runs
       )
       SELECT * FROM ranked
       WHERE group_rank = 1
       ORDER BY overall_score DESC
       LIMIT ? OFFSET ?`,
    ).bind(limit, offset),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total_count,
         SUM(is_full_benchmark) AS full_count,
         COUNT(DISTINCT model) AS unique_models,
         COUNT(DISTINCT COALESCE(
           NULLIF(hardware_label, ''), NULLIF(gpu, ''), NULLIF(cpu, ''),
           NULLIF(remote_host, ''), machine_id
         )) AS unique_machines,
         (SELECT COUNT(*) FROM (SELECT 1 FROM runs GROUP BY model, harness)) AS ranked_count
       FROM runs`,
    ),
  ])

  const stats = (statsResult.results?.[0] || {}) as Record<string, number>
  const runs = (leaderboardResult.results as any[]).map((r) => {
    const suites = JSON.parse(r.suites_summary_json || "{}")
    return {
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
      profile_name: r.profile_name,
      profile_avatar_url: r.profile_avatar_url,
      profile_url: r.profile_url,
      command_used: r.command_used,
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
      agent_score: suites.agent?.score ?? null,
      agent_pass: suites.agent?.pass_count ?? null,
      agent_task_count: suites.agent?.task_count ?? null,
      suites,
    }
  })

  const totalCount = Number(stats.total_count || 0)
  const rankedCount = Number(stats.ranked_count || 0)

  return json({
    generated_at: new Date().toISOString(),
    count: runs.length,
    total_count: totalCount,
    ranked_count: rankedCount,
    full_count: Number(stats.full_count || 0),
    unique_models: Number(stats.unique_models || 0),
    unique_machines: Number(stats.unique_machines || 0),
    limit,
    offset,
    has_more: offset + runs.length < rankedCount,
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get("Origin")
    const credentialPath = url.pathname.startsWith("/api/auth/")
      || url.pathname.startsWith("/account/")
      || url.pathname.startsWith("/community/")
      || url.pathname === "/runner/pair/approve"
      || url.pathname === "/v1/runner/pair/approve"
      || url.pathname === "/threads"
      || url.pathname.startsWith("/threads/")
    const cors = credentialPath
      ? credentialCorsHeaders(origin, env)
      : publicCorsHeaders(origin, env.ALLOWED_ORIGINS)

    if (request.method === "OPTIONS") {
      if (credentialPath && origin && cors["Access-Control-Allow-Origin"] === "null") {
        return json({ error: "origin_not_allowed" }, 403)
      }
      return new Response(null, { status: 204, headers: cors })
    }

    let resp: Response
    try {
      if (url.pathname === "/health") resp = json({ ok: true, accounts: authAvailable(env), ts: new Date().toISOString() })
      else if (url.pathname.startsWith("/api/auth/")) {
        resp = authAvailable(env)
          ? await createAuth(env, ctx).handler(request)
          : json({ error: "accounts_not_configured" }, 503)
      }
      else if (url.pathname.startsWith("/account/") || url.pathname.startsWith("/community/")) {
        resp = url.pathname.startsWith("/account/runners")
          ? await handleRunner(request, env, ctx)
          : await handleCommunity(request, env, ctx)
      }
      else if (url.pathname.startsWith("/runner/pair/") || url.pathname.startsWith("/v1/runner/pair/")) resp = await handleRunner(request, env, ctx)
      else if (url.pathname === "/threads" || url.pathname.startsWith("/threads/")) resp = await handleThreads(request, env, ctx)
      else if (url.pathname === "/submit" && request.method === "POST") resp = await handleSubmit(request, env)
      else if (url.pathname === "/v1/runs" && request.method === "POST") {
        const runner = await authenticateRunner(request, env)
        resp = runner ? await handleSubmit(request, env, runner) : json({ error: "invalid_runner_token" }, 401)
      }
      else if (url.pathname === "/ask" && request.method === "POST") resp = await handleAsk(request, env, ctx)
      else if (url.pathname === "/leaderboard") resp = await handleLeaderboard(request, env)
      else if (url.pathname.startsWith("/runs/")) resp = await handleRun(decodeURIComponent(url.pathname.slice(6)), env)
      else resp = json({
        error: "not found",
        routes: ["/health", "/api/auth/*", "/account/*", "/community/*", "/threads/*", "/runner/pair/*", "/v1/runner/pair/*", "POST /v1/runs", "POST /submit", "POST /ask", "/leaderboard", "/runs/:id"],
      }, 404)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "internal error"
      console.error(JSON.stringify({ message: "request_failed", error: message, method: request.method, path: url.pathname }))
      resp = json({ error: "internal_error" }, 500)
    }

    return withHeaders(resp, cors)
  },
}
