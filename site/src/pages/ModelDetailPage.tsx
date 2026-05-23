import { useParams, Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useLeaderboard } from '../hooks/useLeaderboard'

function scoreClass(score: number): string {
  return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red'
}

export default function ModelDetailPage() {
  const { modelName } = useParams<{ modelName: string }>()
  const { runs, loading, error } = useLeaderboard()
  const decodedName = modelName ? decodeURIComponent(modelName) : ''

  const modelRuns = useMemo(() => {
    if (!runs || !decodedName) return []
    return runs.filter(r => r.model.toLowerCase() === decodedName.toLowerCase())
      .sort((a, b) => b.overall_score - a.overall_score)
  }, [runs, decodedName])

  const stats = useMemo(() => {
    if (modelRuns.length === 0) return null
    const best = modelRuns[0]
    const avgOverall = modelRuns.reduce((sum, r) => sum + r.overall_score, 0) / modelRuns.length
    const avgQuality = modelRuns.reduce((sum, r) => sum + r.quality_score, 0) / modelRuns.length
    const uniqueHardware = new Set(modelRuns.map(r => r.machine)).size
    const remoteCount = modelRuns.filter(r => r.is_remote).length
    return { best, avgOverall, avgQuality, uniqueHardware, remoteCount, total: modelRuns.length }
  }, [modelRuns])

  if (loading) return <div className="page-container"><div className="card">Loading…</div></div>
  if (error) return <div className="page-container"><div className="card">Error: {error}</div></div>

  if (!decodedName) {
    return (
      <div className="page-container">
        <h1>Model Not Found</h1>
        <p>Please select a model from the <Link to="/leaderboard">leaderboard</Link>.</p>
      </div>
    )
  }

  if (modelRuns.length === 0) {
    return (
      <div className="page-container">
        <h1>No Runs for {decodedName}</h1>
        <p>No benchmark runs found for this model. <Link to="/leaderboard">Back to leaderboard</Link></p>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <Link to="/leaderboard" className="back-link">← Back to Leaderboard</Link>
        <h1>{decodedName}</h1>
        <p className="page-subtitle">{stats?.total} runs across {stats?.uniqueHardware} hardware configurations</p>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Best Overall</div>
            <div className={`stat-value ${scoreClass(stats.best.overall_score)}`}>
              {stats.best.overall_score.toFixed(1)}
            </div>
            <div className="stat-detail">{stats.best.machine}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Average Overall</div>
            <div className={`stat-value ${scoreClass(stats.avgOverall)}`}>
              {stats.avgOverall.toFixed(1)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Average Quality</div>
            <div className={`stat-value ${scoreClass(stats.avgQuality)}`}>
              {stats.avgQuality.toFixed(1)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Remote Runs</div>
            <div className="stat-value">{stats.remoteCount}</div>
            <div className="stat-detail">of {stats.total} total</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>All Runs</h2>
        <div className="table-responsive">
          <table className="lb-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Hardware</th>
                <th>Provider</th>
                <th>Harness</th>
                <th style={{ textAlign: 'right' }}>Overall</th>
                <th style={{ textAlign: 'right' }}>Quality</th>
                <th style={{ textAlign: 'right' }}>Speed</th>
                <th style={{ textAlign: 'right' }}>Tok/s</th>
                <th style={{ textAlign: 'right' }}>TTFT</th>
                <th style={{ textAlign: 'right' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {modelRuns.map((run, i) => (
                <tr key={run.id}>
                  <td className="lb-rank">{i + 1}</td>
                  <td>
                    <div>{run.machine}</div>
                    {run.is_remote && <span className="lb-badge remote">☁ REMOTE</span>}
                  </td>
                  <td>{run.provider || 'ollama'}</td>
                  <td><code>{run.harness}</code></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`lb-score ${scoreClass(run.overall_score)}`}>
                      {run.overall_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`lb-score ${scoreClass(run.quality_score)}`}>
                      {run.quality_score.toFixed(1)}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={`lb-score ${scoreClass(run.speed_score)}`}>
                      {run.speed_score.toFixed(1)}
                    </span>
                    {run.is_remote && run.speed_score > 0 && (
                      <span className="lb-speed-cloud" title="Cloud speed score (TTFT + effective tok/s)">☁</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {run.generation_tok_per_sec ? `${run.generation_tok_per_sec.toFixed(1)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {run.ttft_ms ? `${run.ttft_ms.toFixed(0)}ms` : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {run.timestamp ? new Date(run.timestamp).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
