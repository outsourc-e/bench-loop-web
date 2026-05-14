import type { PublicRun } from '../hooks/useLeaderboard'

export type RankMode = 'overall' | 'agent' | 'quality' | 'speed' | 'tok_per_sec'

export function scoreOf(run: PublicRun, mode: RankMode): number {
  switch (mode) {
    case 'agent':
      return run.agent_score ?? -1
    case 'quality':
      return run.quality_score
    case 'speed':
      return run.speed_score
    case 'tok_per_sec':
      return run.generation_tok_per_sec
    default:
      return run.overall_score
  }
}

export function endpointPort(endpoint?: string): string {
  if (!endpoint) return ''
  try {
    return new URL(endpoint).port || ''
  } catch {
    return ''
  }
}

export function machineLabel(run: PublicRun): string {
  if (run.hardware_label) return run.hardware_label
  if (run.gpu) return run.gpu
  if (run.cpu && run.system_memory_gb) return `${run.cpu} (${run.system_memory_gb.toFixed(0)}GB RAM)`
  if (run.cpu) return run.cpu

  if (run.is_remote) {
    const port = endpointPort(run.endpoint)
    if (port === '11435') return 'PC1 remote hardware'
    if (port === '11436') return 'Studio remote hardware'
    return `Remote hardware${port ? ` (:${port})` : ''}`
  }

  if (run.machine && run.machine !== 'localhost') return run.machine
  return 'unknown hardware'
}

export function normalizedHardwareLabel(run: PublicRun): string {
  const label = machineLabel(run).trim()
  return label || 'unknown hardware'
}

export function providerLabel(run: PublicRun): string {
  const provider = (run.provider || '').trim()
  if (!provider) return 'unknown provider'
  return provider.replace(/_/g, ' ')
}

export function publisherName(run: PublicRun): string {
  return (run.profile_name || '').trim()
}

export function publisherLabel(run: PublicRun): string {
  return publisherName(run) || 'anonymous'
}

export function hasMeaningfulQuality(run: PublicRun, floor: number): boolean {
  return (run.quality_score || 0) >= floor
}

export function timeAgo(iso?: string): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (isNaN(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function suiteSummary(run: PublicRun): string {
  const names = Object.keys(run.suites || {})
  if (!names.length) return 'No suites recorded'
  return names.join(', ')
}
