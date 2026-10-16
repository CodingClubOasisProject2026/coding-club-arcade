import { api, hubGameId, startHubSession } from '../../api'

export type Difficulty = 'beginner' | 'intermediate' | 'expert'
export type Status = 'in_progress' | 'won' | 'lost'
export type MoveType = 'reveal' | 'flag' | 'chord'

/** [cell index, adjacent mine count] */
export type Cell = [number, number]

export type GameState = {
  id: string
  width: number
  height: number
  mine_count: number
  status: Status
  move_count: number
  cells: Cell[]
  flagged: number[]
  mines_left: number
  startedAt: string | null
  finishedAt: string | null
  // Only present once the game is over.
  mines?: number[]
  exploded?: number[]
  score?: number
}

export type MoveResult = {
  status: Status
  move_count: number
  /** Only the cells opened by this move. */
  cells: Cell[]
  flagged: number[]
  mines_left: number
  mines?: number[]
  exploded?: number[]
  score?: number
}

const FALLBACK_GAME_ID = Number(import.meta.env.VITE_MINESWEEPER_GAME_ID ?? 1)

export async function newGame(difficulty: Difficulty): Promise<GameState> {
  const session = await startHubSession(await hubGameId('MINESWEEPER', FALLBACK_GAME_ID))
  return api<GameState>(`/minesweeper/${session.id}/start/`, { method: 'POST', body: { difficulty } })
}

export function getGame(id: string) {
  return api<GameState>(`/minesweeper/${id}/`)
}

export function playMove(id: string, no: number, type: MoveType, index: number, width: number) {
  return api<MoveResult>(`/minesweeper/${id}/move/`, {
    method: 'POST',
    body: { row: Math.floor(index / width), column: index % width, type, no },
  })
}
