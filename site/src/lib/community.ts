import { feedItems, type FeedItem, type FeedKind } from '../data/discovery'
import { supabase } from './supabase'

type ProfileRow = {
  handle: string
  display_name: string
  avatar_url: string | null
}

type PostRow = {
  id: number
  title: string | null
  body: string
  run_id: number | null
  recipe_id: number | null
  created_at: string
  author: ProfileRow | ProfileRow[] | null
}

export type CommentItem = {
  id: number
  body: string
  createdAt: string
  author: ProfileRow
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

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
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

export async function loadFeed(limit = 20, viewerId?: string): Promise<FeedItem[]> {
  if (!supabase) return feedItems.slice(0, limit)

  const { data, error } = await supabase
    .from('posts')
    .select('id, title, body, run_id, recipe_id, created_at, author:profiles!posts_author_id_fkey(handle, display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  const posts = (data || []) as unknown as PostRow[]
  if (!posts.length) return []

  const ids = posts.map((post) => post.id)
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    supabase.from('reactions').select('post_id, user_id, kind').in('post_id', ids),
    supabase.from('comments').select('post_id').in('post_id', ids),
  ])

  return posts.map((post) => {
    const author = one(post.author)
    const kind = postKind(post)
    const postReactions = reactions?.filter((reaction) => reaction.post_id === post.id) || []
    const commentCount = comments?.filter((comment) => comment.post_id === post.id).length || 0
    return {
      id: `post-${post.id}`,
      postId: post.id,
      kind,
      eyebrow: kind === 'run' ? 'Published run' : kind === 'recipe' ? 'Shared recipe' : 'Builder post',
      title: post.title || post.body.slice(0, 96),
      summary: post.body,
      author: `@${author?.handle || 'builder'}`,
      authorHandle: author?.handle || 'builder',
      avatarUrl: author?.avatar_url || null,
      time: relativeTime(post.created_at),
      tags: tagsFrom(post),
      href: `/posts/${post.id}`,
      action: 'Open discussion',
      reactionCount: postReactions.length,
      commentCount,
      viewerReacted: Boolean(viewerId && postReactions.some((reaction) => reaction.user_id === viewerId && reaction.kind === 'upvote')),
    }
  })
}

export async function loadPost(postId: number, viewerId?: string): Promise<FeedItem | null> {
  if (!supabase) return feedItems.find((item) => item.postId === postId) || null
  const { data, error } = await supabase
    .from('posts')
    .select('id, title, body, run_id, recipe_id, created_at, author:profiles!posts_author_id_fkey(handle, display_name, avatar_url)')
    .eq('id', postId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const post = data as unknown as PostRow
  const [{ count: reactionCount }, { count: commentCount }, { data: viewerReaction }] = await Promise.all([
    supabase.from('reactions').select('*', { count: 'exact', head: true }).eq('post_id', postId),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId),
    viewerId
      ? supabase.from('reactions').select('post_id').eq('post_id', postId).eq('user_id', viewerId).eq('kind', 'upvote').maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  const author = one(post.author)
  const kind = postKind(post)
  return {
    id: `post-${post.id}`,
    postId: post.id,
    kind,
    eyebrow: kind === 'run' ? 'Published run' : kind === 'recipe' ? 'Shared recipe' : 'Builder post',
    title: post.title || post.body.slice(0, 96),
    summary: post.body,
    author: `@${author?.handle || 'builder'}`,
    authorHandle: author?.handle || 'builder',
    avatarUrl: author?.avatar_url || null,
    time: relativeTime(post.created_at),
    tags: tagsFrom(post),
    href: `/posts/${post.id}`,
    action: 'Open discussion',
    reactionCount: reactionCount || 0,
    commentCount: commentCount || 0,
    viewerReacted: Boolean(viewerReaction),
  }
}

export async function publishPost(authorId: string, body: string, title?: string) {
  if (!supabase) throw new Error('Publishing requires the live BenchLoop backend.')
  const { error } = await supabase.from('posts').insert({
    author_id: authorId,
    title: title?.trim() || null,
    body: body.trim(),
    visibility: 'public',
  })
  if (error) throw error
}

export async function setUpvote(postId: number, userId: string, active: boolean) {
  if (!supabase) throw new Error('Reactions require the live BenchLoop backend.')
  const query = active
    ? supabase.from('reactions').insert({ post_id: postId, user_id: userId, kind: 'upvote' })
    : supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', userId).eq('kind', 'upvote')
  const { error } = await query
  if (error) throw error
}

export async function loadComments(postId: number): Promise<CommentItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, created_at, author:profiles!comments_author_id_fkey(handle, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data || []) as unknown as Array<{ id: number; body: string; created_at: string; author: ProfileRow | ProfileRow[] }>).map((comment) => ({
    id: comment.id,
    body: comment.body,
    createdAt: relativeTime(comment.created_at),
    author: one(comment.author) || { handle: 'builder', display_name: 'Builder', avatar_url: null },
  }))
}

export async function publishComment(postId: number, authorId: string, body: string) {
  if (!supabase) throw new Error('Comments require the live BenchLoop backend.')
  const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: authorId, body: body.trim() })
  if (error) throw error
}

export async function loadProfile(handle: string, viewerId?: string): Promise<PublicProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name, bio, avatar_url, github_url, x_url, website_url')
    .ilike('handle', handle)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const [runs, recipes, rigs, followers, viewerFollow] = await Promise.all([
    supabase.from('runs').select('*', { count: 'exact', head: true }).eq('owner_id', data.id),
    supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('owner_id', data.id),
    supabase.from('rigs').select('id, name, hardware_label, last_seen_at').eq('owner_id', data.id).order('created_at', { ascending: false }),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id),
    viewerId
      ? supabase.from('follows').select('following_id').eq('follower_id', viewerId).eq('following_id', data.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  return {
    id: data.id,
    handle: data.handle,
    displayName: data.display_name,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    githubUrl: data.github_url,
    xUrl: data.x_url,
    websiteUrl: data.website_url,
    stats: {
      runs: runs.count || 0,
      recipes: recipes.count || 0,
      rigs: rigs.data?.length || 0,
      followers: followers.count || 0,
    },
    rigs: (rigs.data || []).map((rig) => ({
      id: rig.id,
      name: rig.name,
      hardwareLabel: rig.hardware_label,
      status: rig.last_seen_at ? 'connected' : 'saved',
    })),
    viewerFollows: Boolean(viewerFollow.data),
  }
}

export async function setFollowing(followerId: string, followingId: string, active: boolean) {
  if (!supabase) throw new Error('Following requires the live BenchLoop backend.')
  const query = active
    ? supabase.from('follows').insert({ follower_id: followerId, following_id: followingId })
    : supabase.from('follows').delete().eq('follower_id', followerId).eq('following_id', followingId)
  const { error } = await query
  if (error) throw error
}
