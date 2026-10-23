import { api, hubGameId, startHubSession } from '../../api'
import type { ActionLog } from './engine'

const FALLBACK_GAME_ID = 3

/** Starts a ranked run (spends a ticket). Returns the session id and seed. */
export async function startRun() {
  return startHubSession(await hubGameId('SNAKE', FALLBACK_GAME_ID))
}

/** Hands the log to the hub, which queues snake.tasks.calculate_score. */
export function submitRun(sessionId: string, log: ActionLog) {
  return api(`/sessions/submit/${sessionId}/`, { method: 'PATCH', body: { actions: log } })
}

export type RunStatus = {
  status: 'pending' | 'verified'
  score: number | null
}

export function runStatus(sessionId: string) {
  return api<RunStatus>(`/snake/sessions/${sessionId}/`)
}
