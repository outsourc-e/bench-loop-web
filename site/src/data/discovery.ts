import type { BrandName } from '../lib/brand-icons'

export type FeedKind = 'run' | 'recipe' | 'news' | 'post'

export type FeedItem = {
  id: string
  kind: FeedKind
  eyebrow: string
  title: string
  summary: string
  author: string
  time: string
  tags: string[]
  metrics?: Array<{ label: string; value: string; accent?: boolean }>
  href: string
  action: string
  hardware?: string
  brands?: BrandName[]
  postId?: number
  authorHandle?: string
  avatarUrl?: string | null
  reactionCount?: number
  commentCount?: number
  viewerReacted?: boolean
}

export const hardwareProfiles = [
  { label: 'M2 Max', detail: '96 GB unified memory', status: 'connected', brand: 'apple' as const },
  { label: 'RTX 4090', detail: '24 GB VRAM · 64 GB RAM', status: 'remote', brand: 'nvidia' as const },
]

export const feedItems: FeedItem[] = [
  {
    id: 'qwen38-dual-rig',
    kind: 'run',
    eyebrow: 'Verified comparison',
    title: 'Qwen3.8-27B: M2 Max vs RTX 4090',
    summary: 'Same model family, two optimized runtimes. The 4090 wins raw decode; MLX turns the Mac into the quieter high-memory daily driver.',
    author: '@eric',
    time: '12 min ago',
    tags: ['Qwen3.8', 'MTP', 'MLX', 'llama.cpp'],
    metrics: [
      { label: 'M2 Max steady', value: '26.3 tok/s' },
      { label: 'RTX 4090 steady', value: '79.3 tok/s', accent: true },
      { label: '4090 peak', value: '97 tok/s' },
    ],
    href: '/ask?q=Compare+our+M2+Max+and+RTX+4090+Qwen3.8+runs',
    action: 'Open comparison',
    hardware: '2 rigs · 7 suites',
    brands: ['qwen', 'apple', 'nvidia'],
  },
  {
    id: 'qwen38-4090-mtp4',
    kind: 'recipe',
    eyebrow: 'Reproducible recipe',
    title: 'Single-4090 Qwen3.8 with native MTP',
    summary: 'Unsloth UD-Q4_K_XL, full CUDA offload, Flash Attention, quantized KV cache, and native MTP draft depth tuned for fresh-prompt throughput.',
    author: '@eric',
    time: '28 min ago',
    tags: ['RTX 4090', 'UD-Q4_K_XL', 'MTP4'],
    metrics: [
      { label: 'VRAM', value: '~22.8 GB' },
      { label: 'Quality', value: '68.4' },
      { label: 'Coding', value: '93.8', accent: true },
    ],
    href: '/recipes/qwen38-4090-mtp4',
    action: 'Copy recipe',
    hardware: 'RTX 4090 · llama.cpp',
    brands: ['qwen', 'nvidia'],
  },
  {
    id: 'mtp-native-integration',
    kind: 'news',
    eyebrow: 'Local AI signal',
    title: 'Native MTP integration is separating real gains from flag theater',
    summary: 'Community runs show speculation helps when the runtime integrates the model head efficiently. Bolted-on draft paths can lose to plain decoding once acceptance and overhead are counted.',
    author: 'BenchLoop signal desk',
    time: '1 hr ago',
    tags: ['MTP', 'Speculative decoding', 'MLX'],
    href: '/news',
    action: 'Read signal',
    brands: ['qwen'],
  },
  {
    id: 'm2-oQ4e',
    kind: 'run',
    eyebrow: 'Mac run',
    title: 'M2 Max 96 GB lands a practical Qwen3.8 daily driver',
    summary: 'An oQ4e MLX build with a two-token MTP path kept strong coding behavior while nearly doubling the original BF16 experience.',
    author: '@eric',
    time: '2 hr ago',
    tags: ['Apple Silicon', 'oQ4e', 'MTP2'],
    metrics: [
      { label: 'Decode', value: '26.3 tok/s', accent: true },
      { label: 'Quality', value: '76.5' },
      { label: 'Agent', value: '100' },
    ],
    href: '/ask?q=Show+me+the+best+Qwen3.8+recipe+for+M2+Max+96GB',
    action: 'Inspect run',
    hardware: 'M2 Max · 96 GB',
    brands: ['qwen', 'apple'],
  },
  {
    id: 'builder-pocket-ai',
    kind: 'post',
    eyebrow: 'Builder update',
    title: 'PocketAiHub publishes a new MLX Qwen3.8 track',
    summary: 'A fresh quant family gives Mac builders another speed-versus-fidelity point to reproduce under one protocol instead of comparing screenshots.',
    author: '@PocketAiHub',
    time: '3 hr ago',
    tags: ['Builder', 'MLX', 'Quantization'],
    href: '/builders',
    action: 'View builder',
    brands: ['qwen'],
  },
]

export const trendItems = [
  { label: 'Qwen3.8-27B', delta: '+184%', detail: '86 new runs' },
  { label: 'Native MTP', delta: '+72%', detail: '31 recipes' },
  { label: 'Apple MLX', delta: '+41%', detail: '58 builders' },
  { label: '4090 local agents', delta: '+29%', detail: '24 stacks' },
]

export const sourceLabels = [
  'Verified BenchLoop runs',
  'Reproducible recipes',
  'Official model cards',
  'Runtime release notes',
  'Builder reports',
]
