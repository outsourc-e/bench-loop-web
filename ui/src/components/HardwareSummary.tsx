import { useHardware } from '../hooks/useApi'

export default function HardwareSummary() {
  const { data, loading } = useHardware()

  if (loading) return <div className="hw-summary"><span style={{ color: 'var(--text-dim)' }}>Detecting hardware...</span></div>
  if (!data) return null

  return (
    <div className="hw-summary">
      <div className="hw-item">
        <span className="hw-label">GPU</span>
        <span className="hw-value">{data.gpu.model || 'None detected'}</span>
      </div>
      <div className="hw-item">
        <span className="hw-label">CPU</span>
        <span className="hw-value">{data.cpu_model}</span>
      </div>
      <div className="hw-item">
        <span className="hw-label">RAM</span>
        <span className="hw-value">{(data.memory_total_mb / 1024).toFixed(0)} GB</span>
      </div>
      <div className="hw-item">
        <span className="hw-label">OS</span>
        <span className="hw-value">{data.os_name} {data.architecture}</span>
      </div>
    </div>
  )
}
