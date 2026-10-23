// Port of backend/snake/game_logic.py. The backend replays the recorded log
// with that file to verify the score, so rule changes must be made in both.
// Integers only, no Math.random/Date.

export type SnakeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
export type Cell = [number, number]
export type SnakeStatus = 'ACTIVE' | 'WON' | 'GAME_OVER'

export const BOARD = { width: 20, height: 20 }
export const POINTS = 10

export const BASE_TICK_MS = 150
export const MIN_TICK_MS = 90
export const SPEEDUP_PER_APPLE_MS = 4

export const INIT_DIR: SnakeDirection = 'RIGHT'
export const INIT_SNAKE: Cell[] = [
  [5, 5],
  [4, 5],
  [3, 5],
]

export const DIR: Record<SnakeDirection, Cell> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
}

export const OPP: Record<SnakeDirection, SnakeDirection> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

export type GameState = {
  board: { width: number; height: number }
  snake: Cell[]
  direction: SnakeDirection
  apple: Cell | null
  score: number
  apples_eaten: number
  status: SnakeStatus
  tick: number
  rng: number
}

/** Sent to /sessions/submit/ and replayed by snake.tasks.calculate_score. */
export type ActionLog = {
  actions: { tick: number; direction: SnakeDirection }[]
  total_ticks: number
  end_reason: 'COLLISION' | 'WON' | 'QUIT'
}

/** Map a session seed (may exceed 2^53, so accept strings) to a nonzero uint32. */
export function seedToRng(seed: string | number | bigint): number {
  const value = Number(BigInt(seed) & 0xffffffffn)
  return value === 0 ? 0x6d2b79f5 : value
}

function nextRandom(game: GameState): number {
  let x = game.rng
  x = (x ^ (x << 13)) >>> 0
  x = (x ^ (x >>> 17)) >>> 0
  x = (x ^ (x << 5)) >>> 0
  game.rng = x
  return x
}

export function tickDelayMs(applesEaten: number): number {
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - applesEaten * SPEEDUP_PER_APPLE_MS)
}

function generateApple(game: GameState): Cell | null {
  // Same scan order as the backend: x outer, y inner.
  const occupied = new Set(game.snake.map(([x, y]) => `${x},${y}`))
  const free: Cell[] = []
  for (let x = 0; x < BOARD.width; x += 1) {
    for (let y = 0; y < BOARD.height; y += 1) {
      if (!occupied.has(`${x},${y}`)) free.push([x, y])
    }
  }
  if (free.length === 0) return null
  return free[nextRandom(game) % free.length]
}

export function createGame(seed: string | number | bigint): GameState {
  const game: GameState = {
    board: { ...BOARD },
    snake: INIT_SNAKE.map(([x, y]) => [x, y] as Cell),
    direction: INIT_DIR,
    apple: null,
    score: 0,
    apples_eaten: 0,
    status: 'ACTIVE',
    tick: 0,
    rng: seedToRng(seed),
  }
  game.apple = generateApple(game)
  return game
}

/** Advance one tick in place. Caller must not pass the reverse of game.direction. */
export function step(game: GameState, direction: SnakeDirection): GameState {
  if (game.status !== 'ACTIVE') return game
  game.tick += 1

  const [dx, dy] = DIR[direction]
  const [hx, hy] = game.snake[0]
  const head: Cell = [hx + dx, hy + dy]
  const ate = game.apple !== null && head[0] === game.apple[0] && head[1] === game.apple[1]
  const body = ate ? game.snake : game.snake.slice(0, -1)

  const outOfBounds = head[0] < 0 || head[0] >= BOARD.width || head[1] < 0 || head[1] >= BOARD.height
  if (outOfBounds || body.some(([x, y]) => x === head[0] && y === head[1])) {
    game.status = 'GAME_OVER'
    return game
  }

  game.direction = direction
  game.snake.unshift(head)

  if (ate) {
    game.score += POINTS
    game.apples_eaten += 1
    game.apple = generateApple(game)
    if (game.apple === null) game.status = 'WON'
  } else {
    game.snake.pop()
  }
  return game
}

/** Static board shown before the first run starts. */
export function createPreviewGame(): GameState {
  const game = createGame(1)
  game.apple = [10, 5]
  return game
}
