import { useRuns } from '../hooks/useApi'
import ScoreBadge from '../components/ScoreBadge'

export default function LeaderboardTab() {
  const { runs, loading } = useRuns()

  const bestByModel = new Map<string, typeof runs[0]>()
  for (const run of runs) {
    const existing = bestByModel.get(run.model)
    if (!existing || run.overall_score > existing.overall_score) {
      bestByModel.set(run.model, run)
    }
  }
  const ranked = [...bestByModel.values()].sort((a, b) => b.overall_score - a.overall_score)

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24, padding: '24px 0' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏆</div>
        <h3 style={{ color: '#fff', marginBottom: 4 }}>Leaderboard</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          Community comparisons coming soon — showing your local results for now
        </p>
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', textAlign: 'center' }}>Loading...</div>}

      {!loading && ranked.length === 0 && (
        <div className="empty-state">
          <h3>No benchmark data yet</h3>
          <p>Run some benchmarks to see your models compared here.</p>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                <th style={{ textAlign: 'center', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600, width: 40 }}>#</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Model</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Overall</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Quality</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Speed</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-dim)', fontWeight: 600 }}>Reliability</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((run, i) => (
                <tr key={run.model} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ textAlign: 'center', padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--text-dim)' }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{run.model}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <ScoreBadge score={run.overall_score} size="sm" />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <ScoreBadge score={run.quality_score} size="sm" />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <ScoreBadge score={run.speed_score} size="sm" />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <ScoreBadge score={run.reliability_score} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
