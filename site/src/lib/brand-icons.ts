import { siApple, siDeepseek, siGoogle, siMeta, siNvidia, siQwen, type SimpleIcon } from 'simple-icons'

export type BrandName = 'apple' | 'deepseek' | 'google' | 'meta' | 'nvidia' | 'qwen'

export const brandIcons: Record<BrandName, SimpleIcon> = {
  apple: siApple,
  deepseek: siDeepseek,
  google: siGoogle,
  meta: siMeta,
  nvidia: siNvidia,
  qwen: siQwen,
}
