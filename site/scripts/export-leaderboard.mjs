#!/usr/bin/env node
/**
 * Export local BenchLoop runs into the public leaderboard JSON consumed by
 * the static site at /data/leaderboard.json.
 *
 * Reads:   ~/.bench-loop/runs/<runId>/run.json
 * Writes:  bench-loop-web/site/public/data/leaderboard.json
 *
 * Filters to "full benchmark" runs (all 5 quality suites + speed) so the
 * public board stays apples-to-apples.
 *
 * Usage:
 *   node scripts/export-leaderboard.mjs            # default paths
 *   node scripts/export-leaderboard.mjs --all      # include partial runs
 *   node scripts/export-leaderboard.mjs --src ~/.bench-loop/runs --out custom.json
 */
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { homedir } from 'node:os'

const REQUIRED_FULL = new Set([
  'speed',
  'toolcall',
  'dataextract',
  'instructfollow',
  'reasonmath',
])
// Quality-only runs (all five non-speed suites). Used for harness comparisons
// where you want apples-to-apples quality scores without re-running speed.
const REQUIRED_QUALITY = new Set([
  'toolcall',
  'dataextract',
  'instructfollow',
  'reasonmath',
])

const args = process.argv.slice(2)
const includeAll = args.includes('--all')
// Cutoff: scoring was overhauled 2026-05-01 (new speed curve, fixed harnesses,
// canonical bench_loop path). Older runs used an incompatible scale, so we drop
// them from the public leaderboard unless --legacy is passed.
const includeLegacy = args.includes('--legacy')
const MIN_TS = '2026-05-01T00:00:00Z'
let srcDir = resolve(homedir(), '.bench-loop', 'runs')
let outFile = resolve(dirname(new URL(import.meta.url).pathname), '..', 'public', 'data', 'leaderboard.json')

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src' && args[i + 1]) srcDir = resolve(args[++i])
  else if (args[i] === '--out' && args[i + 1]) outFile = resolve(args[++i])
}

if (!statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`[export] runs dir not found: ${srcDir}`)
  process.exit(1)
}

const entries = readdirSync(srcDir)
  .map((id) => ({ id, dir: join(srcDir, id) }))
  .filter((e) => statSync(e.dir).isDirectory())
  .filter((e) => statSync(join(e.dir, 'run.json'), { throwIfNoEntry: false })?.isFile())

const runs = []
for (const { id, dir } of entries) {
  try {
    const data = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
    const suites = data.suites || {}
    const suiteNames = Object.keys(suites)
    const isFull = [...REQUIRED_FULL].every((s) => suiteNames.includes(s))
    const isQualityFull = [...REQUIRED_QUALITY].every((s) => suiteNames.includes(s))
    const isAgentOnly = suiteNames.length === 1 && suiteNames[0] === 'agent'

    // Default: keep full benchmarks, harness-comparison quality runs, and
    // agent-only runs (which now power the agent leaderboard tab).
    if (!includeAll && !isFull && !isQualityFull && !isAgentOnly) continue
    if (!includeLegacy && data.timestamp && data.timestamp < MIN_TS) continue

    // Strip filesystem paths from model names (legacy lmstudio runs leaked the
    // full Windows blob path). Keep only the trailing model basename.
    let modelId = data.model?.model_id || 'unknown'
    if (modelId.includes('/') && modelId.endsWith('.gguf')) {
      modelId = modelId.split('/').pop() || modelId
    }

    runs.push({
      id,
      timestamp: data.timestamp || '',
      model: modelId,
      harness: data.harness || 'raw',
      provider: data.provider || '',
      machine: data.machine?.gpu || data.machine?.cpu || data.machine?.machine_id || '',
      overall_score: data.overall_score || 0,
      quality_score: data.quality_score || 0,
      speed_score: data.speed_score || 0,
      reliability_score: data.reliability_score || 0,
      generation_tok_per_sec: data.speed_metrics?.generation_tok_per_sec || 0,
      ttft_ms: data.speed_metrics?.ttft_ms || 0,
      is_full_benchmark: isFull,
      is_quality_full: isQualityFull,
      is_agent_only: isAgentOnly,
      agent_score: suites.agent?.score ?? null,
      agent_pass: suites.agent?.pass_count ?? null,
      agent_task_count: suites.agent?.task_count ?? null,
      suites: Object.fromEntries(
        Object.entries(suites).map(([k, v]) => [k, { score: v.score || 0 }])
      ),
    })
  } catch (err) {
    console.warn(`[export] skipped ${id}:`, err.message)
  }
}

// Keep best run per model+harness so the public board reflects the model's peak.
const best = new Map()
for (const r of runs) {
  const key = `${r.model}::${r.harness}`
  const existing = best.get(key)
  if (!existing || r.overall_score > existing.overall_score) {
    best.set(key, r)
  }
}

const out = {
  generated_at: new Date().toISOString(),
  count: best.size,
  source: 'bench-loop local runs',
  runs: [...best.values()].sort((a, b) => b.overall_score - a.overall_score),
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(out, null, 2))
console.log(`[export] wrote ${out.count} runs to ${outFile}`)
