import { useEffect, useMemo, useState } from 'react'

type SpeedStats = {
  peak_tps: number | null
  mean_tps: number | null
  median_tps: number | null
  stdev_tps: number | null
  prompt_tps_mean: number | null
}

type LeaderboardEntry = {
  stack_id: string
  model: { name: string; quant: string; size_gb: number | null }
  runtime: { name: string; version: string | null; commit: string | null }
  draft_model: { name: string; quant: string } | null
  draft_params: { draft_max: number | null; draft_min: number | null; draft_p_min: number | null } | null
  kv_cache_type_k: string
  kv_cache_type_v: string
  context_length: number
  rope_scaling: { method: string; scale: number } | null
  hardware: { gpu: string; vram_gb: number | null }
  speed: SpeedStats
  submitted_at?: string
  tag?: string
}

type LeaderboardData = {
  version: string
  generated_at: string
  model: string
  entry_count: number
  entries: LeaderboardEntry[]
}

type SortKey = 'mean_tps' | 'peak_tps' | 'median_tps' | 'stdev_tps' | 'prompt_tps_mean' | 'context_length'

const CONTEXT_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'All', min: 0, max: Infinity },
  { label: '≤8K', min: 0, max: 8192 },
  { label: '32K', min: 8193, max: 32768 },
  { label: '128-256K', min: 131072, max: 262144 },
  { label: '≥384K', min: 393216, max: Infinity },
]

function fmtCtx(n: number): string {
  if (n >= 1000000) return `${(n / 1048576).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1024)}K`
  return String(n)
}

function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null) return '—'
  return n.toFixed(digits)
}

function stackLabel(e: LeaderboardEntry): string {
  const draft = e.draft_model ? `${e.draft_model.name}/${e.draft_model.quant}` : 'no-draft'
  const p = e.draft_params
  const params = p ? `dmax${p.draft_max}/p${p.draft_p_min}` : ''
  const kv = `${e.kv_cache_type_k}`
  const yarn = e.rope_scaling ? `/yarn${e.rope_scaling.scale}x` : ''
  return `${draft} ${params} kv:${kv}${yarn}`.trim()
}

export default function StackLeaderboardTab() {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('mean_tps')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [ctxBucket, setCtxBucket] = useState<string>('All')

  useEffect(() => {
    fetch('/data/leaderboard-v1.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: LeaderboardData) => setData(d))
      .catch((e: Error) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    const bucket = CONTEXT_BUCKETS.find((b) => b.label === ctxBucket) ?? CONTEXT_BUCKETS[0]
    const list = data.entries.filter((e) => e.context_length >= bucket.min && e.context_length <= bucket.max)
    return list.sort((a, b) => {
      const av = (sortKey === 'context_length' ? a.context_length : a.speed[sortKey]) ?? -1
      const bv = (sortKey === 'context_length' ? b.context_length : b.speed[sortKey]) ?? -1
      const diff = (bv as number) - (av as number)
      return sortDir === 'desc' ? diff : -diff
    })
  }, [data, ctxBucket, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const arrow = (k: SortKey) => (sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '')

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 16, padding: '24px 0 16px' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏁</div>
        <h3 style={{ color: '#fff', marginBottom: 4 }}>Stack Leaderboard</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', maxWidth: 600, margin: '4px auto' }}>
          Deployment stacks ranked by throughput. runtime × quant × draft × KV × context × rope. Submit your own stack
          to compete.
        </p>
      </div>

      {error && (
        <div className="empty-state">
          <h3>Could not load leaderboard</h3>
          <p>{error}</p>
        </div>
      )}

      {!error && !data && (
        <div style={{ color: 'var(--text-dim)', textAlign: 'center' }}>Loading...</div>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, justifyContent: 'center' }}>
            {CONTEXT_BUCKETS.map((b) => (
              <button
                key={b.label}
                onClick={() => setCtxBucket(b.label)}
                className={ctxBucket === b.label ? 'nav-tab active' : 'nav-tab'}
                style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.8rem' }}
              >
                {b.label}
              </button>
            ))}
            <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', alignSelf: 'center' }}>
              {filtered.length} / {data.entry_count} stacks · {data.model}
            </span>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 900 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, width: 40 }}>#</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Stack
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => toggleSort('context_length')}
                  >
                    Context{arrow('context_length')}
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => toggleSort('mean_tps')}
                  >
                    Mean tps{arrow('mean_tps')}
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => toggleSort('peak_tps')}
                  >
                    Peak{arrow('peak_tps')}
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => toggleSort('median_tps')}
                  >
                    Median{arrow('median_tps')}
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => toggleSort('stdev_tps')}
                  >
                    σ{arrow('stdev_tps')}
                  </th>
                  <th
                    style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => toggleSort('prompt_tps_mean')}
                  >
                    Prompt tps{arrow('prompt_tps_mean')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>
                    Hardware
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={e.stack_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-dim)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', color: '#fff' }}>
                      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}>
                        {stackLabel(e)}
                      </div>
                      {e.tag && (
                        <div style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: 2 }}>{e.tag}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)' }}>
                      {fmtCtx(e.context_length)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: '#fff', fontWeight: 600 }}>
                      {fmtNum(e.speed.mean_tps)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)' }}>
                      {fmtNum(e.speed.peak_tps)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)' }}>
                      {fmtNum(e.speed.median_tps)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)' }}>
                      {fmtNum(e.speed.stdev_tps)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)' }}>
                      {fmtNum(e.speed.prompt_tps_mean, 0)}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                      {e.hardware.gpu}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem', textAlign: 'center', marginTop: 12 }}>
            Generated {new Date(data.generated_at).toLocaleString()} · schema {data.version}
          </p>
        </>
      )}
    </div>
  )
}
