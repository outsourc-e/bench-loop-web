import { useEffect, useMemo, useRef, useState } from 'react'
import { useModels, chatGenerate, type ChatMetric } from '../hooks/useApi'

type Message = {
  role: 'user' | 'assistant'
  content: string
  metrics?: ChatMetric
}

const PROVIDERS = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai_compat', label: 'OpenAI-compatible' },
]

const DEFAULT_ENDPOINTS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  openai_compat: 'http://localhost:52415',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: '0.85rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
  display: 'block',
}

export default function ChatTab() {
  const [provider, setProvider] = useState<string>('ollama')
  const [endpoint, setEndpoint] = useState<string>(DEFAULT_ENDPOINTS.ollama)
  const [model, setModel] = useState<string>('')
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState<string>('')
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const { data: modelsData } = useModels(provider === 'ollama' ? endpoint : undefined)

  const localModels = useMemo(() => {
    if (!modelsData?.providers) return [] as string[]
    const all: string[] = []
    for (const p of modelsData.providers) {
      if (provider === 'ollama' && p.type !== 'ollama') continue
      for (const m of p.models || []) all.push(m.name)
    }
    return all
  }, [modelsData, provider])

  useEffect(() => {
    if (!model && localModels.length > 0) setModel(localModels[0])
  }, [localModels, model])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  function onProviderChange(next: string) {
    setProvider(next)
    setEndpoint(DEFAULT_ENDPOINTS[next] || endpoint)
    setModel('')
  }

  async function send() {
    if (!input.trim() || !model || busy) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const res = await chatGenerate({
        model,
        endpoint,
        provider,
        prompt: userMsg.content,
        system: systemPrompt.trim() || undefined,
      })
      setMessages((curr) => [
        ...curr,
        { role: 'assistant', content: res.message.content, metrics: res.metrics },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h3 style={{ color: '#fff', marginBottom: 4 }}>💬 Quick chat</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            Smoke-test a model with live latency, TTFT, and tok/s.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'grid', gap: 10, gridTemplateColumns: '160px 1fr 1fr' }}>
        <div>
          <label style={labelStyle}>Provider</label>
          <select value={provider} onChange={(e) => onProviderChange(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Endpoint</label>
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Model</label>
          {provider === 'ollama' && localModels.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
              {localModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model id" style={{ ...inputStyle, width: '100%' }} />
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>System prompt (optional)</label>
          <input
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful assistant."
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
      </div>

      <div
        ref={logRef}
        className="card"
        style={{ padding: 16, minHeight: 280, maxHeight: 480, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 32 }}>
            No chat yet. Send a message to test the selected model.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {m.role}
            </div>
            <div
              style={{
                background: m.role === 'user' ? 'rgba(100,140,255,0.12)' : 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.content}
            </div>
            {m.metrics && (
              <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                <span>{m.metrics.latencyMs.toFixed(0)} ms</span>
                {m.metrics.ttftMs > 0 && <span>TTFT {m.metrics.ttftMs.toFixed(0)} ms</span>}
                <span>{m.metrics.tokensPerSecond.toFixed(1)} tok/s</span>
                <span>
                  {m.metrics.promptTokens} in / {m.metrics.completionTokens} out
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(220,80,80,0.12)',
            border: '1px solid rgba(220,80,80,0.4)',
            color: '#f99',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 12,
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 12, display: 'flex', gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask the selected model something… (⌘/Ctrl + Enter to send)"
          style={{
            ...inputStyle,
            flex: 1,
            minHeight: 60,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || !model || !input.trim()}
          style={{
            background: busy ? 'var(--bg)' : 'var(--accent, #5a7cff)',
            color: '#fff',
            border: '1px solid var(--border)',
            padding: '0 18px',
            borderRadius: 6,
            cursor: busy || !model || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: busy || !model || !input.trim() ? 0.5 : 1,
          }}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
