// Generates parity fixtures for the backend's Snake replay tests.
// Bots play the TypeScript engine through advance() (the same call the game
// loop uses); backend/snake/tests.py replays each log in Python and asserts
// the same result.
//
//   node scripts/gen-snake-fixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type ActionLog,
  type GameState,
  type SnakeDirection,
  type SnakeStatus,
  BOARD,
  DIR,
  INIT_SNAKE,
  OPP,
  POINTS,
  advance,
  createGame,
  tickDelayMs,
} from '../src/games/snake/engine.ts'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/snake/fixtures/parity.json')
const MAX_TICKS = 100_000

type Bot = (game: GameState) => SnakeDirection

function fail(message: string): never {
  throw new Error(message)
}

/** Heads straight for the apple; turns aside instead of reversing. Dies eventually. */
const greedy: Bot = (g) => {
  const [hx, hy] = g.snake[0]
  const [ax, ay] = g.apple ?? [hx, hy]
  let d: SnakeDirection = ax > hx ? 'RIGHT' : ax < hx ? 'LEFT' : ay > hy ? 'DOWN' : 'UP'
  if (d === OPP[g.direction]) d = d === 'LEFT' || d === 'RIGHT' ? 'UP' : 'RIGHT'
  return d
}

/** Never turns: hits the right wall. */
const straight: Bot = (g) => g.direction

/**
 * Follows a Hamiltonian cycle that matches the starting snake: odd rows run
 * right, even rows run left, rows link upward, and column 0 runs down from
 * row 0 back to row 19. It always fills the board, so it always wins.
 */
const cycle: Bot = (g) => {
  const [x, y] = g.snake[0]
  const H = BOARD.height
  if (x === 0) return y === H - 1 ? 'RIGHT' : 'DOWN'
  if (y % 2 === 1) return x === BOARD.width - 1 ? 'UP' : 'RIGHT'
  if (x > 1) return 'LEFT'
  return y === 0 ? 'LEFT' : 'UP'
}

function play(seed: string, bot: Bot, name: string) {
  const game = createGame(seed)
  const actions: ActionLog['actions'] = []
  let minMs = 0
  let lastMove: SnakeDirection = game.direction
  while (game.status === 'ACTIVE') {
    if (game.tick >= MAX_TICKS) fail(`${name} seed ${seed}: ran past MAX_TICKS`)
    minMs += tickDelayMs(game.apples_eaten)
    lastMove = bot(game)
    advance(game, lastMove, actions)

    // Invariants the backend relies on.
    if (game.score !== game.apples_eaten * POINTS) fail('score out of sync with apples')
    if ((game.status as SnakeStatus) !== 'GAME_OVER' && game.snake.length !== INIT_SNAKE.length + game.apples_eaten) {
      fail('snake length out of sync with apples')
    }
    if (game.apple && game.snake.some(([sx, sy]) => sx === game.apple![0] && sy === game.apple![1])) {
      fail('apple spawned on the snake')
    }
  }
  const log: ActionLog = {
    actions,
    total_ticks: game.tick,
    end_reason: game.status === 'WON' ? 'WON' : 'COLLISION',
  }
  return {
    name,
    seed,
    log,
    score: game.score,
    apples_eaten: game.apples_eaten,
    status: game.status,
    min_ms: minMs,
    apple: game.apple,
    head: game.snake[0],
    last_move: lastMove,
    length: game.snake.length,
  }
}

// Seeds include 0 (fallback RNG state), values above 2^32 and above 2^53.
const SEEDS = ['1', '42', '0', '4294967296', '4294967297', '987654321987654321', '9223372036854775807']

const fixtures = [
  ...SEEDS.map((seed) => play(seed, greedy, 'greedy')),
  play('7', straight, 'straight'),
  play('123456789', cycle, 'win'),
]

if (!fixtures.some((f) => f.status === 'WON')) fail('no winning run')
// Greedy never steers into a wall, so its deaths are self-collisions.
for (const f of fixtures.filter((f) => f.name === 'greedy')) {
  const [dx, dy] = DIR[f.last_move]
  const [x, y] = [f.head[0] + dx, f.head[1] + dy]
  if (f.status !== 'GAME_OVER') fail('greedy should die')
  if (x < 0 || x >= BOARD.width || y < 0 || y >= BOARD.height) fail('greedy hit a wall')
}
const wall = fixtures.find((f) => f.name === 'straight')!
if (wall.status !== 'GAME_OVER' || wall.log.total_ticks !== BOARD.width - 5) fail('straight should hit the wall')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(fixtures) + '\n')
for (const f of fixtures) {
  console.log(`${f.name.padEnd(9)} seed ${f.seed.padEnd(20)} ${f.status.padEnd(9)} score ${f.score} ticks ${f.log.total_ticks} actions ${f.log.actions.length}`)
}
