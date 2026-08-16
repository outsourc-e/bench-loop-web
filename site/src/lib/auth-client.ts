import { createAuthClient } from 'better-auth/react'
import { apiBaseUrl } from './backend'

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  fetchOptions: {
    credentials: 'include',
  },
})
