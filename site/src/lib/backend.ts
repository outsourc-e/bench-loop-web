export const apiBaseUrl = (import.meta.env.VITE_API_URL?.trim() || 'https://api.bench-loop.com').replace(/\/$/, '')

export const backendMode = 'cloudflare' as const
export const backendConfigured = Boolean(apiBaseUrl)

export class BackendError extends Error {
  status: number
  code: string

  constructor(status: number, code: string) {
    super(code.replace(/_/g, ' '))
    this.name = 'BackendError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `request_failed_${response.status}`
    throw new BackendError(response.status, code)
  }
  return data as T
}
