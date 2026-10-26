import { api, hubGameId, startHubSession } from '../../api'

export type Difficulty = 'beginner' | 'intermediate' | 'expert'
export type Status = 'in_progress' | 'won' | 'lost'
export type MoveType = 'reveal' | 'flag' | 'chord' | 'sonar'
export type PowerUp = 'shield' | 'sonar' | 'extender'
/** Why a lost game ended. */
export type EndReason = 'mine' | 'time' | 'moves'

/** [cell index, adjacent mine count] */
export type Cell = [number, number]
/** [cell index, power-up type] */
export type PowerUpCell = [number, PowerUp]

/** Fields every move can change. */
type LiveState = {
  status: Status
  move_count: number
  flagged: number[]
  mines_left: number
  moves_used: number
  /** null when the game has no move limit. */
  moves_left: number | null
  /** Seconds left when the server answered; null when there is no time limit. */
  time_left: number | null
  shields: number
  sonars: number
  /** Power-ups picked up so far. */
  found: PowerUpCell[]
  /** Mines shown by sonar. */
  detected: number[]
  /** Mines blocked by a shield. */
  defused: number[]
  end_reason: EndReason | null
  // Only present once the game is over.
  mines?: number[]
  exploded?: number[]
  score?: number
  /** Power-ups that were never picked up. */
  powerups?: PowerUpCell[]
}

export type GameState = LiveState & {
  id: string
  width: number
  height: number
  mine_count: number
  time_limit: number | null
  move_limit: number | null
  cells: Cell[]
  startedAt: string | null
  finishedAt: string | null
}

export type MoveResult = LiveState & {
  /** Only the cells opened by this move. */
  cells: Cell[]
  /** Power-ups picked up by this move. */
  picked_up: PowerUpCell[]
  /** Mines a shield blocked on this move. */
  blocked: number[]
  /** Mines newly found by this sonar ping. */
  pinged: number[]
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
