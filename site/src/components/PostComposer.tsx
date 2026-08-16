import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { publishPost } from '../lib/community'

export default function PostComposer({ onPublished }: { onPublished: () => Promise<void> }) {
  const { configured, user, profile, signInWithGitHub } = useAuth()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) {
      if (!configured) {
        setNotice('Publishing turns on with the live BenchLoop backend.')
        return
      }
      await signInWithGitHub()
      return
    }
    if (!body.trim()) return

    setBusy(true)
    try {
      await publishPost(user.id, body)
      setBody('')
      setNotice('Published to the loop.')
      await onPublished()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not publish this post.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="post-composer card" onSubmit={(event) => void submit(event)}>
      <div className="post-composer-avatar">
        {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{profile?.displayName.charAt(0) || '↻'}</span>}
      </div>
      <label>
        <span className="sr-only">Share a local AI update</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} rows={2} placeholder="Share a run, recipe, discovery, or question with local AI builders…" />
        <small>{notice || (user ? `Posting as @${profile?.handle || 'builder'}` : 'Sign in to publish and build your lab profile.')}</small>
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy || Boolean(user && !body.trim())}>{busy ? 'Publishing…' : user ? 'Publish' : 'Join the loop'}</button>
    </form>
  )
}
