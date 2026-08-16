import { getViewer, siteOrigins } from "./auth"

type JsonObject = Record<string, unknown>

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const DEVICE_CODE_PATTERN = /^blp_[A-Za-z0-9_-]{40,60}$/
const RUNNER_TOKEN_PATTERN = /^blr_[A-Za-z0-9_-]{40,60}$/
const USER_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readBody(request: Request, maxBytes = 20_000): Promise<JsonObject | null> {
  const declared = Number.parseInt(request.headers.get("Content-Length") || "0", 10)
  if (Number.isFinite(declared) && declared > maxBytes) return null
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > maxBytes) return null
    const parsed: unknown = JSON.parse(raw || "{}")
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function randomToken(bytes = 32): string {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  let binary = ""
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function randomUserCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(8))
  const code = Array.from(values, (value) => USER_CODE_ALPHABET[value % USER_CODE_ALPHABET.length]).join("")
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function verificationOrigin(env: Env): string {
  return siteOrigins(env).find((origin) => origin.startsWith("https://") && !origin.includes("www."))
    || "https://bench-loop.com"
}

async function startPairing(request: Request, env: Env): Promise<Response> {
  const connectingIp = request.headers.get("CF-Connecting-IP") || "unknown"
  const rate = await env.PAIR_RATE_LIMITER.limit({ key: connectingIp })
  if (!rate.success) return json({ error: "pairing_rate_limited" }, 429)
  const body = await readBody(request)
  if (!body) return json({ error: "invalid_device" }, 400)

  const deviceName = typeof body.device_name === "string" ? body.device_name.trim() : "BenchLoop Runner"
  const publicKey = body.public_key == null ? null : String(body.public_key)
  const capabilities = isRecord(body.capabilities) ? body.capabilities : {}
  const capabilitiesJson = JSON.stringify(capabilities)
  if (!deviceName || deviceName.length > 100 || (publicKey && publicKey.length > 10_000) || capabilitiesJson.length > 10_000) {
    return json({ error: "invalid_device" }, 400)
  }

  const expiresIn = 600
  const expiresAt = new Date(Date.now() + expiresIn * 1_000).toISOString()
  const deviceCode = `blp_${randomToken()}`
  const deviceCodeHash = await sha256(deviceCode)

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userCode = randomUserCode()
    try {
      await env.DB.prepare(
        `INSERT INTO runner_pairing_requests
          (device_code_hash, user_code, device_name, public_key, capabilities_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(deviceCodeHash, userCode, deviceName, publicKey, capabilitiesJson, expiresAt).run()
      return json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${verificationOrigin(env)}/connect`,
        verification_uri_complete: `${verificationOrigin(env)}/connect?code=${encodeURIComponent(userCode)}`,
        expires_in: expiresIn,
        interval: 3,
      }, 201)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ""
      if (!message.toLowerCase().includes("unique")) throw error
    }
  }
  return json({ error: "pairing_capacity" }, 503)
}

async function approvePairing(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await getViewer(request, env, ctx)
  if (!viewer) return json({ error: "authentication_required" }, 401)
  const body = await readBody(request, 10_000)
  const userCode = typeof body?.user_code === "string" ? body.user_code.trim().toUpperCase() : ""
  if (!USER_CODE_PATTERN.test(userCode)) return json({ error: "invalid_user_code" }, 400)

  const pairing = await env.DB.prepare(
    `SELECT id, device_name, approved_by, consumed_at,
            julianday(expires_at) <= julianday('now') AS expired
       FROM runner_pairing_requests WHERE user_code = ?`,
  ).bind(userCode).first<{ id: number; device_name: string; approved_by: string | null; consumed_at: string | null; expired: number }>()
  if (!pairing) return json({ error: "invalid_user_code" }, 404)
  if (pairing.expired) return json({ error: "expired_token" }, 410)
  if (pairing.consumed_at) return json({ error: "device_code_consumed" }, 409)
  if (pairing.approved_by && pairing.approved_by !== viewer.profile.id) return json({ error: "already_approved" }, 409)

  const updated = await env.DB.prepare(
    `UPDATE runner_pairing_requests
        SET approved_by = ?, approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND consumed_at IS NULL AND julianday(expires_at) > julianday('now')
        AND (approved_by IS NULL OR approved_by = ?)
      RETURNING device_name`,
  ).bind(viewer.profile.id, pairing.id, viewer.profile.id).first<{ device_name: string }>()
  if (!updated) return json({ error: "pairing_changed" }, 409)
  return json({ approved: true, device_name: updated.device_name })
}

