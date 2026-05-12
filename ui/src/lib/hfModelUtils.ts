import type { HFModel, HFModelDetails, HardwareInfo, ProviderInfo } from '../hooks/useApi'

export type FitLevel = 'fits' | 'tight' | 'no' | 'unknown'

export const FIT_META: Record<FitLevel, { label: string; color: string }> = {
  fits: { label: 'Fits your PC', color: 'var(--green)' },
  tight: { label: 'Tight fit', color: 'var(--yellow)' },
  no: { label: 'Too large', color: 'var(--red)' },
  unknown: { label: '', color: 'var(--text-dim)' },
}

export function formatNumber(n?: number | null): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function formatGb(gb?: number | null): string {
  if (!gb) return 'Unknown'
  return `${gb.toFixed(1)} GB`
}

export function getRepoDisplayParts(repoId: string) {
  const parts = repoId.split('/')
  return {
    author: parts[0] || 'Unknown',
    name: parts.slice(1).join('/') || repoId,
  }
}

export function estimateCardSizeGb(model: Pick<HFModel, 'author' | 'name'>): number | null {
  const name = `${model.author}/${model.name}`.toLowerCase()
  const match = name.match(/(\d+(?:\.\d+)?)b/)
  if (!match) return null
  const params = Number(match[1])
  const normalized = name.replace(/[\s.-]+/g, '_')
  const quantMap: Array<[string, number]> = [
    ['q2_k', 2.5], ['iq2_xs', 2.3], ['iq2_s', 2.5], ['iq2_m', 2.7],
    ['q3_k_s', 3.4], ['q3_k_m', 3.6], ['q3_k_l', 3.9], ['iq3_xs', 3.3], ['iq3_s', 3.4],
    ['q4_0', 4.5], ['q4_1', 5.0], ['q4_k_s', 4.5], ['q4_k_m', 4.8], ['iq4_xs', 4.3], ['iq4_nl', 4.5],
    ['q5_0', 5.5], ['q5_1', 6.0], ['q5_k_s', 5.5], ['q5_k_m', 5.7],
    ['q6_k', 6.6], ['q8_0', 8.5], ['fp16', 16], ['bf16', 16],
  ]
  let bpw = 4.8
  for (const [k, v] of quantMap) {
    if (normalized.includes(k)) {
      bpw = v
      break
    }
  }
  return params * bpw / 8 + 0.5
}

export function getCardFit(model: Pick<HFModel, 'author' | 'name'>, usableMemGb: number | null): { level: FitLevel; estGb: number | null } {
  const estGb = estimateCardSizeGb(model)
  if (!estGb || !usableMemGb) return { level: 'unknown', estGb }
  if (estGb <= usableMemGb * 0.7) return { level: 'fits', estGb }
  if (estGb <= usableMemGb * 0.95) return { level: 'tight', estGb }
  return { level: 'no', estGb }
}

export function estimateRequiredVramGb(details: HFModelDetails | null, model: Pick<HFModel, 'author' | 'name'>): number | null {
  const largest = details?.largest_gguf?.size_gb ?? details?.total_gguf_size_gb ?? null
  if (largest) return Math.max(largest * 1.15, 2)

  const name = `${model.author}/${model.name}`.toLowerCase()
  const match = name.match(/(\d+(?:\.\d+)?)b/)
  if (!match) return null
  const params = Number(match[1])
  return Math.max(params * 0.6, 2)
}

export function fitTone(ok: boolean | null): { text: string; color: string } {
  if (ok === true) return { text: 'Should fit', color: 'var(--green)' }
  if (ok === false) return { text: 'Probably too large', color: 'var(--red)' }
  return { text: 'Unknown fit', color: 'var(--yellow)' }
}

export function getLargestKnownFileGb(details: HFModelDetails | null): number | null {
  return details?.largest_gguf?.size_gb ?? details?.total_gguf_size_gb ?? null
}

export function getUsableMemoryGb(hardware: HardwareInfo | null): number | null {
  const availableVramGb = hardware?.gpu?.vram_total_mb ? hardware.gpu.vram_total_mb / 1024 : null
  const availableRamGb = hardware?.memory_total_mb ? hardware.memory_total_mb / 1024 : null
  return availableVramGb || availableRamGb
}

export function hasOllamaProvider(providers?: ProviderInfo[] | null): boolean {
  return providers?.some((p) => p.type === 'ollama') ?? false
}

export function getOllamaEndpoint(providers?: ProviderInfo[] | null): string {
  return providers?.find((p) => p.type === 'ollama')?.url || 'http://localhost:11434'
}

export function getHfPullTarget(repoId: string): string {
  return `hf.co/${repoId}`
}

export function buildGgufSearch(repoId: string, fallbackName?: string): string {
  const { name } = getRepoDisplayParts(repoId)
  return (fallbackName || name).replace(/-gguf$/i, '').replace(/-GGUF$/i, '') + ' GGUF'
}
