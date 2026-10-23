import { api, csrfToken, hubGameId, startHubSession } from '../../api'
import type { ActionLog } from './engine'

const FALLBACK_GAME_ID = 6

/** Starts a ranked run (spends a ticket). Returns the session id and seed. */
export async function startRun() {
  return startHubSession(await hubGameId('FLAPPY_BIRD', FALLBACK_GAME_ID))
}

/** Hands the log to the hub, which queues flappy_bird.tasks.calculate_score. */
export function submitRun(sessionId: string, log: ActionLog) {
  return api(`/sessions/submit/${sessionId}/`, { method: 'PATCH', body: { actions: log } })
}

/** Submit a log while the page is being unloaded, so the run still counts. */
export function submitRunKeepalive(sessionId: string, log: ActionLog) {
  return fetch(`/sessions/submit/${sessionId}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CSRFToken': csrfToken() ?? '',
    },
    body: JSON.stringify({ actions: log }),
    credentials: 'same-origin',
    keepalive: true,
  })
}
