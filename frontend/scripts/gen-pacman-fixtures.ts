// Generates parity fixtures for the backend's Pecman replay tests.
// A simple bot plays the TypeScript engine; backend/pacman/tests.py replays each
// log in Python and asserts the same score and tick count.
//
//   node scripts/gen-pacman-fixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type ActionLog,
  type Dir,
  type GameState,
  COLS,
  DIRS,
  ENGINE_VERSION,
  MAZE,
  ROWS,
  UNIT,
  createGame,
  replay,
  step,
  tileAt,
  tileOf,
} from '../src/games/pacman/engine.ts'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../backend/pacman/fixtures/parity.json')
const MAX_TICKS = 20 * 60 * 60
const DX: Record<Dir, number> = { U: 0, L: -1, D: 0, R: 1 }
const DY: Record<Dir, number> = { U: -1, L: 0, D: 1, R: 0 }

if (MAZE.length !== ROWS || MAZE.some((row) => row.length !== COLS)) throw new Error('Maze size is wrong')
const pellets = MAZE.join('').split('').filter((c) => c === '.' || c === 'o').length
if (pellets !== 244) throw new Error(`Expected 244 pellets, found ${pellets}`)

const open = (x: number, y: number) => {
  const t = tileAt(x, y)
  return t !== '#' && t !== '-'
}

/** First direction of a shortest path to the nearest goal, avoiding danger if possible. */
function bfs(state: GameState, avoid: Set<string>): Dir | null {
  const sx = tileOf(state.pac.x)
  const sy = tileOf(state.pac.y)
  const huntable = state.ghosts.filter((g) => g.frightened && g.state === 'active')
  const goal = (x: number, y: number) => {
    if (huntable.some((g) => tileOf(g.x) === x && tileOf(g.y) === y)) return true
    if (huntable.length) return false
    return x >= 0 && x < COLS && state.pellets[y * COLS + x] > 0
  }
  const seen = new Set([`${sx},${sy}`])
  const queue: [number, number, Dir][] = []
  for (const d of DIRS) {
    const x = sx + DX[d]
    const y = sy + DY[d]
    if (open(x, y) && !avoid.has(`${x},${y}`)) {
      seen.add(`${x},${y}`)
      queue.push([x, y, d])
    }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const [x, y, first] = queue[i]
    if (goal(x, y)) return first
    for (const d of DIRS) {
      let nx = x + DX[d]
      const ny = y + DY[d]
      if (nx < -1) nx = COLS
      if (nx > COLS) nx = -1
      const key = `${nx},${ny}`
      if (seen.has(key) || !open(nx, ny) || avoid.has(key)) continue
      seen.add(key)
      queue.push([nx, ny, first])
    }
  }
  return null
}

function botDir(state: GameState, rand: () => number): Dir | null {
  if (rand() < 0.03) return DIRS[Math.floor(rand() * 4)]
  const danger = new Set<string>()
  for (const g of state.ghosts) {
    if (g.state !== 'active' || g.frightened) continue
    const gx = tileOf(g.x)
    const gy = tileOf(g.y)
    for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) danger.add(`${gx + dx},${gy + dy}`)
  }
  return bfs(state, danger) ?? bfs(state, new Set())
}

function play(seed: string) {
  let s = Number(BigInt(seed) % 2147483647n) || 1
  const rand = () => {
    s = (s * 48271) % 2147483647
    return s / 2147483647
  }
  const state = createGame(seed)
  const inputs: [number, Dir][] = []
  while (!state.over && state.tick < MAX_TICKS) {
    let input: Dir | null = null
    const centred = state.pac.x % UNIT === 0 && state.pac.y % UNIT === 0
    if (centred || state.tick % 7 === 0) {
      const d = botDir(state, rand)
      if (d && d !== state.pac.want) {
        input = d
        inputs.push([state.tick + 1, d])
      }
    }
    step(state, input)
  }
  if (!state.over) return null
  const log: ActionLog = { version: ENGINE_VERSION, inputs, total_ticks: state.tick, claimed_score: state.score }
  const check = replay(seed, log)
  if (check.score !== state.score || check.tick !== state.tick) throw new Error(`TS replay mismatch for ${seed}`)
  return { seed, log, score: state.score, ticks: state.tick, level: state.level }
}

const seeds = [
  '1', '42', '1337', '4294967296', '9007199254740993', '5764607523034234879',
  '123456789', '987654321', '2718281828', '3141592653', '161803398', '8675309',
]
const fixtures = seeds.map(play).filter((f) => f !== null)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(fixtures))
for (const f of fixtures) console.log(`seed ${f.seed}: score ${f.score}, level ${f.level}, ${f.ticks} ticks, ${f.log.inputs.length} inputs`)
console.log(`wrote ${fixtures.length} fixtures to ${OUT}`)
