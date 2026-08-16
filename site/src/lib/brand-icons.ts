import { siApple, siDeepseek, siGithub, siGoogle, siMeta, siNvidia, siQwen, siX, type SimpleIcon } from 'simple-icons'

export type BrandName = 'apple' | 'deepseek' | 'github' | 'google' | 'meta' | 'nvidia' | 'qwen' | 'x'

export const brandIcons: Record<BrandName, SimpleIcon> = {
  apple: siApple,
  deepseek: siDeepseek,
  github: siGithub,
  google: siGoogle,
  meta: siMeta,
  nvidia: siNvidia,
  qwen: siQwen,
  x: siX,
}
