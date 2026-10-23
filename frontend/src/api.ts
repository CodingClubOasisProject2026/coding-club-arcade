// Thin fetch wrapper for the Django backend. Auth is Django's session cookie (set by the
// Google sign-in flow), so every unsafe request also needs the CSRF token from the cookie.

function cookie(name: string): string | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function csrfToken() {
  return cookie('csrftoken')
}

function responseErrorMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null
  if (Array.isArray(body)) {
    return body.map(responseErrorMessage).filter(Boolean).join(' ') || null
  }
  if (body && typeof body === 'object') {
    const fields = body as Record<string, unknown>
    if (typeof fields.detail === 'string') return fields.detail
    return Object.values(fields).map(responseErrorMessage).filter(Boolean).join(' ') || null
  }
  return null
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(responseErrorMessage(body) ?? `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    const token = csrfToken()
    if (token) headers['X-CSRFToken'] = token
  }

  const res = await fetch(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export type Me = { authenticated: false } | { authenticated: true; username: string; tickets: number }

export function fetchMe() {
  return api<Me>('/me/')
}

export async function logout() {
  // allauth's logout view takes a CSRF-protected POST and redirects; we just reload after.
  await fetch('/accounts/logout/', {
    method: 'POST',
    headers: { 'X-CSRFToken': csrfToken() ?? '' },
    credentials: 'same-origin',
  })
}

type HubGame = { id: number; name: string; ratio: string }
type Paginated<T> = { results: T[] }

// Falls back to a configured id if /games/ can't be read.
export async function hubGameId(name: string, fallback: number): Promise<number> {
  try {
    const games = await api<Paginated<HubGame>>('/games/')
    return (
      games.results.find(
        (g) => g.name.toUpperCase() === name.toUpperCase()
      )?.id ?? fallback
    )
  } catch {
    return fallback
  }
}

export type HubSession = { id: string; seed: string | number; game: number; user: number }

export function startHubSession(gameId: number) {
  return api<HubSession>(`/sessions/start/${gameId}/`, { method: 'POST', body: {} })
}

export type LeaderboardRow = { username: string; score: number | null }

export function fetchLeaderboard() {
  return api<Paginated<LeaderboardRow>>('/leaderboard/')
}
