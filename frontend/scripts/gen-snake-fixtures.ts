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

/**
 * Heads for the key while the apple is locked, else for the apple; turns aside
 * instead of reversing or stepping onto the locked apple. Dies eventually.
 */
const greedy: Bot = (g) => {
  const [hx, hy] = g.snake[0]
  const target = (g.apple_locked ? g.key : g.apple) ?? g.apple ?? [hx, hy]
  const [tx, ty] = target
  const first: SnakeDirection = tx > hx ? 'RIGHT' : tx < hx ? 'LEFT' : ty > hy ? 'DOWN' : 'UP'
  const order: SnakeDirection[] = [first, 'UP', 'RIGHT', 'DOWN', 'LEFT']
  const blocksLocked = (d: SnakeDirection) =>
    g.apple_locked && g.apple !== null && hx + DIR[d][0] === g.apple[0] && hy + DIR[d][1] === g.apple[1]
  return order.find((d) => d !== OPP[g.direction] && !blocksLocked(d)) ?? first
}

/** Never turns: hits the right wall. */
const straight: Bot = (g) => g.direction

/**
 * Follows a Hamiltonian cycle that matches the starting snake: odd rows run
 * right, even rows run left, rows link upward, and column 0 runs down from
 * row 0 back to row 19. It ignores the key, so with locked apples it dies by
 * running into a locked apple (a WON run would need a smarter bot).
 */
const cycle: Bot = (g) => {
  const [x, y] = g.snake[0]
  const H = BOARD.height
  if (x === 0) return y === H - 1 ? 'RIGHT' : 'DOWN'
  if (y % 2 === 1) return x === BOARD.width - 1 ? 'UP' : 'RIGHT'
  if (x > 1) return 'LEFT'
  return y === 0 ? 'LEFT' : 'UP'
}

const spawns = { locked: 0, normal: 0 }

function play(seed: string, bot: Bot, name: string) {
  const game = createGame(seed)
  const actions: ActionLog['actions'] = []
  let minMs = 0
  let lastMove: SnakeDirection = game.direction
  const countSpawn = () => {
    if (game.apple) spawns[game.apple_locked ? 'locked' : 'normal'] += 1
  }
  countSpawn()
  while (game.status === 'ACTIVE') {
    if (game.tick >= MAX_TICKS) fail(`${name} seed ${seed}: ran past MAX_TICKS`)
    minMs += tickDelayMs(game.apples_eaten)
    lastMove = bot(game)
    const eatenBefore = game.apples_eaten
    advance(game, lastMove, actions)
    if (game.apples_eaten > eatenBefore) countSpawn()

    // Invariants the backend relies on.
    if (game.score !== game.apples_eaten * POINTS) fail('score out of sync with apples')
    if ((game.status as SnakeStatus) !== 'GAME_OVER' && game.snake.length !== INIT_SNAKE.length + game.apples_eaten) {
      fail('snake length out of sync with apples')
    }
    if ((game.key !== null) !== game.apple_locked) fail('key must exist exactly when the apple is locked')
    if (game.key && game.apple && game.key[0] === game.apple[0] && game.key[1] === game.apple[1]) {
      fail('key spawned on the apple')
    }
    if (game.key && game.snake.some(([sx, sy]) => sx === game.key![0] && sy === game.key![1])) {
      fail('key spawned on the snake')
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
    key: game.key,
    apple_locked: game.apple_locked,
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
  play('123456789', cycle, 'locked'),
]

// No WON fixture: the simple bots cannot clear the board (a WON bot would need
// to detour to keys on a Hamiltonian cycle; not attempted).
if (fixtures.find((f) => f.name === 'locked')!.status !== 'GAME_OVER') fail('cycle bot should die')
if (!fixtures.some((f) => f.key !== null)) fail('expected a fixture ending with a key on the board')
if (spawns.locked === 0 || spawns.normal === 0) fail('expected both locked and normal apple spawns')
const wall = fixtures.find((f) => f.name === 'straight')!
if (wall.status !== 'GAME_OVER' || wall.log.total_ticks !== BOARD.width - 5) fail('straight should hit the wall')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(fixtures) + '\n')
for (const f of fixtures) {
  console.log(`${f.name.padEnd(9)} seed ${f.seed.padEnd(20)} ${f.status.padEnd(9)} score ${f.score} ticks ${f.log.total_ticks} actions ${f.log.actions.length}`)
}
console.log(`spawns: ${spawns.locked} locked, ${spawns.normal} normal`)
