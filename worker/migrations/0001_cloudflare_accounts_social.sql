-- BenchLoop Cloudflare-native account and social foundation.
-- Existing benchmark rows remain in `runs`; this migration only adds nullable
-- ownership metadata and creates the account/community tables around them.

PRAGMA foreign_keys = ON;

-- Better Auth 1.6 core schema, using explicit names so auth records remain
-- clearly separated from BenchLoop product data.
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL,
  image TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt DATE,
  refreshTokenExpiresAt DATE,
  scope TEXT,
  password TEXT,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_verifications (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_userId_idx ON auth_sessions(userId);
CREATE INDEX IF NOT EXISTS auth_accounts_userId_idx ON auth_accounts(userId);
CREATE UNIQUE INDEX IF NOT EXISTS auth_accounts_provider_uidx ON auth_accounts(providerId, accountId);
CREATE INDEX IF NOT EXISTS auth_verifications_identifier_idx ON auth_verifications(identifier);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  bio TEXT NOT NULL DEFAULT '' CHECK(length(bio) <= 500),
  avatar_url TEXT,
  github_url TEXT,
  x_url TEXT,
  website_url TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN (0, 1)),
  onboarding_complete INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_complete IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(handle GLOB '[a-z0-9]*' AND length(handle) BETWEEN 2 AND 30)
);

CREATE TABLE IF NOT EXISTS rigs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  hardware_label TEXT NOT NULL,
  cpu TEXT,
  gpu TEXT,
  soc TEXT,
  system_memory_gb REAL CHECK(system_memory_gb IS NULL OR system_memory_gb >= 0),
  gpu_memory_gb REAL CHECK(gpu_memory_gb IS NULL OR gpu_memory_gb >= 0),
  operating_system TEXT,
  fingerprint_hash TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted', 'private')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, name)
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  summary TEXT NOT NULL DEFAULT '' CHECK(length(summary) <= 1200),
  launch_command TEXT NOT NULL CHECK(length(launch_command) BETWEEN 1 AND 20000),
  sampling_json TEXT NOT NULL DEFAULT '{}',
  context_length INTEGER CHECK(context_length IS NULL OR context_length > 0),
  kv_cache TEXT,
  speculative_method TEXT,
  draft_depth INTEGER CHECK(draft_depth IS NULL OR draft_depth >= 0),
  verification_level TEXT NOT NULL DEFAULT 'claimed' CHECK(verification_level IN ('claimed', 'captured', 'signed', 'reproduced')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted', 'private')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_id, slug)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  title TEXT CHECK(title IS NULL OR length(title) <= 180),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted', 'private')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reactions (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'upvote' CHECK(kind IN ('upvote', 'insightful', 'reproduced')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(post_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(follower_id, following_id),
  CHECK(follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((post_id IS NOT NULL) + (run_id IS NOT NULL) + (recipe_id IS NOT NULL) = 1)
);

CREATE TABLE IF NOT EXISTS ask_threads (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public', 'unlisted', 'private')),
  share_slug TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ask_messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES ask_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS runner_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  public_key TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  paired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS runner_pairing_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_code_hash TEXT NOT NULL UNIQUE CHECK(length(device_code_hash) = 64),
  user_code TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL CHECK(length(device_name) BETWEEN 1 AND 100),
  public_key TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  approved_by TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Attach account ownership to the existing public benchmark table. Existing
-- imported runs remain public and unclaimed until a signed-in builder claims
-- or republishes them through a Runner.
ALTER TABLE runs ADD COLUMN owner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE runs ADD COLUMN rig_id INTEGER REFERENCES rigs(id) ON DELETE SET NULL;
ALTER TABLE runs ADD COLUMN recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE runs ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public', 'unlisted', 'private'));
ALTER TABLE runs ADD COLUMN verification_level TEXT NOT NULL DEFAULT 'captured' CHECK(verification_level IN ('claimed', 'captured', 'signed', 'reproduced'));

CREATE INDEX IF NOT EXISTS profiles_created_idx ON profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS rigs_owner_idx ON rigs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recipes_owner_idx ON recipes(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recipes_public_idx ON recipes(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_author_idx ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_public_idx ON posts(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id, created_at, id);
CREATE INDEX IF NOT EXISTS comments_author_idx ON comments(author_id);
CREATE INDEX IF NOT EXISTS reactions_user_idx ON reactions(user_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows(following_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS saves_user_post_uidx ON saves(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS saves_user_run_uidx ON saves(user_id, run_id) WHERE run_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS saves_user_recipe_uidx ON saves(user_id, recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ask_threads_owner_idx ON ask_threads(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ask_messages_thread_idx ON ask_messages(thread_id, created_at, id);
CREATE INDEX IF NOT EXISTS runner_devices_owner_idx ON runner_devices(owner_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS runner_pairing_expiry_idx ON runner_pairing_requests(expires_at, id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS runs_owner_idx ON runs(owner_id, run_timestamp DESC);
