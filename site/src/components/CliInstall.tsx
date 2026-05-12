import { useState } from 'react'

const command = 'pipx install benchloop-cli && benchloop run --model qwen3:8b'

export default function CliInstall() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore — old browsers */
    }
  }

  return (
    <div className="cli-card">
      <div className="cli-code">
        <span className="prompt">$</span>
        {command}
      </div>
      <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
