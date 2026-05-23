import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeaderboard, type PublicRun } from '../hooks/useLeaderboard'
import {
  hasMeaningfulQuality,
  machineLabel,
  normalizedHardwareLabel,
  providerLabel,
  publisherLabel,
  publisherName,
  scoreOf,
  suiteSummary,
  timeAgo,
  type RankMode,
} from '../lib/leaderboard'

const RANK_MODES: { id: RankMode; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'agent', label: 'Agent loop' },
  { id: 'quality', label: 'Quality' },
  { id: 'speed', label: 'Speed' },
  { id: 'tok_per_sec', label: 'Raw tok/s' },
]

const HARNESSES = ['all', 'raw', 'hermes', 'qwen', 'pi'] as const
const HARDWARE_FILTER_ALL = 'all'
const PROVIDER_FILTER_ALL = 'all'
const PUBLISHER_FILTER_ALL = 'all'
const QUALITY_FLOORS = [0, 40, 60, 75] as const
const PAGE_SIZE = 50

type HarnessFilter = typeof HARNESSES[number]

function scoreClass(score: number): string {
  return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
}

function qualityFloorLabel(value: number): string {
  if (value <= 0) return 'Any quality'
  return `Quality ${value}+`
}

function bestRun(runs: PublicRun[], mode: RankMode, qualityFloor = 0): PublicRun | null {
  const filtered = runs.filter((run) => (mode === 'agent' ? (run.agent_score ?? -1) >= 0 : true) && hasMeaningfulQuality(run, qualityFloor))
  if (!filtered.length) return null
  return filtered.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode))[0] ?? null
}

