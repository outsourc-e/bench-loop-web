import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { approveRunner } from '../lib/runner'

function formatCode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8)
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean
}

export default function ConnectPage() {
  const [params] = useSearchParams()
  const initialCode = useMemo(() => formatCode(params.get('code') || ''), [params])
  const { configured, user, profile, signInWithGitHub } = useAuth()
  const [code, setCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [approvedDevice, setApprovedDevice] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const approve = async (event: FormEvent) => {
    event.preventDefault()
    if (!configured) {
      setNotice('Runner pairing is ready in the product, but the live backend has not been provisioned yet.')
      return
    }
    if (!user) {
      await signInWithGitHub(window.location.href)
      return
    }
    if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
      setNotice('Enter the eight-character code shown by the BenchLoop CLI.')
      return
    }

    setBusy(true)
    try {
      const result = await approveRunner(code)
      setApprovedDevice(result.deviceName)
      setNotice(null)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Runner pairing could not be approved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="connect-page">
      <section className="connect-card card-premium">
        <div className="connect-orbit" aria-hidden="true"><i /><i /><b>↻</b></div>
        <span className="page-kicker">Secure Runner pairing</span>
        {approvedDevice ? (
          <>
            <h1>{approvedDevice} is in your lab.</h1>
            <p>The one-time code has been consumed. Return to the terminal; the Runner will finish storing its scoped credential in your operating-system keychain.</p>
            <div className="connect-success"><span>✓</span><div><strong>Pairing approved</strong><small>Raw model outputs and local endpoints stay on the Runner.</small></div></div>
            <Link to={`/u/${profile?.handle || 'eric'}`} className="btn btn-primary">Open my lab</Link>
          </>
        ) : (
          <>
            <h1>Connect a local lab.</h1>
            <p>Confirm the short code displayed by <code>benchloop auth login</code>. BenchLoop will issue this machine a revocable Runner-only token.</p>
            <form onSubmit={(event) => void approve(event)}>
              <label htmlFor="runner-code">Pairing code</label>
              <input id="runner-code" value={code} onChange={(event) => setCode(formatCode(event.target.value))} placeholder="ABCD-EFGH" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} />
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Approving…' : user ? 'Approve this Runner' : 'Sign in with GitHub to approve'}</button>
            </form>
            <div className="connect-identity">
              <span>{user ? `Approving as @${profile?.handle || 'builder'}` : 'No account session yet'}</span>
              <small>Codes expire after 10 minutes and can be used once.</small>
            </div>
            {notice && <div className="connect-notice" role="status">{notice}</div>}
          </>
        )}
      </section>
      <aside className="connect-safety card">
        <span className="revamp-section-kicker">What gets shared</span>
        <h2>Public receipts, private machine details.</h2>
        <div><b>Included</b><p>Model, quant, hardware label, benchmark versions, aggregate scores, task pass/fail, and performance telemetry.</p></div>
        <div><b>Removed locally</b><p>Endpoint URLs, host IDs, Tailscale names, launch paths, raw model output, and task metadata.</p></div>
        <div><b>Your control</b><p>Every publish is explicit. Choose public or private and revoke a Runner at any time.</p></div>
      </aside>
    </div>
  )
}
