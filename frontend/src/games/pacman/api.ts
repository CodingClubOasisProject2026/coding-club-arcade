import { api, hubGameId, startHubSession } from '../../api'
import type { ActionLog } from './engine'

const FALLBACK_GAME_ID = Number(import.meta.env.VITE_PACMAN_GAME_ID ?? 5)

/** Starts a ranked run. Spends one ticket; throws ApiError if signed out or out of tickets. */
export async function startRun() {
  return startHubSession(await hubGameId('PACMAN', FALLBACK_GAME_ID))
}

/** Hands the log to the hub, which queues pacman.tasks.calculate_score. */
export function submitRun(sessionId: string, log: ActionLog) {
  return api(`/sessions/submit/${sessionId}/`, { method: 'PATCH', body: { actions: log } })
}

export type RunStatus = {
  status: 'pending' | 'verified' | 'rejected'
  score: number | null
  reason: string
}

export function runStatus(sessionId: string) {
  return api<RunStatus>(`/pacman/sessions/${sessionId}/`)
}
