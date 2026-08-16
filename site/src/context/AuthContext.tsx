import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authClient } from '../lib/auth-client'
import { apiFetch } from '../lib/backend'

export type AuthProviderId = 'github' | 'twitter'

export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
}

export type ViewerProfile = {
  id: string
  handle: string
  displayName: string
  bio: string
  avatarUrl: string | null
  githubUrl: string | null
  xUrl: string | null
  websiteUrl: string | null
  onboardingComplete: boolean
}

type AccountConfig = {
  backend: 'cloudflare'
  configured: boolean
  providers: Record<AuthProviderId, boolean>
}

type AccountResponse = {
  user: AuthUser | null
  profile: ViewerProfile | null
  providers: string[]
}

type AuthContextValue = {
  session: { user: AuthUser } | null
  user: AuthUser | null
  profile: ViewerProfile | null
  loading: boolean
  configured: boolean
  availableProviders: Record<AuthProviderId, boolean>
  linkedProviders: string[]
  signIn: (provider: AuthProviderId, returnTo?: string) => Promise<void>
  signInWithGitHub: (returnTo?: string) => Promise<void>
  signInWithX: (returnTo?: string) => Promise<void>
  linkProvider: (provider: AuthProviderId, returnTo?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const noProviders: Record<AuthProviderId, boolean> = { github: false, twitter: false }

function callbackUrl(returnTo?: string) {
  const current = `${window.location.origin}${window.location.pathname}${window.location.search}`
  return returnTo || current || window.location.origin
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sessionQuery = authClient.useSession()
  const [config, setConfig] = useState<AccountConfig | null>(null)
  const [account, setAccount] = useState<AccountResponse>({ user: null, profile: null, providers: [] })
  const [accountLoading, setAccountLoading] = useState(true)

  useEffect(() => {
    let active = true
    void apiFetch<AccountConfig>('/account/config')
      .then((next) => { if (active) setConfig(next) })
      .catch(() => { if (active) setConfig({ backend: 'cloudflare', configured: false, providers: noProviders }) })
    return () => { active = false }
  }, [])

  const refreshAccount = useCallback(async () => {
    setAccountLoading(true)
    try {
      const next = await apiFetch<AccountResponse>('/account/me')
      setAccount(next)
    } finally {
      setAccountLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionQuery.isPending) return
    if (!sessionQuery.data?.user) {
      setAccount({ user: null, profile: null, providers: [] })
      setAccountLoading(false)
      return
    }
    void refreshAccount().catch(() => {
      setAccount({ user: null, profile: null, providers: [] })
      setAccountLoading(false)
    })
  }, [refreshAccount, sessionQuery.data?.user, sessionQuery.isPending])

  const signIn = useCallback(async (provider: AuthProviderId, returnTo?: string) => {
    if (!config?.configured || !config.providers[provider]) {
      throw new Error(`${provider === 'github' ? 'GitHub' : 'X'} sign-in is not configured yet.`)
    }
    const result = await authClient.signIn.social({ provider, callbackURL: callbackUrl(returnTo) })
    if (result.error) throw new Error(result.error.message || 'Sign-in could not start.')
  }, [config])

  const signInWithGitHub = useCallback((returnTo?: string) => {
    const provider: AuthProviderId = config?.providers.github ? 'github' : 'twitter'
    return signIn(provider, returnTo)
  }, [config, signIn])
  const signInWithX = useCallback((returnTo?: string) => signIn('twitter', returnTo), [signIn])

  const linkProvider = useCallback(async (provider: AuthProviderId, returnTo?: string) => {
    if (!account.user) throw new Error('Sign in before linking another account.')
    if (!config?.providers[provider]) throw new Error(`${provider === 'github' ? 'GitHub' : 'X'} linking is not configured yet.`)
    const result = await authClient.linkSocial({ provider, callbackURL: callbackUrl(returnTo) })
    if (result.error) throw new Error(result.error.message || 'Account linking could not start.')
  }, [account.user, config])

  const signOut = useCallback(async () => {
    const result = await authClient.signOut()
    if (result.error) throw new Error(result.error.message || 'Sign out failed.')
    setAccount({ user: null, profile: null, providers: [] })
    await sessionQuery.refetch()
  }, [sessionQuery])

  const value = useMemo<AuthContextValue>(() => ({
    session: account.user ? { user: account.user } : null,
    user: account.user,
    profile: account.profile,
    loading: sessionQuery.isPending || config === null || accountLoading,
    configured: Boolean(config?.configured && (config.providers.github || config.providers.twitter)),
    availableProviders: config?.providers || noProviders,
    linkedProviders: account.providers,
    signIn,
    signInWithGitHub,
    signInWithX,
    linkProvider,
    signOut,
    refreshAccount,
  }), [
    account,
    accountLoading,
    config,
    linkProvider,
    refreshAccount,
    sessionQuery.isPending,
    signIn,
    signInWithGitHub,
    signInWithX,
    signOut,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
