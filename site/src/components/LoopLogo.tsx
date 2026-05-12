interface Props {
  size?: number
  animated?: boolean
}

/**
 * BenchLoop brand mark.
 *
 * Uses the rendered pixel-chip PNG at /logo.png (sourced from Eric's logo
 * asset). We keep the prop API identical to the previous SVG component so
 * callers don't need to change.
 */
export default function LoopLogo({ size = 36, animated = false }: Props) {
  return (
    <img
      src="/logo.png"
      alt="BenchLoop"
      width={size}
      height={size}
      className={animated ? 'loop-logo loop-logo-anim' : 'loop-logo'}
      style={{ display: 'block', borderRadius: Math.max(4, Math.round(size * 0.18)) }}
      draggable={false}
    />
  )
}