export default function LeaderboardPage() {
  const { runs, loading, error } = useLeaderboard()
  const [mode, setMode] = useState<RankMode>('overall')
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'full' | 'all'>('all')
  const [harnessFilter, setHarnessFilter] = useState<HarnessFilter>('all')
  const [hardwareFilter, setHardwareFilter] = useState(HARDWARE_FILTER_ALL)
  const [providerFilter, setProviderFilter] = useState(PROVIDER_FILTER_ALL)
  const [publisherFilter, setPublisherFilter] = useState(PUBLISHER_FILTER_ALL)
  const [qualityFloor, setQualityFloor] = useState<number>(60)
  const [remoteFilter, setRemoteFilter] = useState<'all' | 'local' | 'remote'>('all')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 4) {
        next.add(id)
      }
      return next
    })
  }

  const ranked = useMemo(() => {
    const filtered = runs.filter((r) => {
      const query = search.trim().toLowerCase()
      if (query) {
        const haystack = [r.model, providerLabel(r), normalizedHardwareLabel(r), publisherLabel(r)]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (mode === 'agent' && (r.agent_score ?? -1) < 0) return false
      if (scope === 'full' && !r.is_full_benchmark) return false
      if (harnessFilter !== 'all' && (r.harness || 'raw') !== harnessFilter) return false
      if (hardwareFilter !== HARDWARE_FILTER_ALL && normalizedHardwareLabel(r) !== hardwareFilter) return false
      if (providerFilter !== PROVIDER_FILTER_ALL && providerLabel(r) !== providerFilter) return false
      if (publisherFilter !== PUBLISHER_FILTER_ALL && publisherLabel(r) !== publisherFilter) return false
      if (!hasMeaningfulQuality(r, qualityFloor)) return false
      if (remoteFilter !== 'all') {
        const isRemote = r.is_remote === true
        if (remoteFilter === 'remote' && !isRemote) return false
        if (remoteFilter === 'local' && isRemote) return false
      }
      return true
    })
    return filtered.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode))
  }, [runs, mode, search, scope, harnessFilter, hardwareFilter, providerFilter, publisherFilter, qualityFloor, remoteFilter])

  const compareRuns = useMemo(
    () => ranked.filter((r) => compareIds.has(r.id)),
    [ranked, compareIds]
  )

  // Reset to page 1 when filters change
  const filterKey = `${mode}|${search}|${scope}|${harnessFilter}|${hardwareFilter}|${providerFilter}|${publisherFilter}|${qualityFloor}|${remoteFilter}`
  useEffect(() => setPage(1), [filterKey])

  const totalPages = Math.ceil(ranked.length / PAGE_SIZE)
  const paginatedRuns = ranked.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hardwareOptions = useMemo(() => {
    return Array.from(new Set(runs.map((run) => normalizedHardwareLabel(run)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [runs])

  const providerOptions = useMemo(() => {
    return Array.from(new Set(runs.map((run) => providerLabel(run)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [runs])

  const publisherOptions = useMemo(() => {
    return Array.from(new Set(runs.map((run) => publisherLabel(run)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [runs])

  const stats = useMemo(() => {
    const totalRuns = runs.length
    const fullRuns = runs.filter((r) => r.is_full_benchmark).length
    const uniqueModels = new Set(runs.map((r) => r.model)).size
    const uniqueMachines = new Set(runs.map((r) => normalizedHardwareLabel(r)).filter((m) => m && m !== 'unknown hardware')).size
    const bestOverall = bestRun(runs, 'overall', qualityFloor)
    const fastestUsable = bestRun(runs, 'tok_per_sec', qualityFloor)
    const bestAgent = bestRun(runs, 'agent', qualityFloor)
    return { totalRuns, fullRuns, uniqueModels, uniqueMachines, bestOverall, fastestUsable, bestAgent }
  }, [runs, qualityFloor])

  const activeFilterChips = useMemo(() => {
    const chips: string[] = []
    if (scope === 'full') chips.push('full benchmarks')
    if (harnessFilter !== 'all') chips.push(`${harnessFilter} harness`)
    if (providerFilter !== PROVIDER_FILTER_ALL) chips.push(providerFilter)
    if (hardwareFilter !== HARDWARE_FILTER_ALL) chips.push(hardwareFilter)
    if (publisherFilter !== PUBLISHER_FILTER_ALL) chips.push(publisherFilter)
    if (qualityFloor > 0) chips.push(qualityFloorLabel(qualityFloor))
    if (remoteFilter !== 'all') chips.push(remoteFilter === 'local' ? 'local runs' : 'remote runs')
    if (search.trim()) chips.push(`search: ${search.trim()}`)
    return chips
  }, [scope, harnessFilter, providerFilter, hardwareFilter, publisherFilter, qualityFloor, remoteFilter, search])

  const filteredCount = ranked.length
  const totalCount = runs.length

  return (
    <div>
      <div className="page-kicker">Public leaderboard</div>
      <h1>Real local runs. Not token-per-second theater.</h1>
      <p className="page-subtitle">
        BenchLoop ranks models by useful work, not just raw throughput. The default board keeps a quality floor so a 200 tok/s gibberish run does not steal the podium.
      </p>

      {!loading && !error && runs.length > 0 && (
        <>
          <div className="metric-grid metric-grid-tight" style={{ marginTop: 18, marginBottom: 18 }}>
            <Stat label="Published runs" value={String(stats.totalRuns)} />
            <Stat label="Full benchmarks" value={String(stats.fullRuns)} />
            <Stat label="Unique models" value={String(stats.uniqueModels)} />
            <Stat label="Unique machines" value={String(stats.uniqueMachines)} />
          </div>
          <div className="lb-highlights-grid" style={{ marginBottom: 18 }}>
            <HighlightCard
              title="Best overall"
              subtitle={`Quality floor: ${qualityFloorLabel(qualityFloor)}`}
              run={stats.bestOverall}
              score={stats.bestOverall ? `${stats.bestOverall.overall_score.toFixed(1)} overall` : '—'}
            />
            <HighlightCard
              title="Fastest usable run"
              subtitle={`Ranked by raw tok/s with ${qualityFloorLabel(qualityFloor).toLowerCase()}`}
              run={stats.fastestUsable}
              score={stats.fastestUsable ? `${stats.fastestUsable.generation_tok_per_sec.toFixed(1)} tok/s` : '—'}
            />
            <HighlightCard
              title="Best agent loop"
              subtitle="For people who care whether the model can actually finish the task"
              run={stats.bestAgent}
              score={stats.bestAgent?.agent_score != null ? `${stats.bestAgent.agent_score.toFixed(1)} agent` : '—'}
            />
          </div>
        </>
      )}

      <div className="card lb-filters">
        <div className="lb-filters-header">
          <div>
            <div className="page-kicker lb-kicker">Quality-aware ranking</div>
            <div className="lb-filter-summary">
              Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> published runs
            </div>
          </div>
          {activeFilterChips.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost lb-reset-btn"
              onClick={() => {
                setMode('overall')
                setSearch('')
                setScope('all')
                setHarnessFilter('all')
                setHardwareFilter(HARDWARE_FILTER_ALL)
                setProviderFilter(PROVIDER_FILTER_ALL)
                setPublisherFilter(PUBLISHER_FILTER_ALL)
                setQualityFloor(60)
                setRemoteFilter('all')
              }}
            >
              Reset filters
            </button>
          )}
          <button
            type="button"
            className={`btn btn-ghost lb-export-btn ${compareMode ? 'lb-compare-active' : ''}`}
            onClick={() => {
              setCompareMode(!compareMode)
              if (compareMode) setCompareIds(new Set())
            }}
            title={compareMode ? 'Exit compare mode' : 'Compare runs side by side'}
          >
            {compareMode ? `✓ Compare (${compareIds.size})` : '⚖ Compare'}
          </button>
          <button
            type="button"
            className="btn btn-ghost lb-export-btn"
            onClick={() => {
              const csv = [
                ['Rank', 'Model', 'Harness', 'Provider', 'Hardware', 'Overall', 'Quality', 'Speed', 'Reliability', 'Agent', 'Tok/s', 'TTFT', 'Remote', 'Submitted'].join(','),
                ...ranked.map((r, i) => [
                  i + 1,
                  `"${r.model}"`,
                  r.harness || 'raw',
                  `"${providerLabel(r)}"`,
                  `"${normalizedHardwareLabel(r)}"`,
                  r.overall_score.toFixed(1),
                  r.quality_score.toFixed(1),
                  r.speed_score.toFixed(1),
                  r.reliability_score.toFixed(1),
                  r.agent_score != null ? r.agent_score.toFixed(1) : '',
                  r.generation_tok_per_sec ? r.generation_tok_per_sec.toFixed(1) : '',
                  r.ttft_ms ? r.ttft_ms.toFixed(0) : '',
                  r.is_remote ? 'yes' : 'no',
                  r.timestamp || '',
                ].join(','))
              ].join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `benchloop-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            ⬇ Export CSV
          </button>
        </div>
        <div className="lb-rank-modes">
          {RANK_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`btn ${mode === m.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '7px 13px', fontSize: '0.78rem' }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="lb-filter-controls">
          <input
            type="search"
            placeholder="Search model, provider, hardware, publisher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="lb-search"
          />
          <select value={harnessFilter} onChange={(e) => setHarnessFilter(e.target.value as HarnessFilter)}>
            {HARNESSES.map((h) => (
              <option key={h} value={h}>{h === 'all' ? 'All harnesses' : `${h} harness`}</option>
            ))}
          </select>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
            <option value={PROVIDER_FILTER_ALL}>All providers</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>
          <select value={hardwareFilter} onChange={(e) => setHardwareFilter(e.target.value)}>
            <option value={HARDWARE_FILTER_ALL}>All hardware</option>
            {hardwareOptions.map((hardware) => (
              <option key={hardware} value={hardware}>{hardware}</option>
            ))}
          </select>
          <select value={publisherFilter} onChange={(e) => setPublisherFilter(e.target.value)}>
            <option value={PUBLISHER_FILTER_ALL}>All publishers</option>
            {publisherOptions.map((publisher) => (
              <option key={publisher} value={publisher}>{publisher}</option>
            ))}
          </select>
          <select value={String(qualityFloor)} onChange={(e) => setQualityFloor(Number(e.target.value))}>
            {QUALITY_FLOORS.map((value) => (
              <option key={value} value={value}>{qualityFloorLabel(value)}</option>
            ))}
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'full' | 'all')}>
            <option value="full">Full benchmarks only</option>
            <option value="all">All scopes</option>
          </select>
          <select value={remoteFilter} onChange={(e) => setRemoteFilter(e.target.value as 'all' | 'local' | 'remote')}>
            <option value="all">All runs</option>
            <option value="local">Local only</option>
            <option value="remote">Remote only</option>
          </select>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="lb-active-filters" aria-label="Active filters">
            {activeFilterChips.map((chip) => (
              <span key={chip} className="lb-filter-chip">{chip}</span>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="card">Loading public runs…</div>}
      {error && <div className="card">Couldn't load runs: {error}</div>}
      {!loading && !error && ranked.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>No runs match this filter.</strong>
          <p style={{ marginTop: 6 }}>
            Try lowering the quality floor or broadening the hardware/provider filters.
          </p>
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <>
        <div className="card lb-card">
          <table className="lb-table">
            <thead>
              <tr>
                {compareMode && <th style={{ width: 36 }}></th>}
                <th>#</th>
                <th>Model</th>
                <th>Harness</th>
                <th>Provider</th>
                <th>Hardware</th>
                <th style={{ textAlign: 'right' }}>Overall</th>
                <th style={{ textAlign: 'right' }}>Quality</th>
                <th style={{ textAlign: 'right' }}>Speed</th>
                <th style={{ textAlign: 'right' }}>Reliab.</th>
                <th style={{ textAlign: 'right' }}>Agent</th>
                <th style={{ textAlign: 'right' }}>Tok/s</th>
                <th style={{ textAlign: 'right' }}>TTFT</th>
                <th style={{ textAlign: 'right' }}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRuns.map((r, i) => {
                const rank = (page - 1) * PAGE_SIZE + i + 1
                const expanded = expandedId === r.id
                const name = publisherName(r)
                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`lb-row-clickable ${compareIds.has(r.id) ? 'lb-row-selected' : ''}`}
                      onClick={() => compareMode ? toggleCompare(r.id) : setExpandedId(expanded ? null : r.id)}
                      title={compareMode ? 'Click to select for comparison' : 'Click for run details'}
                    >
                      {compareMode && (
                        <td className="lb-compare-cell">
                          <input
                            type="checkbox"
                            checked={compareIds.has(r.id)}
                            onChange={() => toggleCompare(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            disabled={compareIds.size >= 4 && !compareIds.has(r.id)}
                          />
                        </td>
                      )}
                      <td className="lb-rank">{rank}</td>
                      <td>
                        <Link to={`/model/${encodeURIComponent(r.model)}`} className="lb-model-link" onClick={(e) => e.stopPropagation()}>
                          <strong>{r.model}</strong>
                        </Link>
                        {name && (
                          <div className="publisher-inline-row">
                            {r.profile_avatar_url ? (
                              <img
                                src={r.profile_avatar_url}
                                alt={name}
                                className="publisher-avatar"
                              />
                            ) : (
                              <span className="publisher-avatar publisher-avatar-fallback">
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            {r.profile_url ? (
                              <a
                                href={r.profile_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {name}
                              </a>
                            ) : (
                              <span>{name}</span>
                            )}
                          </div>
                        )}
                        {r.is_full_benchmark ? <span className="lb-badge full">FULL</span> : <span className="lb-badge partial">PARTIAL</span>}
                        {r.is_agent_only && <span className="lb-badge agent">AGENT</span>}
                        {r.is_remote && <span className="lb-badge remote">☁ REMOTE</span>}
                      </td>
                      <td><code>{r.harness || 'raw'}</code></td>
                      <td>{providerLabel(r)}</td>
                      <td title={`${r.cpu || ''}${r.gpu ? ' / ' + r.gpu : ''}${r.gpu_memory_gb ? ' / ' + r.gpu_memory_gb + 'GB VRAM' : ''}`}>
                        {machineLabel(r)}
                      </td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.overall_score)}`}>{r.overall_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.quality_score)}`}>{r.quality_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`lb-score ${scoreClass(r.speed_score)}`}>{r.speed_score.toFixed(1)}</span>
                        {r.is_remote && r.speed_score > 0 && <span className="lb-speed-cloud" title="Cloud speed score (TTFT + effective tok/s)">☁</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}><span className={`lb-score ${scoreClass(r.reliability_score)}`}>{r.reliability_score.toFixed(1)}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        {r.agent_score != null && r.agent_score >= 0
                          ? <span className={`lb-score ${scoreClass(r.agent_score)}`}>{r.agent_score.toFixed(1)}</span>
                          : <span className="lb-score" style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }} className="lb-score">{r.generation_tok_per_sec ? r.generation_tok_per_sec.toFixed(1) : '—'}</td>
                      <td style={{ textAlign: 'right' }} className="lb-score" title={r.ttft_ms ? `${r.ttft_ms.toFixed(0)} ms time to first token` : ''}>
                        {r.ttft_ms ? `${r.ttft_ms.toFixed(0)}ms` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.75rem' }} title={r.timestamp}>
                        {timeAgo(r.timestamp)} {expanded ? '▴' : '▾'}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="lb-details-row">
                        <td colSpan={compareMode ? 14 : 13}>
                          <div className="lb-details-grid">
                            <Detail label="Run ID" value={r.run_id || r.id} mono />
                            <Detail label="Published by" value={publisherLabel(r)} />
                            <Detail label="Profile" value={r.profile_url || '—'} mono />
                            <Detail label="Posted by / Machine" value={machineLabel(r)} />
                            <Detail label="Machine ID" value={r.machine_id || '—'} mono />
                            <Detail label="Provider" value={providerLabel(r)} />
                            <Detail label="Harness" value={r.harness || 'raw'} mono />
                            <Detail label="Command" value={r.command_used || '—'} mono />
                            <Detail label="Scope" value={r.is_full_benchmark ? 'Full benchmark' : 'Partial / smoke run'} />
                            <Detail label="Endpoint" value={r.endpoint || (r.is_remote ? 'remote endpoint' : 'local default')} mono />
                            <Detail label="Remote" value={r.is_remote ? `yes${r.remote_host ? ` (${r.remote_host})` : ''}` : 'no'} />
                            <Detail label="Hardware label" value={r.hardware_label || 'not stamped'} />
                            <Detail label="GPU/VRAM" value={r.gpu ? `${r.gpu}${r.gpu_memory_gb ? ` / ${r.gpu_memory_gb.toFixed(1)}GB` : ''}` : r.gpu_memory_gb ? `${r.gpu_memory_gb.toFixed(1)}GB VRAM observed in use` : 'not reported'} />
                            <Detail label="Runtime" value={r.total_runtime_sec ? `${r.total_runtime_sec.toFixed(1)}s` : '—'} />
                            <Detail label="Suites" value={suiteSummary(r)} />
                            {r.is_remote && r.ttft_ms && (
                              <Detail label="Time to First Token" value={`${r.ttft_ms.toFixed(0)}ms`} />
                            )}
                            {r.is_remote && r.generation_tok_per_sec && (
                              <Detail label="Effective Tok/s" value={`${r.generation_tok_per_sec.toFixed(1)} tok/s (excluding reasoning)`} />
                            )}
                            {r.is_remote && r.speed_score > 0 && (
                              <Detail label="Cloud Speed Formula" value="60% TTFT + 40% effective tok/s" />
                            )}
                            <Detail label="Submitted" value={r.submitted_at || r.timestamp || '—'} mono />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Comparison panel */}
        {compareMode && compareRuns.length >= 2 && (
          <div className="card lb-compare-panel">
            <div className="lb-compare-header">
              <h3>Comparing {compareRuns.length} runs</h3>
              <button
                className="btn btn-ghost"
                onClick={() => { setCompareIds(new Set()); setCompareMode(false) }}
              >
                ✕ Close
              </button>
            </div>
            <div className="lb-compare-table-wrap">
              <table className="lb-compare-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {compareRuns.map((r) => (
                      <th key={r.id}>
                        <div className="lb-compare-model">{r.model}</div>
                        <div className="lb-compare-meta">{providerLabel(r)} · {machineLabel(r)}</div>
                        <div className="lb-compare-meta">{r.harness || 'raw'} harness</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Overall" runs={compareRuns} get={(r) => r.overall_score} fmt={(v) => v.toFixed(1)} />
                  <CompareRow label="Quality" runs={compareRuns} get={(r) => r.quality_score} fmt={(v) => v.toFixed(1)} />
                  <CompareRow label="Speed" runs={compareRuns} get={(r) => r.speed_score} fmt={(v) => v.toFixed(1)} />
                  <CompareRow label="Reliability" runs={compareRuns} get={(r) => r.reliability_score} fmt={(v) => v.toFixed(1)} />
                  <CompareRow label="Agent" runs={compareRuns} get={(r) => r.agent_score ?? -1} fmt={(v) => v >= 0 ? v.toFixed(1) : '—'} />
                  <CompareRow label="Tok/s" runs={compareRuns} get={(r) => r.generation_tok_per_sec ?? 0} fmt={(v) => v > 0 ? v.toFixed(1) : '—'} />
                  <CompareRow label="TTFT" runs={compareRuns} get={(r) => r.ttft_ms ?? 0} fmt={(v) => v > 0 ? `${v.toFixed(0)}ms` : '—'} lower />
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="lb-pagination">
            <button
              className="btn btn-ghost"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              ← Previous
            </button>
            <div className="lb-page-info">
              Page {page} of {totalPages}
              <span className="lb-page-count">
                ({((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, ranked.length)} of {ranked.length})
              </span>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              Next →
            </button>
          </div>
        )}
        </>
      )}

      <p style={{ marginTop: 24, color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        Hardware shown is what the local CLI detected at run time. Tunneled or remote endpoints may report the orchestrator's hardware rather than the model server's. We keep the quality floor on by default because raw tok/s without useful output is just leaderboard cosplay.
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card stat-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="lb-detail-item">
      <div className="lb-detail-label">{label}</div>
      <div className={mono ? 'lb-detail-value mono' : 'lb-detail-value'}>{value}</div>
    </div>
  )
}

function HighlightCard({ title, subtitle, run, score }: { title: string; subtitle: string; run: PublicRun | null; score: string }) {
  return (
    <div className="card lb-highlight-card">
      <div className="metric-label">{title}</div>
      <div className="lb-highlight-score">{score}</div>
      {run ? (
        <>
          <strong>{run.model}</strong>
          <div className="lb-highlight-meta">{providerLabel(run)} · {machineLabel(run)}</div>
          <div className="lb-highlight-meta">{publisherLabel(run)} · {run.harness || 'raw'} harness</div>
        </>
      ) : (
        <div className="lb-highlight-meta">No matching run yet</div>
      )}
      <p className="lb-highlight-subtitle">{subtitle}</p>
    </div>
  )
}

function CompareRow({
  label,
  runs,
  get,
  fmt,
  lower = false,
}: {
  label: string
  runs: PublicRun[]
  get: (r: PublicRun) => number
  fmt: (v: number) => string
  lower?: boolean
}) {
  const values = runs.map(get).filter((v) => v > 0 || v >= 0)
  const best = lower
    ? Math.min(...values.filter((v) => v > 0))
    : Math.max(...values)
  const isUsable = (v: number) => (lower ? v > 0 : v > 0 || (v === 0 && !lower))

  return (
    <tr>
      <td className="lb-compare-label">{label}</td>
      {runs.map((r) => {
        const v = get(r)
        const isBest = isUsable(v) && v === best
        return (
          <td key={r.id} className={isBest ? 'lb-compare-best' : ''}>
            {fmt(v)}
          </td>
        )
      })}
    </tr>
  )
}
