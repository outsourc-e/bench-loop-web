import { betterAuth } from "better-auth"

export type ViewerProfile = {
  id: string
  handle: string
  displayName: string
  bio: string
  avatarUrl: string | null
  githubUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  onboardingComplete: boolean
}

export type Viewer = {
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image?: string | null
  }
  profile: ViewerProfile
}

export function siteOrigins(env: Env): string[] {
  return env.SITE_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
}

export function providerAvailability(env: Env) {
  return {
    github: Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim()),
    twitter: Boolean(env.TWITTER_CLIENT_ID?.trim() && env.TWITTER_CLIENT_SECRET?.trim()),
  }
}

export function authAvailable(env: Env): boolean {
  return Boolean(env.BETTER_AUTH_SECRET?.trim() && env.BETTER_AUTH_SECRET.length >= 32)
}

export function profileFromRow(row: Record<string, unknown>): ViewerProfile {
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    bio: String(row.bio || ""),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    githubUrl: typeof row.github_url === "string" ? row.github_url : null,
    xUrl: typeof row.x_url === "string" ? row.x_url : null,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : null,
    onboardingComplete: Number(row.onboarding_complete || 0) === 1,
  }
}

function baseHandle(name: string, email: string): string {
  const seed = (name || email.split("@")[0] || "builder").toLowerCase()
  const normalized = seed
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/[-_]+$/, "")
    .slice(0, 30)
  if (normalized.length >= 2) return normalized
  return "builder"
}

