import { getViewer, type Viewer } from "./auth"

const MAX_BODY_BYTES = 32_768

type JsonObject = Record<string, unknown>

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readObject(request: Request): Promise<JsonObject | null> {
  const contentLength = Number.parseInt(request.headers.get("Content-Length") || "0", 10)
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null
  try {
    const value: unknown = await request.json()
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = value == null ? Number.NaN : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function requiredText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text.length >= min && text.length <= max ? text : null
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text.length <= max ? text : undefined
}

function safeUrl(value: unknown): string | null | undefined {
  const text = optionalText(value, 500)
  if (text == null) return text
  try {
    const url = new URL(text)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function validHandle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const handle = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_-]{1,29}$/.test(handle) ? handle : null
}

async function optionalViewer(request: Request, env: Env, ctx: ExecutionContext): Promise<Viewer | null> {
  try {
    return await getViewer(request, env, ctx)
  } catch (error) {
    console.error(JSON.stringify({ message: "viewer_session_failed", error: error instanceof Error ? error.message : String(error) }))
    return null
  }
}

async function requireViewer(request: Request, env: Env, ctx: ExecutionContext): Promise<Viewer | Response> {
  const viewer = await optionalViewer(request, env, ctx)
  return viewer || json({ error: "authentication_required" }, 401)
}

function isResponse(value: Viewer | Response): value is Response {
  return value instanceof Response
}

function publicProfile(row: JsonObject) {
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    bio: String(row.bio || ""),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    githubUrl: typeof row.github_url === "string" ? row.github_url : null,
    xUrl: typeof row.x_url === "string" ? row.x_url : null,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : null,
  }
}

async function handleConfig(env: Env): Promise<Response> {
  const github = Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim())
  const twitter = Boolean(env.TWITTER_CLIENT_ID?.trim() && env.TWITTER_CLIENT_SECRET?.trim())
  return json({
    backend: "cloudflare",
    configured: Boolean(env.BETTER_AUTH_SECRET?.trim()),
    providers: { github, twitter },
  })
}

async function handleMe(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await optionalViewer(request, env, ctx)
  if (!viewer) return json({ user: null, profile: null, providers: [] })
  const accounts = await env.DB.prepare(
    "SELECT providerId FROM auth_accounts WHERE userId = ? ORDER BY createdAt",
  ).bind(viewer.user.id).all<{ providerId: string }>()
  return json({
    user: viewer.user,
    profile: viewer.profile,
    providers: accounts.results.map((account) => account.providerId),
  })
}

