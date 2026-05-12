interface Props {
  size?: number
  animated?: boolean
}

/**
 * Loop mark — vector version of the gradient tile logo. Reused in the header
 * and as the hero accent. When `animated`, the arrow chases the loop on a
 * 6s cycle (CSS animation defined in App.css).
 */
export default function LoopLogo({ size = 36, animated = false }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={animated ? 'loop-logo loop-logo-anim' : 'loop-logo'}
    >
      <defs>
        <linearGradient id="bl-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5fe09e" />
          <stop offset="100%" stopColor="#11864b" />
        </linearGradient>
        <radialGradient id="bl-hl" cx="0.3" cy="0.2" r="0.45">
          <stop offset="0%" stopColor="#baf7d4" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#baf7d4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bl-tile)" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#bl-hl)" />
      <path
        d="M44 18 a14 14 0 1 0 14 14"
        fill="none"
        stroke="#04140b"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M44 18 L51 13 M44 18 L51 24"
        stroke="#04140b"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
