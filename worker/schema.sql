-- BenchLoop public leaderboard schema
-- Each row = one submitted run. Dedupe by (run_id, machine_id) so the same
-- run from the same machine can't be double-counted.

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,                -- internal id: <machine_id>:<run_id>
  run_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,         -- ISO timestamp of submission
  run_timestamp TEXT NOT NULL,        -- timestamp from run.json

  model TEXT NOT NULL,
  family TEXT,
  parameter_count TEXT,
  quantization TEXT,

  harness TEXT NOT NULL,
  provider TEXT NOT NULL,

  cpu TEXT,
  gpu TEXT,
  gpu_memory_gb REAL,
  system_memory_gb REAL,
  os TEXT,
  is_remote INTEGER DEFAULT 0,
  remote_host TEXT,
  endpoint TEXT,
  hardware_label TEXT,
  profile_name TEXT,
  profile_avatar_url TEXT,
  profile_url TEXT,
  command_used TEXT,

  overall_score REAL NOT NULL,
  quality_score REAL,
  speed_score REAL,
  reliability_score REAL,
  value_score REAL,

  generation_tok_per_sec REAL,
  ttft_ms REAL,
  total_runtime_sec REAL,

  is_full_benchmark INTEGER DEFAULT 0,
  is_quality_full INTEGER DEFAULT 0,
  is_agent_only INTEGER DEFAULT 0,

  suites_json TEXT NOT NULL,          -- {suite_name: {score, pass_count, task_count}}
  submitter_ip TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_model ON runs(model);
CREATE INDEX IF NOT EXISTS idx_runs_overall ON runs(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_submitted ON runs(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_full ON runs(is_full_benchmark, overall_score DESC);
