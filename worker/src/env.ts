export interface Env {
  DB: D1Database
  ALLOWED_ORIGINS: string
  ASK_RATE_LIMITER: RateLimit
  HERMES_BRIDGE_URL: string
  HERMES_BRIDGE_TOKEN: string
}
