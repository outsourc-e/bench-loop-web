import { getViewer } from "./auth"

type JsonObject = Record<string, unknown>

type ThreadTurn = {
  id: string
  query: string
  response: JsonObject | null
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } })
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validThreadId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value)
}

function parseTurns(value: unknown): ThreadTurn[] | null {
  if (!Array.isArray(value) || value.length > 20) return null
  const turns: ThreadTurn[] = []
  let total = 0
  for (const turn of value) {
    if (!isRecord(turn) || typeof turn.id !== "string" || typeof turn.query !== "string") return null
    const id = turn.id.trim()
    const query = turn.query.trim()
    if (!validThreadId(id) || query.length < 1 || query.length > 800) return null
    const response = turn.response === undefined || turn.response === null
      ? null
      : isRecord(turn.response) ? turn.response : null
    if (turn.response !== undefined && turn.response !== null && response === null) return null
    total += query.length + (response ? JSON.stringify(response).length : 0)
    if (total > 200_000) return null
    turns.push({ id, query, response })
  }
  return turns
}

async function readBody(request: Request): Promise<JsonObject | null> {
  const length = Number.parseInt(request.headers.get("Content-Length") || "0", 10)
  if (Number.isFinite(length) && length > 256_000) return null
  try {
    const body: unknown = await request.json()
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

export async function handleThreads(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await getViewer(request, env, ctx)
  if (!viewer) return json({ error: "authentication_required" }, 401)

  const url = new URL(request.url)
  const segments = url.pathname.split("/").filter(Boolean)
  const threadId = segments[2] ? decodeURIComponent(segments[2]) : null

  if (segments.length === 2 && request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT t.id, t.title, t.visibility, t.share_slug, t.created_at, t.updated_at,
              (SELECT COUNT(*) FROM ask_messages m WHERE m.thread_id = t.id AND m.role = 'user') AS turn_count
         FROM ask_threads t
        WHERE t.owner_id = ?
        ORDER BY t.updated_at DESC, t.id DESC
        LIMIT 50`,
    ).bind(viewer.profile.id).all<JsonObject>()
    return json({ threads: rows.results })
  }

  if (!threadId || !validThreadId(threadId)) return json({ error: "invalid_thread_id" }, 400)

  if (segments.length === 3 && request.method === "GET") {
    const thread = await env.DB.prepare(
      `SELECT id, title, visibility, share_slug, created_at, updated_at
         FROM ask_threads WHERE id = ? AND owner_id = ?`,
    ).bind(threadId, viewer.profile.id).first<JsonObject>()
    if (!thread) return json({ error: "not_found" }, 404)
    const messages = await env.DB.prepare(
      `SELECT id, role, content, response_json, created_at
         FROM ask_messages WHERE thread_id = ? ORDER BY created_at, id`,
    ).bind(threadId).all<JsonObject>()
    return json({ thread, messages: messages.results })
  }

  if (segments.length === 3 && request.method === "PUT") {
    const body = await readBody(request)
    if (!body) return json({ error: "invalid_thread" }, 400)
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : ""
    const turns = parseTurns(body.turns)
    if (!title || !turns) return json({ error: "invalid_thread" }, 400)

    const existing = await env.DB.prepare("SELECT owner_id FROM ask_threads WHERE id = ?").bind(threadId).first<{ owner_id: string }>()
    if (existing && existing.owner_id !== viewer.profile.id) return json({ error: "forbidden" }, 403)

    await env.DB.prepare(
      `INSERT INTO ask_threads (id, owner_id, title, visibility, created_at, updated_at)
       VALUES (?, ?, ?, 'private', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = excluded.owner_id`,
    ).bind(threadId, viewer.profile.id, title).run()

    const statements: D1PreparedStatement[] = []
    for (const turn of turns) {
      statements.push(env.DB.prepare(
        `INSERT INTO ask_messages (id, thread_id, role, content, response_json, created_at)
         VALUES (?, ?, 'user', ?, NULL, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content
         WHERE thread_id = excluded.thread_id`,
      ).bind(`${turn.id}-user`, threadId, turn.query))
      if (turn.response) {
        const answer = typeof turn.response.answer === "string" ? turn.response.answer : ""
        if (answer) {
          statements.push(env.DB.prepare(
            `INSERT INTO ask_messages (id, thread_id, role, content, response_json, created_at)
             VALUES (?, ?, 'assistant', ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET content = excluded.content, response_json = excluded.response_json
             WHERE thread_id = excluded.thread_id`,
          ).bind(`${turn.id}-assistant`, threadId, answer, JSON.stringify(turn.response)))
        }
      }
    }
    if (statements.length > 0) await env.DB.batch(statements)
    return json({ ok: true, id: threadId, turns: turns.length })
  }

  if (segments.length === 3 && request.method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM ask_threads WHERE id = ? AND owner_id = ?")
      .bind(threadId, viewer.profile.id).run()
    return result.meta.changes ? json({ ok: true }) : json({ error: "not_found" }, 404)
  }

  return json({ error: "not_found" }, 404)
}