async function ensureProfile(
  db: D1Database,
  user: { id: string; name: string; email: string; image?: string | null },
): Promise<ViewerProfile> {
  const existing = await db.prepare(
    `SELECT id, handle, display_name, bio, avatar_url, github_url, x_url,
            website_url, onboarding_complete
       FROM profiles WHERE id = ?`,
  ).bind(user.id).first<Record<string, unknown>>()
  if (existing) return profileFromRow(existing)

  const base = baseHandle(user.name, user.email)
  const collision = await db.prepare("SELECT id FROM profiles WHERE handle = ? COLLATE NOCASE").bind(base).first()
  const suffix = user.id.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "builder"
  const handle = collision ? `${base.slice(0, 21)}-${suffix}` : base

  await db.prepare(
    `INSERT OR IGNORE INTO profiles
      (id, handle, display_name, avatar_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).bind(user.id, handle, (user.name || handle).slice(0, 80), user.image || null).run()

  const created = await db.prepare(
    `SELECT id, handle, display_name, bio, avatar_url, github_url, x_url,
            website_url, onboarding_complete
       FROM profiles WHERE id = ?`,
  ).bind(user.id).first<Record<string, unknown>>()
  if (!created) throw new Error("BenchLoop could not create the account profile")
  return profileFromRow(created)
}

export function createAuth(env: Env, ctx?: ExecutionContext) {
  const providers = providerAvailability(env)
  const github = providers.github
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
      }
    : {}
  const twitter = providers.twitter
    ? {
        twitter: {
          clientId: env.TWITTER_CLIENT_ID,
          clientSecret: env.TWITTER_CLIENT_SECRET,
          mapProfileToUser: (profile: { data: { id: string; username: string; email?: string; name: string } }) => ({
            email: profile.data.email || `${profile.data.id}@x.invalid`,
            name: profile.data.name || profile.data.username,
          }),
        },
      }
    : {}

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    trustedOrigins: siteOrigins(env),
    socialProviders: { ...github, ...twitter },
    emailAndPassword: { enabled: false },
    account: {
      modelName: "auth_accounts",
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        updateUserInfoOnLink: true,
        allowDifferentEmails: true,
        trustedProviders: ["github", "twitter"],
      },
    },
    user: { modelName: "auth_users" },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    verification: { modelName: "auth_verifications" },
    advanced: {
      database: { generateId: "uuid" },
      ...(ctx ? {
        backgroundTasks: {
          handler: (promise: Promise<unknown>) => ctx.waitUntil(promise),
        },
      } : {}),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await ensureProfile(env.DB, user)
          },
        },
      },
    },
  })
}

export async function getViewer(request: Request, env: Env, ctx?: ExecutionContext): Promise<Viewer | null> {
  if (!authAvailable(env)) return null
  const auth = createAuth(env, ctx)
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null
  const profile = await ensureProfile(env.DB, session.user)
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      image: session.user.image,
    },
    profile,
  }
}

type GithubProfile = {
  login?: string
  avatar_url?: string
  html_url?: string
  bio?: string | null
  blog?: string | null
  twitter_username?: string | null
}

type TwitterProfile = {
  data?: {
    username?: string
    profile_image_url?: string
    description?: string
    url?: string
  }
}

function safeProfileUrl(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  try {
    const parsed = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null
  } catch {
    return null
  }
}

async function updatedProfile(db: D1Database, userId: string): Promise<ViewerProfile> {
  const row = await db.prepare(
    `SELECT id, handle, display_name, bio, avatar_url, github_url, x_url,
            website_url, onboarding_complete
       FROM profiles WHERE id = ?`,
  ).bind(userId).first<Record<string, unknown>>()
  if (!row) throw new Error("profile_not_found")
  return profileFromRow(row)
}

export async function syncProviderProfile(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  providerId: "github" | "twitter",
): Promise<ViewerProfile> {
  const viewer = await getViewer(request, env, ctx)
  if (!viewer) throw new Error("authentication_required")
  const auth = createAuth(env, ctx)
  const token = await auth.api.getAccessToken({
    headers: request.headers,
    body: { providerId },
  })

  if (providerId === "github") {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token.accessToken}`,
        "User-Agent": "BenchLoop-Profile-Sync",
      },
    })
    if (!response.ok) throw new Error("github_profile_unavailable")
    const github = await response.json<GithubProfile>()
    const login = github.login?.trim()
    const githubUrl = safeProfileUrl(github.html_url || (login ? `https://github.com/${login}` : null))
    if (!githubUrl) throw new Error("github_profile_invalid")
    const xUrl = github.twitter_username?.trim()
      ? `https://x.com/${encodeURIComponent(github.twitter_username.trim().replace(/^@/, ""))}`
      : null
    await env.DB.prepare(
      `UPDATE profiles SET
         github_url = ?,
         avatar_url = CASE WHEN COALESCE(avatar_url, '') = '' THEN ? ELSE avatar_url END,
         bio = CASE WHEN bio = '' THEN COALESCE(?, bio) ELSE bio END,
         website_url = CASE WHEN COALESCE(website_url, '') = '' THEN ? ELSE website_url END,
         x_url = CASE WHEN COALESCE(x_url, '') = '' THEN ? ELSE x_url END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(
      githubUrl,
      safeProfileUrl(github.avatar_url),
      github.bio?.trim().slice(0, 500) || null,
      safeProfileUrl(github.blog),
      xUrl,
      viewer.profile.id,
    ).run()
  } else {
    const response = await fetch(
      "https://api.x.com/2/users/me?user.fields=profile_image_url,description,url",
      { headers: { "Authorization": `Bearer ${token.accessToken}` } },
    )
    if (!response.ok) throw new Error("x_profile_unavailable")
    const twitter = await response.json<TwitterProfile>()
    const profile = twitter.data
    const username = profile?.username?.trim().replace(/^@/, "")
    if (!username) throw new Error("x_profile_invalid")
    await env.DB.prepare(
      `UPDATE profiles SET
         x_url = ?,
         avatar_url = CASE WHEN COALESCE(avatar_url, '') = '' THEN ? ELSE avatar_url END,
         bio = CASE WHEN bio = '' THEN COALESCE(?, bio) ELSE bio END,
         website_url = CASE WHEN COALESCE(website_url, '') = '' THEN ? ELSE website_url END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(
      `https://x.com/${encodeURIComponent(username)}`,
      safeProfileUrl(profile?.profile_image_url),
      profile?.description?.trim().slice(0, 500) || null,
      safeProfileUrl(profile?.url),
      viewer.profile.id,
    ).run()
  }

  return updatedProfile(env.DB, viewer.profile.id)
}
