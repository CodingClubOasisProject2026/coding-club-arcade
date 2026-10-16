// Thin fetch wrapper for the Django backend.

const CREDENTIALS_KEY = 'arcade.credentials'

export type Credentials = { username: string; token: string }

export function getCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY)
    return raw ? (JSON.parse(raw) as Credentials) : null
  } catch {
    return null
  }
}

export function setCredentials(username: string, password: string): Credentials {
  // The backend has no login endpoint yet, so this sample uses HTTP basic auth.
  const creds = { username, token: btoa(`${username}:${password}`) }
  try {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds))
  } catch {
    // Storage unavailable: credentials only last for this page load.
  }
  return creds
}

export function clearCredentials() {
  try {
    localStorage.removeItem(CREDENTIALS_KEY)
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    const detail = (body as { detail?: string } | null)?.detail
    super(detail ?? `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth) {
    const creds = getCredentials()
    if (creds) headers.Authorization = `Basic ${creds.token}`
  }

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    // Don't send Django session cookies: with them, DRF would demand a CSRF token.
    credentials: 'omit',
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

type HubGame = { id: number; name: string; ratio: string }
type Paginated<T> = { results: T[] }

// /games/ currently 500s (hub.Game.ratio DecimalField), so fall back to a configured id.
export async function hubGameId(name: string, fallback: number): Promise<number> {
  try {
    const games = await api<Paginated<HubGame>>('/games/')
    return games.results.find((g) => g.name === name)?.id ?? fallback
  } catch {
    return fallback
  }
}

export type HubSession = { id: string; seed: number; game: number; user: number }

export function startHubSession(gameId: number) {
  return api<HubSession>(`/sessions/start/${gameId}/`, { method: 'POST', body: {}, auth: true })
}

export type LeaderboardRow = { username: string; score: number | null }

export function fetchLeaderboard() {
  return api<Paginated<LeaderboardRow>>('/leaderboard/')
}