async function updateProfile(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const result = await requireViewer(request, env, ctx)
  if (isResponse(result)) return result
  const body = await readObject(request)
  if (!body) return json({ error: "invalid_json" }, 400)

  const handle = body.handle === undefined ? undefined : validHandle(body.handle)
  const displayName = body.displayName === undefined ? undefined : requiredText(body.displayName, 1, 80)
  const bio = optionalText(body.bio, 500)
  const avatarUrl = safeUrl(body.avatarUrl)
  const githubUrl = safeUrl(body.githubUrl)
  const xUrl = safeUrl(body.xUrl)
  const websiteUrl = safeUrl(body.websiteUrl)
  const onboardingComplete = body.onboardingComplete === undefined
    ? undefined
    : body.onboardingComplete === true ? 1 : body.onboardingComplete === false ? 0 : undefined

  if ((body.handle !== undefined && handle === null)
    || (body.displayName !== undefined && displayName === null)
    || (body.bio !== undefined && bio === undefined)
    || (body.avatarUrl !== undefined && avatarUrl === undefined)
    || (body.githubUrl !== undefined && githubUrl === undefined)
    || (body.xUrl !== undefined && xUrl === undefined)
    || (body.websiteUrl !== undefined && websiteUrl === undefined)
    || (body.onboardingComplete !== undefined && onboardingComplete === undefined)) {
    return json({ error: "invalid_profile_fields" }, 400)
  }

  const updates: string[] = []
  const values: Array<string | number | null> = []
  const add = (column: string, value: string | number | null | undefined) => {
    if (value === undefined) return
    updates.push(`${column} = ?`)
    values.push(value)
  }
  add("handle", handle)
  add("display_name", displayName)
  add("bio", bio)
  add("avatar_url", avatarUrl)
  add("github_url", githubUrl)
  add("x_url", xUrl)
  add("website_url", websiteUrl)
  add("onboarding_complete", onboardingComplete)
  if (updates.length === 0) return json({ error: "no_profile_changes" }, 400)

  updates.push("updated_at = CURRENT_TIMESTAMP")
  try {
    await env.DB.prepare(`UPDATE profiles SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values, result.profile.id).run()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes("unique")) return json({ error: "handle_unavailable" }, 409)
    throw error
  }
  return handleMe(request, env, ctx)
}

async function loadFeed(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await optionalViewer(request, env, ctx)
  const url = new URL(request.url)
  const limit = boundedInteger(url.searchParams.get("limit"), 20, 1, 50)
  const rows = await env.DB.prepare(
    `SELECT p.id, p.title, p.body, p.run_id, p.recipe_id, p.created_at,
            a.handle, a.display_name, a.avatar_url,
            (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reaction_count,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
            CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(
              SELECT 1 FROM reactions vr
               WHERE vr.post_id = p.id AND vr.user_id = ? AND vr.kind = 'upvote'
            ) END AS viewer_reacted
       FROM posts p
       JOIN profiles a ON a.id = p.author_id
      WHERE p.visibility = 'public' AND a.is_public = 1
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?`,
  ).bind(viewer?.profile.id || null, viewer?.profile.id || null, limit).all<JsonObject>()
  return json({ posts: rows.results })
}

async function loadPost(request: Request, postId: number, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await optionalViewer(request, env, ctx)
  const row = await env.DB.prepare(
    `SELECT p.id, p.title, p.body, p.run_id, p.recipe_id, p.created_at,
            a.handle, a.display_name, a.avatar_url,
            (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reaction_count,
            (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
            CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(
              SELECT 1 FROM reactions vr
               WHERE vr.post_id = p.id AND vr.user_id = ? AND vr.kind = 'upvote'
            ) END AS viewer_reacted
       FROM posts p
       JOIN profiles a ON a.id = p.author_id
      WHERE p.id = ? AND (p.visibility = 'public' OR p.author_id = ?)`,
  ).bind(viewer?.profile.id || null, viewer?.profile.id || null, postId, viewer?.profile.id || "").first<JsonObject>()
  return row ? json({ post: row }) : json({ error: "not_found" }, 404)
}

async function publishPost(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  const body = await readObject(request)
  if (!body) return json({ error: "invalid_json" }, 400)
  const text = requiredText(body.body, 1, 10_000)
  const title = optionalText(body.title, 180)
  if (!text || title === undefined) return json({ error: "invalid_post" }, 400)
  const result = await env.DB.prepare(
    `INSERT INTO posts (author_id, title, body, visibility, created_at, updated_at)
     VALUES (?, ?, ?, 'public', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
  ).bind(viewer.profile.id, title, text).first<{ id: number }>()
  return json({ ok: true, id: result?.id }, 201)
}

async function setUpvote(request: Request, postId: number, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  const body = await readObject(request)
  if (!body || typeof body.active !== "boolean") return json({ error: "active_boolean_required" }, 400)
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND visibility = 'public'").bind(postId).first()
  if (!post) return json({ error: "not_found" }, 404)
  if (body.active) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO reactions (post_id, user_id, kind) VALUES (?, ?, 'upvote')",
    ).bind(postId, viewer.profile.id).run()
  } else {
    await env.DB.prepare(
      "DELETE FROM reactions WHERE post_id = ? AND user_id = ? AND kind = 'upvote'",
    ).bind(postId, viewer.profile.id).run()
  }
  return json({ ok: true, active: body.active })
}

async function loadComments(postId: number, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.body, c.created_at, p.handle, p.display_name, p.avatar_url
       FROM comments c
       JOIN profiles p ON p.id = c.author_id
       JOIN posts post ON post.id = c.post_id
      WHERE c.post_id = ? AND c.deleted_at IS NULL AND post.visibility = 'public'
      ORDER BY c.created_at, c.id`,
  ).bind(postId).all<JsonObject>()
  return json({ comments: rows.results })
}

async function publishComment(request: Request, postId: number, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  const body = await readObject(request)
  const text = body ? requiredText(body.body, 1, 4_000) : null
  if (!text) return json({ error: "invalid_comment" }, 400)
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND visibility = 'public'").bind(postId).first()
  if (!post) return json({ error: "not_found" }, 404)
  const inserted = await env.DB.prepare(
    `INSERT INTO comments (post_id, author_id, body, created_at, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
  ).bind(postId, viewer.profile.id, text).first<{ id: number }>()
  return json({ ok: true, id: inserted?.id }, 201)
}

async function loadProfile(request: Request, handle: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await optionalViewer(request, env, ctx)
  const row = await env.DB.prepare(
    `SELECT p.id, p.handle, p.display_name, p.bio, p.avatar_url, p.github_url, p.x_url, p.website_url,
            (SELECT COUNT(*) FROM runs r WHERE r.owner_id = p.id AND r.visibility = 'public') AS run_count,
            (SELECT COUNT(*) FROM recipes recipe WHERE recipe.owner_id = p.id AND recipe.visibility = 'public') AS recipe_count,
            (SELECT COUNT(*) FROM rigs rig WHERE rig.owner_id = p.id AND rig.visibility = 'public') AS rig_count,
            (SELECT COUNT(*) FROM follows f WHERE f.following_id = p.id) AS follower_count,
            CASE WHEN ? IS NULL THEN 0 ELSE EXISTS(
              SELECT 1 FROM follows vf WHERE vf.follower_id = ? AND vf.following_id = p.id
            ) END AS viewer_follows
       FROM profiles p
      WHERE p.handle = ? COLLATE NOCASE AND (p.is_public = 1 OR p.id = ?)`,
  ).bind(viewer?.profile.id || null, viewer?.profile.id || null, handle, viewer?.profile.id || "").first<JsonObject>()
  if (!row) return json({ error: "not_found" }, 404)
  const showPrivate = viewer?.profile.id === String(row.id)
  const rigs = await env.DB.prepare(
    `SELECT id, name, hardware_label, cpu, gpu, soc, system_memory_gb, gpu_memory_gb,
            operating_system, visibility, last_seen_at
       FROM rigs
      WHERE owner_id = ? AND (? = 1 OR visibility = 'public')
      ORDER BY created_at DESC, id DESC`,
  ).bind(String(row.id), showPrivate ? 1 : 0).all<JsonObject>()
  return json({ profile: row, rigs: rigs.results })
}

async function setFollowing(request: Request, profileId: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  if (viewer.profile.id === profileId) return json({ error: "cannot_follow_self" }, 400)
  const body = await readObject(request)
  if (!body || typeof body.active !== "boolean") return json({ error: "active_boolean_required" }, 400)
  const target = await env.DB.prepare("SELECT id FROM profiles WHERE id = ? AND is_public = 1").bind(profileId).first()
  if (!target) return json({ error: "not_found" }, 404)
  if (body.active) {
    await env.DB.prepare("INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)")
      .bind(viewer.profile.id, profileId).run()
  } else {
    await env.DB.prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")
      .bind(viewer.profile.id, profileId).run()
  }
  return json({ ok: true, active: body.active })
}

async function listRigs(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  const rigs = await env.DB.prepare(
    `SELECT id, name, hardware_label, cpu, gpu, soc, system_memory_gb, gpu_memory_gb,
            operating_system, visibility, last_seen_at
       FROM rigs WHERE owner_id = ? ORDER BY created_at DESC, id DESC`,
  ).bind(viewer.profile.id).all<JsonObject>()
  return json({ rigs: rigs.results })
}

async function createRig(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const viewer = await requireViewer(request, env, ctx)
  if (isResponse(viewer)) return viewer
  const body = await readObject(request)
  if (!body) return json({ error: "invalid_json" }, 400)
  const name = requiredText(body.name, 1, 80)
  const hardwareLabel = requiredText(body.hardwareLabel, 1, 200)
  const visibility = body.visibility === undefined ? "public" : body.visibility
  if (!name || !hardwareLabel || !["public", "unlisted", "private"].includes(String(visibility))) {
    return json({ error: "invalid_rig" }, 400)
  }
  const numberValue = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO rigs
        (owner_id, name, hardware_label, cpu, gpu, soc, system_memory_gb, gpu_memory_gb,
         operating_system, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
    ).bind(
      viewer.profile.id,
      name,
      hardwareLabel,
      optionalText(body.cpu, 240) || null,
      optionalText(body.gpu, 240) || null,
      optionalText(body.soc, 240) || null,
      numberValue(body.systemMemoryGb),
      numberValue(body.gpuMemoryGb),
      optionalText(body.operatingSystem, 240) || null,
      String(visibility),
    ).first<{ id: number }>()
    return json({ ok: true, id: inserted?.id }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.toLowerCase().includes("unique")) return json({ error: "rig_name_unavailable" }, 409)
    throw error
  }
}

function numericSegment(value: string): number | null {
  return /^\d+$/.test(value) ? Number.parseInt(value, 10) : null
}

export async function handleCommunity(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)
  const segments = url.pathname.split("/").filter(Boolean)

  if (url.pathname === "/account/config" && request.method === "GET") return handleConfig(env)
  if (url.pathname === "/account/me" && request.method === "GET") return handleMe(request, env, ctx)
  if (url.pathname === "/account/profile" && request.method === "PATCH") return updateProfile(request, env, ctx)
  if (url.pathname === "/account/rigs" && request.method === "GET") return listRigs(request, env, ctx)
  if (url.pathname === "/account/rigs" && request.method === "POST") return createRig(request, env, ctx)
  if (url.pathname === "/community/feed" && request.method === "GET") return loadFeed(request, env, ctx)
  if (url.pathname === "/community/posts" && request.method === "POST") return publishPost(request, env, ctx)

  if (segments[0] === "community" && segments[1] === "posts") {
    const postId = numericSegment(segments[2] || "")
    if (postId == null) return json({ error: "invalid_post_id" }, 400)
    if (segments.length === 3 && request.method === "GET") return loadPost(request, postId, env, ctx)
    if (segments[3] === "upvote" && request.method === "PUT") return setUpvote(request, postId, env, ctx)
    if (segments[3] === "comments" && request.method === "GET") return loadComments(postId, env)
    if (segments[3] === "comments" && request.method === "POST") return publishComment(request, postId, env, ctx)
  }

  if (segments[0] === "community" && segments[1] === "profiles" && segments[2]) {
    if (segments.length === 3 && request.method === "GET") {
      return loadProfile(request, decodeURIComponent(segments[2]), env, ctx)
    }
    if (segments[3] === "follow" && request.method === "PUT") {
      return setFollowing(request, decodeURIComponent(segments[2]), env, ctx)
    }
  }

  return json({ error: "not_found" }, 404)
}
