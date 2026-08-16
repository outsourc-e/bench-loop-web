import { brandIcons, type BrandName } from '../lib/brand-icons'

type BrandIconProps = {
  brand: BrandName
  size?: number
  label?: boolean
}

export default function BrandIcon({ brand, size = 18, label = false }: BrandIconProps) {
  const icon = brandIcons[brand]
  return (
    <span className={`revamp-brand-icon brand-${brand}`} style={{ width: size, height: size }} title={label ? icon.title : undefined}>
      <svg viewBox="0 0 24 24" width={size} height={size} role={label ? 'img' : undefined} aria-hidden={label ? undefined : true} aria-label={label ? icon.title : undefined}>
        <path d={icon.path} fill="currentColor" />
      </svg>
    </span>
  )
}
