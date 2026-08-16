import { useCallback, useEffect, useState } from 'react'
import { feedItems, type FeedItem } from '../data/discovery'
import { useAuth } from '../context/AuthContext'
import { loadFeed } from '../lib/community'
import { backendConfigured } from '../lib/backend'

export function useDiscoveryFeed(limit = 20) {
  const { user } = useAuth()
  const [items, setItems] = useState<FeedItem[]>(backendConfigured ? [] : feedItems.slice(0, limit))
  const [loading, setLoading] = useState(backendConfigured)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!backendConfigured) return
    setLoading(true)
    try {
      setItems(await loadFeed(limit, user?.id))
      setError(null)
    } catch (cause) {
      setItems(feedItems.slice(0, limit))
      setError(cause instanceof Error ? cause.message : 'Could not load the live feed.')
    } finally {
      setLoading(false)
    }
  }, [limit, user?.id])

  useEffect(() => { void refresh() }, [refresh])

  return { items, loading, error, refresh, isLive: backendConfigured && !error }
}
