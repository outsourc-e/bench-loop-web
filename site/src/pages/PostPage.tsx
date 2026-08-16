import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadComments, loadPost, publishComment, type CommentItem } from '../lib/community'
import type { FeedItem } from '../data/discovery'

export default function PostPage() {
  const { postId: rawPostId } = useParams()
  const postId = Number(rawPostId)
  const { configured, user, profile, signInWithGitHub } = useAuth()
  const [post, setPost] = useState<FeedItem | null>(null)
  const [comments, setComments] = useState<CommentItem[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!Number.isInteger(postId) || postId < 1) {
      setLoading(false)
      return
    }
    try {
      const [nextPost, nextComments] = await Promise.all([loadPost(postId, user?.id), loadComments(postId)])
      setPost(nextPost)
      setComments(nextComments)
      setNotice(null)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'This discussion could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [postId, user?.id])

  useEffect(() => { void refresh() }, [refresh])

  const submitComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) {
      if (!configured) {
        setNotice('Comments turn on with the live BenchLoop backend.')
        return
      }
      await signInWithGitHub()
      return
    }
    if (!body.trim()) return
    try {
      await publishComment(postId, user.id, body)
      setBody('')
      await refresh()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Your comment could not be published.')
    }
  }

  if (loading) return <section className="post-thread card-premium"><span className="page-kicker">Loading loop</span></section>
  if (!post) {
    return (
      <section className="revamp-empty card-premium">
        <span className="page-kicker">Discussion</span>
        <h1>This post is not available.</h1>
        <p>{notice || 'The visual prototype remains available in the main discovery feed.'}</p>
        <Link to="/explore" className="btn btn-primary">Back to Explore</Link>
      </section>
    )
  }

  return (
    <div className="post-thread">
      <Link to="/explore" className="thread-back">← Back to Explore</Link>
      <article className="thread-post card-premium">
        <div className="revamp-kind kind-post">◎ {post.eyebrow}</div>
        <h1>{post.title}</h1>
        <p>{post.summary}</p>
        <div className="thread-byline"><Link to={`/u/${post.authorHandle}`}>{post.author}</Link><span>{post.time}</span><b>▲ {post.reactionCount || 0}</b><b>◌ {post.commentCount || 0}</b></div>
      </article>

      <section className="thread-comments">
        <div className="revamp-section-head"><div><span className="revamp-section-kicker">Community notes</span><h2>{comments.length} {comments.length === 1 ? 'reply' : 'replies'}</h2></div></div>
        <form className="thread-reply card" onSubmit={(event) => void submitComment(event)}>
          <strong>{user ? `Reply as @${profile?.handle || 'builder'}` : 'Join the discussion'}</strong>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={4000} placeholder="Add evidence, a reproduction result, or a useful question…" />
          <div><small>{notice || 'Keep claims reproducible and attach a run when possible.'}</small><button type="submit" className="btn btn-primary" disabled={Boolean(user && !body.trim())}>{user ? 'Reply' : 'Sign in to reply'}</button></div>
        </form>
        <div className="thread-comment-list">
          {comments.map((comment) => (
            <article key={comment.id} className="thread-comment card">
              <div className="thread-comment-author">
                {comment.author.avatar_url ? <img src={comment.author.avatar_url} alt="" /> : <span>{comment.author.display_name.charAt(0)}</span>}
                <div><Link to={`/u/${comment.author.handle}`}>@{comment.author.handle}</Link><small>{comment.createdAt}</small></div>
              </div>
              <p>{comment.body}</p>
            </article>
          ))}
          {!comments.length && <div className="revamp-empty card"><p>No replies yet. Add the first useful data point.</p></div>}
        </div>
      </section>
    </div>
  )
}
