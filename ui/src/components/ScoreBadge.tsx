interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

export default function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const cls = score >= 80 ? 'score-green' : score >= 60 ? 'score-yellow' : 'score-red'
  const fontSize = size === 'lg' ? '1.4rem' : size === 'sm' ? '0.8rem' : '1rem'

  return (
    <span className={`score ${cls}`} style={{ fontSize }}>
      {score.toFixed(1)}
    </span>
  )
}
