// Port of backend/snake/game_logic.py. The backend replays the recorded log
// with that file to verify the score, so rule changes must be made in both.
// Integers only, no Math.random/Date.

export type SnakeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
export type Cell = [number, number]
export type SnakeStatus = 'ACTIVE' | 'WON' | 'GAME_OVER'

export const BOARD = { width: 20, height: 20 }
export const POINTS = 10
/** 1 in N apples spawns locked behind a key. */
export const LOCKED_APPLE_CHANCE = 3

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
  apple_locked: boolean
  key: Cell | null
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

/** Pick a free cell (not on the snake or in `blocked`). One RNG call if any is free. */
function generateCell(game: GameState, blocked: (Cell | null)[] = []): Cell | null {
  // Same scan order as the backend: x outer, y inner.
  const occupied = new Set(game.snake.map(([x, y]) => `${x},${y}`))
  for (const cell of blocked) if (cell) occupied.add(`${cell[0]},${cell[1]}`)
  const free: Cell[] = []
  for (let x = 0; x < BOARD.width; x += 1) {
    for (let y = 0; y < BOARD.height; y += 1) {
      if (!occupied.has(`${x},${y}`)) free.push([x, y])
    }
  }
  if (free.length === 0) return null
  return free[nextRandom(game) % free.length]
}

/** Place a new apple (normal or locked, decided by the RNG) and its key if locked. */
function spawnApple(game: GameState): void {
  game.apple = generateCell(game, [])
  if (game.apple === null) {
    game.apple_locked = false
    game.key = null
    return
  }
  const locked = nextRandom(game) % LOCKED_APPLE_CHANCE === 0
  if (locked) {
    game.key = generateCell(game, [game.apple])
    game.apple_locked = game.key !== null
  } else {
    game.apple_locked = false
    game.key = null
  }
}

export function createGame(seed: string | number | bigint): GameState {
  const game: GameState = {
    board: { ...BOARD },
    snake: INIT_SNAKE.map(([x, y]) => [x, y] as Cell),
    direction: INIT_DIR,
    apple: null,
    apple_locked: false,
    key: null,
    score: 0,
    apples_eaten: 0,
    status: 'ACTIVE',
    tick: 0,
    rng: seedToRng(seed),
  }
  spawnApple(game)
  return game
}

/** Advance one tick in place. Caller must not pass the reverse of game.direction. */
export function step(game: GameState, direction: SnakeDirection): GameState {
  if (game.status !== 'ACTIVE') return game
  game.tick += 1

  const [dx, dy] = DIR[direction]
  const [hx, hy] = game.snake[0]
  const head: Cell = [hx + dx, hy + dy]
  const onApple = game.apple !== null && head[0] === game.apple[0] && head[1] === game.apple[1]
  const hitLocked = game.apple_locked && onApple
  const ate = !game.apple_locked && onApple
  const ateKey = game.key !== null && head[0] === game.key[0] && head[1] === game.key[1]
  const body = ate ? game.snake : game.snake.slice(0, -1)

  const outOfBounds = head[0] < 0 || head[0] >= BOARD.width || head[1] < 0 || head[1] >= BOARD.height
  if (outOfBounds || hitLocked || body.some(([x, y]) => x === head[0] && y === head[1])) {
    game.status = 'GAME_OVER'
    return game
  }

  game.direction = direction
  game.snake.unshift(head)

  if (ateKey) {
    game.apple_locked = false
    game.key = null
    game.snake.pop()
  } else if (ate) {
    game.score += POINTS
    game.apples_eaten += 1
    spawnApple(game)
    if (game.apple === null) game.status = 'WON'
  } else {
    game.snake.pop()
  }
  return game
}

/**
 * One game tick as the player sees it: records a direction change in the log
 * (on the tick it takes effect, matching the backend replay), then steps.
 */
export function advance(game: GameState, direction: SnakeDirection, actions: ActionLog['actions']): GameState {
  if (game.status !== 'ACTIVE') return game
  if (direction !== game.direction) actions.push({ tick: game.tick + 1, direction })
  return step(game, direction)
}

/** Static board shown before the first run starts. */
export function createPreviewGame(): GameState {
  const game = createGame(1)
  game.apple = [10, 5]
  game.apple_locked = true
  game.key = [14, 12]
  return game
}

export const MAX_TICKS = 100_000
// Mirrors MIN_REAL_TIME_RATIO in backend/snake/tasks.py.
const MIN_REAL_TIME_RATIO = 0.9

/**
 * Port of replay_actions in backend/snake/game_logic.py plus the timing check in
 * snake.tasks.calculate_score. Lets the UI show the verified score instantly;
 * the backend still re-runs this and is the source of truth.
 * Returns the score, or null if the backend would reject the run.
 */
export function verifyRun(seed: string | number | bigint, log: ActionLog, elapsedMs: number): number | null {
  const { actions, total_ticks: totalTicks, end_reason: endReason } = log
  if (!Number.isInteger(totalTicks) || totalTicks < 0 || totalTicks > MAX_TICKS) return null

  let previousTick = 0
  for (const { tick, direction } of actions) {
    if (!Number.isInteger(tick) || tick < 1 || tick > totalTicks || tick <= previousTick) return null
    if (!(direction in DIR)) return null
    previousTick = tick
  }

  const game = createGame(seed)
  let direction = INIT_DIR
  let actionIndex = 0
  let minMs = 0
  for (let tick = 1; tick <= totalTicks; tick += 1) {
    if (game.status !== 'ACTIVE') return null
    if (actionIndex < actions.length && actions[actionIndex].tick === tick) {
      direction = actions[actionIndex].direction
      actionIndex += 1
    }
    if (direction === OPP[game.direction]) return null
    minMs += tickDelayMs(game.apples_eaten)
    step(game, direction)
  }

  if (endReason === 'COLLISION' && game.status !== 'GAME_OVER') return null
  if (endReason === 'WON' && game.status !== 'WON') return null
  if (endReason === 'QUIT' && game.status !== 'ACTIVE') return null
  if (elapsedMs < minMs * MIN_REAL_TIME_RATIO) return null
  return game.score
}
