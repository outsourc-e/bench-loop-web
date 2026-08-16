import { type FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const starterQueries = [
  'Best model for my 4090',
  'Fastest coding setup on M2 Max',
  'Compare MLX vs llama.cpp',
]

type AskBoxProps = {
  initialValue?: string
  compact?: boolean
  disabled?: boolean
  placeholder?: string
  submitLabel?: string
  clearAfterSubmit?: boolean
  onAsk?: (query: string) => void
}

export default function AskBox({
  initialValue = '',
  compact = false,
  disabled = false,
  placeholder = 'Ask about a model, quant, runtime, or your hardware…',
  submitLabel = 'Ask Loop',
  clearAfterSubmit = false,
  onAsk,
}: AskBoxProps) {
  const [query, setQuery] = useState(initialValue)
  const navigate = useNavigate()

  useEffect(() => setQuery(initialValue), [initialValue])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = query.trim()
    if (!next || disabled) return
    if (onAsk) onAsk(next)
    else navigate(`/ask?q=${encodeURIComponent(next)}`)
    if (clearAfterSubmit) setQuery('')
  }

  const ask = (value: string) => {
    setQuery(value)
    if (onAsk) onAsk(value)
    else navigate(`/ask?q=${encodeURIComponent(value)}`)
    if (clearAfterSubmit) setQuery('')
  }

  return (
    <div className={`revamp-ask-shell ${compact ? 'is-compact' : ''}`}>
      <form className="revamp-ask" onSubmit={submit}>
        <span className="revamp-ask-spark" aria-hidden="true">✦</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Ask BenchLoop"
          disabled={disabled}
        />
        <button type="submit" aria-label="Search BenchLoop" disabled={disabled || !query.trim()}>{submitLabel} <span>↗</span></button>
      </form>
      {!compact && (
        <div className="revamp-query-row">
          <span>Try</span>
          {starterQueries.map((item) => (
            <button key={item} type="button" onClick={() => ask(item)}>{item}</button>
          ))}
        </div>
      )}
    </div>
  )
}
