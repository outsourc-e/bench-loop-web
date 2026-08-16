import { feedItems, type FeedItem, type FeedKind } from '../data/discovery'
import { apiFetch, BackendError } from './backend'

type PostRow = {
  id: number
  title: string | null
  body: string
  run_id: string | null
  recipe_id: number | null
  created_at: string
  handle: string
  display_name: string
  avatar_url: string | null
  reaction_count: number
  comment_count: number
  viewer_reacted: number
}

type CommentRow = {
  id: number
  body: string
  created_at: string
  handle: string
  display_name: string
  avatar_url: string | null
}

type ProfileRow = {
  id: string
  handle: string
  display_name: string
  bio: string
  avatar_url: string | null
  github_url: string | null
  x_url: string | null
  website_url: string | null
  run_count: number
  recipe_count: number
  rig_count: number
  follower_count: number
  viewer_follows: number
}

type RigRow = {
  id: number
  name: string
  hardware_label: string
  last_seen_at: string | null
}

export type CommentItem = {
  id: number
  body: string
  createdAt: string
  author: {
    handle: string
    display_name: string
    avatar_url: string | null
  }
}

export type PublicProfile = {
  id: string
  handle: string
  displayName: string
  bio: string
  avatarUrl: string | null
  githubUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  stats: { runs: number; recipes: number; rigs: number; followers: number }
  rigs: Array<{ id: number; name: string; hardwareLabel: string; status: string }>
  viewerFollows: boolean
}

function relativeTime(dateValue: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(dateValue).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function postKind(post: PostRow): FeedKind {
  if (post.run_id) return 'run'
  if (post.recipe_id) return 'recipe'
  return 'post'
}

function tagsFrom(post: PostRow) {
  const text = `${post.title || ''} ${post.body}`.toLowerCase()
  return [
    text.includes('qwen') ? 'Qwen' : null,
    text.includes('mlx') ? 'MLX' : null,
    text.includes('llama.cpp') ? 'llama.cpp' : null,
    text.includes('mtp') ? 'MTP' : null,
  ].filter((tag): tag is string => Boolean(tag))
}

function feedItem(post: PostRow): FeedItem {
  const kind = postKind(post)
  return {
    id: `post-${post.id}`,
    postId: post.id,
    kind,
    eyebrow: kind === 'run' ? 'Published run' : kind === 'recipe' ? 'Shared recipe' : 'Builder post',
    title: post.title || post.body.slice(0, 96),
    summary: post.body,
    author: `@${post.handle || 'builder'}`,
    authorHandle: post.handle || 'builder',
    avatarUrl: post.avatar_url,
    time: relativeTime(post.created_at),
    tags: tagsFrom(post),
    href: `/posts/${post.id}`,
    action: 'Open discussion',
    reactionCount: Number(post.reaction_count || 0),
    commentCount: Number(post.comment_count || 0),
    viewerReacted: Number(post.viewer_reacted || 0) === 1,
  }
}

export async function loadFeed(limit = 20, _viewerId?: string): Promise<FeedItem[]> {
  const data = await apiFetch<{ posts: PostRow[] }>(`/community/feed?limit=${Math.max(1, Math.min(50, limit))}`)
  return data.posts.length ? data.posts.map(feedItem) : feedItems.slice(0, limit)
}

export async function loadPost(postId: number, _viewerId?: string): Promise<FeedItem | null> {
  try {
    const data = await apiFetch<{ post: PostRow }>(`/community/posts/${postId}`)
    return feedItem(data.post)
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) return feedItems.find((item) => item.postId === postId) || null
    throw error
  }
}

export async function publishPost(_authorId: string, body: string, title?: string) {
  await apiFetch('/community/posts', {
    method: 'POST',
    body: JSON.stringify({ body: body.trim(), title: title?.trim() || null }),
  })
}

export async function setUpvote(postId: number, _userId: string, active: boolean) {
  await apiFetch(`/community/posts/${postId}/upvote`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  })
}

export async function loadComments(postId: number): Promise<CommentItem[]> {
  const data = await apiFetch<{ comments: CommentRow[] }>(`/community/posts/${postId}/comments`)
  return data.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: relativeTime(comment.created_at),
    author: {
      handle: comment.handle,
      display_name: comment.display_name,
      avatar_url: comment.avatar_url,
    },
  }))
}

export async function publishComment(postId: number, _authorId: string, body: string) {
  await apiFetch(`/community/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: body.trim() }),
  })
}

export async function loadProfile(handle: string, _viewerId?: string): Promise<PublicProfile | null> {
  try {
    const data = await apiFetch<{ profile: ProfileRow; rigs: RigRow[] }>(`/community/profiles/${encodeURIComponent(handle)}`)
    return {
      id: data.profile.id,
      handle: data.profile.handle,
      displayName: data.profile.display_name,
      bio: data.profile.bio,
      avatarUrl: data.profile.avatar_url,
      githubUrl: data.profile.github_url,
      xUrl: data.profile.x_url,
      websiteUrl: data.profile.website_url,
      stats: {
        runs: Number(data.profile.run_count || 0),
        recipes: Number(data.profile.recipe_count || 0),
        rigs: Number(data.profile.rig_count || 0),
        followers: Number(data.profile.follower_count || 0),
      },
      rigs: data.rigs.map((rig) => ({
        id: rig.id,
        name: rig.name,
        hardwareLabel: rig.hardware_label,
        status: rig.last_seen_at ? 'connected' : 'saved',
      })),
      viewerFollows: Number(data.profile.viewer_follows || 0) === 1,
    }
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) return null
    throw error
  }
}

export async function setFollowing(_followerId: string, followingId: string, active: boolean) {
  await apiFetch(`/community/profiles/${encodeURIComponent(followingId)}/follow`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  })
}
