interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'plain' | 'pill'
}

export default function ScoreBadge({ score, size = 'md', variant = 'plain' }: ScoreBadgeProps) {
  const cls = score >= 80 ? 'score-green' : score >= 60 ? 'score-yellow' : 'score-red'
  const fontSize = size === 'lg' ? '1.45rem' : size === 'sm' ? '0.8rem' : '1rem'

  if (variant === 'pill') {
    const tone = score >= 80
      ? 'rgba(45, 212, 127, 0.16)'
      : score >= 60
        ? 'rgba(246, 193, 67, 0.14)'
        : 'rgba(239, 68, 68, 0.14)'
    const border = score >= 80
      ? 'rgba(45, 212, 127, 0.34)'
      : score >= 60
        ? 'rgba(246, 193, 67, 0.30)'
        : 'rgba(239, 68, 68, 0.30)'

    return (
      <span
        className={`score ${cls}`}
        style={{
          fontSize,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: size === 'lg' ? 72 : 54,
          padding: size === 'lg' ? '6px 12px' : '3px 8px',
          borderRadius: 999,
          background: tone,
          border: `1px solid ${border}`,
        }}
      >
        {score.toFixed(1)}
      </span>
    )
  }

  return (
    <span className={`score ${cls}`} style={{ fontSize }}>
      {score.toFixed(1)}
    </span>
  )
}
