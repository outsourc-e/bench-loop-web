import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

export type ViewerProfile = {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  profile: ViewerProfile | null
  loading: boolean
  configured: boolean
  signInWithGitHub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function metadataProfile(user: User): ViewerProfile {
  const handle = String(user.user_metadata.user_name || user.user_metadata.preferred_username || user.email?.split('@')[0] || 'builder')
  return {
    id: user.id,
    handle,
    displayName: String(user.user_metadata.full_name || user.user_metadata.name || handle),
    avatarUrl: typeof user.user_metadata.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ViewerProfile | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)

  const hydrateProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user || !supabase) {
      setProfile(null)
      return
    }

    const fallback = metadataProfile(nextSession.user)
    const { data } = await supabase
      .from('profiles')
      .select('id, handle, display_name, avatar_url')
      .eq('id', nextSession.user.id)
      .maybeSingle()

    setProfile(data ? {
      id: data.id,
      handle: data.handle,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
    } : fallback)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await hydrateProfile(data.session)
      if (active) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void hydrateProfile(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [hydrateProfile])

  const signInWithGitHub = useCallback(async () => {
    if (!supabase) throw new Error('BenchLoop accounts are not connected in this environment yet.')
    const redirectTo = import.meta.env.VITE_SITE_URL?.trim() || window.location.origin
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    configured: supabaseConfigured,
    signInWithGitHub,
    signOut,
  }), [loading, profile, session, signInWithGitHub, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
