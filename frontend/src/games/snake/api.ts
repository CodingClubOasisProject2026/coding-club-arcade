import { api, hubGameId, startHubSession } from '../../api'

const FALLBACK_GAME_ID = 3

export type SnakeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

export type SnakeGameState = {
  session_id: string
  board: { width: number; height: number }
  snake: [number, number][]
  direction: SnakeDirection
  apple: [number, number] | null
  score: number
  apples_eaten: number
  status: 'ACTIVE' | 'WON' | 'GAME_OVER' | 'QUIT'
  game_over: boolean
}

export type SnakeEndResult = {
  session_id: string
  score: number
  game_over: boolean
  actions: {
    initial_direction: SnakeDirection
    actions: { tick: number; direction: SnakeDirection }[]
    total_ticks: number
    end_reason: string
  }
}

export async function createSnakeSession(): Promise<string> {
  const session = await startHubSession(await hubGameId('SNAKE', FALLBACK_GAME_ID))
  return session.id
}

export async function startSnakeGame(sessionId: string): Promise<SnakeGameState> {
  return api<SnakeGameState>('/snake/start/', {
    method: 'POST',
    body: { session_id: sessionId },
  })
}

export async function moveSnake(sessionId: string, action: SnakeDirection): Promise<SnakeGameState> {
  return api<SnakeGameState>(`/snake/session/${sessionId}/move/`, {
    method: 'POST',
    body: { action },
  })
}

export async function endSnakeGame(sessionId: string): Promise<SnakeEndResult> {
  return api<SnakeEndResult>(`/snake/session/${sessionId}/end/`, {
    method: 'POST',
  })
}
