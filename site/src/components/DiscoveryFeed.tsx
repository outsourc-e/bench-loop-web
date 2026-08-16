import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { type FeedItem, type FeedKind } from '../data/discovery'
import { useAuth } from '../context/AuthContext'
import { useDiscoveryFeed } from '../hooks/useDiscoveryFeed'
import { setUpvote } from '../lib/community'
import BrandIcon from './BrandIcon'
import PostComposer from './PostComposer'

type DiscoveryFeedProps = {
  filter?: FeedKind | 'all'
  limit?: number
  composer?: boolean
  authorHandle?: string
}

export default function DiscoveryFeed({ filter = 'all', limit, composer = false, authorHandle }: DiscoveryFeedProps) {
  const { items, loading, error, refresh, isLive } = useDiscoveryFeed(limit || 20)
  const visible = items
    .filter((item) => (filter === 'all' || item.kind === filter) && (!authorHandle || item.authorHandle === authorHandle || item.author === `@${authorHandle}`))
    .slice(0, limit)

  return (
    <div className="revamp-feed">
      {composer && <PostComposer onPublished={refresh} />}
      {error && <div className="feed-mode-note" role="status">Live feed unavailable; showing the polished demo dataset.</div>}
      {isLive && <div className="feed-mode-note is-live"><span className="live-dot" /> Live community data</div>}
      {loading && <div className="feed-skeleton card" aria-label="Loading community posts"><i /><i /><i /></div>}
      {!loading && visible.length === 0 && <div className="revamp-empty card"><h3>The loop is quiet—for now.</h3><p>Be the first builder to publish a result or field note.</p></div>}
      {visible.map((item) => <FeedCard key={item.id} item={item} onChanged={refresh} />)}
    </div>
  )
}

export function FeedCard({ item, onChanged }: { item: FeedItem; onChanged?: () => Promise<void> }) {
  const { configured, user, signInWithGitHub } = useAuth()
  const [reacted, setReacted] = useState(Boolean(item.viewerReacted))
  const [reactionCount, setReactionCount] = useState(item.reactionCount || 0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setReacted(Boolean(item.viewerReacted))
    setReactionCount(item.reactionCount || 0)
  }, [item.reactionCount, item.viewerReacted])

  const toggleUpvote = async () => {
    if (!item.postId) {
      setNotice('This preview becomes interactive when the community backend is live.')
      return
    }
    if (!user) {
      if (!configured) {
        setNotice('Sign-in and reactions turn on with the live backend.')
        return
      }
      await signInWithGitHub()
      return
    }

    const next = !reacted
    setReacted(next)
    setReactionCount((count) => Math.max(0, count + (next ? 1 : -1)))
    try {
      await setUpvote(item.postId, user.id, next)
      await onChanged?.()
    } catch (cause) {
      setReacted(!next)
      setReactionCount((count) => Math.max(0, count + (next ? -1 : 1)))
      setNotice(cause instanceof Error ? cause.message : 'Reaction could not be saved.')
    }
  }

  return (
    <article className={`revamp-feed-card card feed-${item.kind}`}>
      <span className="revamp-feed-accent" aria-hidden="true" />
      <div className="revamp-feed-head">
        <div className="revamp-feed-identity">
          <div className={`revamp-kind kind-${item.kind}`}>{kindIcon(item.kind)} {item.eyebrow}</div>
          {item.brands && (
            <div className="revamp-brand-stack" aria-label="Brands in this item">
              {item.brands.map((brand) => <BrandIcon key={brand} brand={brand} size={15} label />)}
            </div>
          )}
        </div>
        <span>{item.time}</span>
      </div>

      <div className="revamp-feed-core">
        <div className="revamp-feed-copy">
          <Link to={item.href} className="revamp-feed-title"><h3>{item.title}</h3></Link>
          <p>{item.summary}</p>
        </div>
        <CardSignal kind={item.kind} />
      </div>

      {item.metrics && (
        <div className="revamp-feed-metrics">
          {item.metrics.map((metric) => (
            <div key={metric.label} className={metric.accent ? 'is-accent' : ''}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="revamp-tags">
        {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>

      <div className="revamp-feed-foot">
        <div>
          <Link to={item.authorHandle ? `/u/${item.authorHandle}` : item.author === '@eric' ? '/u/eric' : '/builders'}>{item.author}</Link>
          {item.hardware && <span> · {item.hardware}</span>}
        </div>
        <div className="feed-social-actions">
          <button type="button" className={reacted ? 'is-active' : ''} onClick={() => void toggleUpvote()} aria-pressed={reacted}>▲ <span>{reactionCount}</span></button>
          <Link to={item.href}>◌ <span>{item.commentCount || 0}</span></Link>
          <Link to={item.href} className="revamp-feed-action">{item.action} <span>→</span></Link>
        </div>
      </div>
      {notice && <div className="feed-inline-notice" role="status">{notice}</div>}
    </article>
  )
}

function CardSignal({ kind }: { kind: FeedKind }) {
  if (kind === 'run') {
    return (
      <div className="revamp-card-signal signal-run" aria-hidden="true">
        <div className="revamp-signal-top"><span>Relative decode</span><strong>3.0×</strong></div>
        <div className="revamp-signal-bars"><i style={{ '--bar': '28%' } as CSSProperties} /><i style={{ '--bar': '83%' } as CSSProperties} /><i style={{ '--bar': '100%' } as CSSProperties} /></div>
        <div className="revamp-signal-axis"><span>M2</span><span>4090</span><span>peak</span></div>
      </div>
    )
  }

  if (kind === 'recipe') {
    return (
      <div className="revamp-card-signal signal-recipe" aria-hidden="true">
        <div className="revamp-signal-top"><span>Stack status</span><strong>Ready</strong></div>
        <div className="revamp-stack-layers"><i /><i /><i /><i /></div>
        <div className="revamp-stack-labels"><span>weights</span><span>runtime</span><span>MTP</span></div>
      </div>
    )
  }

  if (kind === 'news') {
    return (
      <div className="revamp-card-signal signal-news" aria-hidden="true">
        <div className="revamp-signal-top"><span>Signal velocity</span><strong>+72%</strong></div>
        <div className="revamp-wave-bars">{[30, 52, 38, 72, 46, 88, 66, 100, 74, 86, 58, 70].map((height, index) => <i key={index} style={{ '--wave': `${height}%` } as CSSProperties} />)}</div>
        <div className="revamp-signal-axis"><span>12h</span><span>now</span></div>
      </div>
    )
  }

  return (
    <div className="revamp-card-signal signal-post" aria-hidden="true">
      <div className="revamp-signal-top"><span>Builder graph</span><strong>Active</strong></div>
      <div className="revamp-node-field"><i /><i /><i /><i /><i /></div>
      <div className="revamp-signal-axis"><span>4 new links</span><span>today</span></div>
    </div>
  )
}

function kindIcon(kind: FeedKind) {
  if (kind === 'run') return '◉'
  if (kind === 'recipe') return '⌘'
  if (kind === 'news') return '⌁'
  return '◎'
}