async function exchangePairing(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request, 10_000)
  const deviceCode = typeof body?.device_code === "string" ? body.device_code.trim() : ""
  if (!DEVICE_CODE_PATTERN.test(deviceCode)) return json({ error: "invalid_device_code" }, 400)

  const codeHash = await sha256(deviceCode)
  const state = await env.DB.prepare(
    `SELECT approved_by, consumed_at, julianday(expires_at) <= julianday('now') AS expired
       FROM runner_pairing_requests WHERE device_code_hash = ?`,
  ).bind(codeHash).first<{ approved_by: string | null; consumed_at: string | null; expired: number }>()
  if (!state) return json({ error: "invalid_device_code" }, 400)
  if (state.expired) return json({ error: "expired_token" }, 410)
  if (state.consumed_at) return json({ error: "device_code_consumed" }, 409)
  if (!state.approved_by) return json({ error: "authorization_pending" }, 428)

  const runnerToken = `blr_${randomToken()}`
  const tokenHash = await sha256(runnerToken)
  const pairing = await env.DB.prepare(
    `UPDATE runner_pairing_requests
        SET consumed_at = CURRENT_TIMESTAMP
      WHERE device_code_hash = ? AND approved_by IS NOT NULL AND consumed_at IS NULL
        AND julianday(expires_at) > julianday('now')
      RETURNING approved_by, device_name, public_key, capabilities_json`,
  ).bind(codeHash).first<{
    approved_by: string
    device_name: string
    public_key: string | null
    capabilities_json: string
  }>()
  if (!pairing) return json({ error: "device_code_consumed" }, 409)

  const inserted = await env.DB.prepare(
    `INSERT INTO runner_devices
      (owner_id, name, token_hash, public_key, capabilities_json)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, paired_at`,
  ).bind(pairing.approved_by, pairing.device_name, tokenHash, pairing.public_key, pairing.capabilities_json)
    .first<{ id: number; paired_at: string }>()
  if (!inserted) throw new Error("runner_device_not_created")
  const profile = await env.DB.prepare("SELECT handle FROM profiles WHERE id = ?")
    .bind(pairing.approved_by).first<{ handle: string }>()

  return json({
    token: runnerToken,
    access_token: runnerToken,
    token_type: "Bearer",
    device_id: String(inserted.id),
    device_name: pairing.device_name,
    handle: profile?.handle || "builder",
    paired_at: inserted.paired_at,
  })
}

async function listRunners(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await getViewer(request, env, ctx)
  if (!viewer) return json({ error: "authentication_required" }, 401)
  const rows = await env.DB.prepare(
    `SELECT id, name, public_key, capabilities_json, paired_at, last_seen_at, revoked_at
       FROM runner_devices WHERE owner_id = ? ORDER BY paired_at DESC, id DESC LIMIT 50`,
  ).bind(viewer.profile.id).all<JsonObject>()
  return json({ runners: rows.results.map((row) => ({
    ...row,
    capabilities: JSON.parse(String(row.capabilities_json || "{}")),
    capabilities_json: undefined,
  })) })
}

async function revokeRunner(request: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  const viewer = await getViewer(request, env, ctx)
  if (!viewer) return json({ error: "authentication_required" }, 401)
  if (!/^\d{1,18}$/.test(id)) return json({ error: "invalid_runner_id" }, 400)
  const row = await env.DB.prepare(
    `UPDATE runner_devices SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
      WHERE id = ? AND owner_id = ? RETURNING id`,
  ).bind(id, viewer.profile.id).first<{ id: number }>()
  if (!row) return json({ error: "not_found" }, 404)
  return json({ revoked: true, id: String(row.id) })
}

export async function handleRunner(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/v1(?=\/)/, "")
  if (path === "/runner/pair/start" && request.method === "POST") return startPairing(request, env)
  if (path === "/runner/pair/approve" && request.method === "POST") return approvePairing(request, env, ctx)
  if (path === "/runner/pair/token" && request.method === "POST") return exchangePairing(request, env)
  if (path === "/account/runners" && request.method === "GET") return listRunners(request, env, ctx)
  const match = path.match(/^\/account\/runners\/(\d+)$/)
  if (match && request.method === "DELETE") return revokeRunner(request, env, ctx, match[1])
  return json({ error: "not_found" }, 404)
}

export async function authenticateRunner(request: Request, env: Env): Promise<{
  id: number
  ownerId: string
  name: string
} | null> {
  const authorization = request.headers.get("Authorization") || ""
  const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : ""
  if (!RUNNER_TOKEN_PATTERN.test(token)) return null
  const device = await env.DB.prepare(
    `SELECT id, owner_id, name FROM runner_devices
      WHERE token_hash = ? AND revoked_at IS NULL`,
  ).bind(await sha256(token)).first<{ id: number; owner_id: string; name: string }>()
  return device ? { id: device.id, ownerId: device.owner_id, name: device.name } : null
}
