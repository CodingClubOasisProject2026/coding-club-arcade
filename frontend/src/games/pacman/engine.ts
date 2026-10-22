// Deterministic Pac-Man engine. The backend replays recorded inputs through a
// line-for-line Python port (backend/pacman/engine.py) to verify scores, so any
// rule change here must be mirrored there and ENGINE_VERSION bumped.
//
// Rules for keeping the two in sync: integers only, no Math.random/Date, and
// the same order of operations inside step().

export const ENGINE_VERSION = 1
export const TICKS_PER_SECOND = 60
export const COLS = 28
export const ROWS = 31
/** Sub-units per tile. Entity positions are tile centres * UNIT. */
export const UNIT = 8

// # wall, - ghost door, . pellet, o power pellet, space empty.
export const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
]

export type Dir = 'U' | 'L' | 'D' | 'R'
/** Ghost tie-break order (classic arcade). */
export const DIRS: Dir[] = ['U', 'L', 'D', 'R']
const DX: Record<Dir, number> = { U: 0, L: -1, D: 0, R: 1 }
const DY: Record<Dir, number> = { U: -1, L: 0, D: 1, R: 0 }
const OPP: Record<Dir, Dir> = { U: 'D', L: 'R', D: 'U', R: 'L' }

const TUNNEL_ROW = 14
const WRAP = (COLS + 2) * UNIT
const HOUSE_DOOR_X = 13 * UNIT + 4
const HOUSE_EXIT_Y = 11 * UNIT
const HOUSE_MID_Y = 14 * UNIT
const READY_TICKS = 120
const EYES_SPEED = 200
const HOUSE_SPEED = 60
/** Tiles where non-frightened ghosts may not turn upward. */
const NO_UP_TILES = new Set(['12,11', '15,11', '12,23', '15,23'])

export type GhostName = 'blinky' | 'pinky' | 'inky' | 'clyde'
export type GhostState = 'house' | 'exit' | 'active' | 'eyes' | 'enter'

export type Ghost = {
  name: GhostName
  x: number
  y: number
  dir: Dir
  state: GhostState
  frightened: boolean
  reverse: boolean
  acc: number
}

export type Pac = { x: number; y: number; dir: Dir; want: Dir; acc: number }

export type GameState = {
  tick: number
  score: number
  level: number
  lives: number
  over: boolean
  freeze: number
  pac: Pac
  ghosts: Ghost[]
  /** Per tile: 0 empty, 1 pellet, 2 power pellet. */
  pellets: number[]
  pelletsLeft: number
  dotsEaten: number
  activeTicks: number
  modeIndex: number
  modeTimer: number
  frightTimer: number
  combo: number
  rng: number
}

const GHOST_START: Record<GhostName, { x: number; y: number; state: GhostState }> = {
  blinky: { x: 13 * UNIT + 4, y: 11 * UNIT, state: 'active' },
  pinky: { x: 13 * UNIT + 4, y: 14 * UNIT, state: 'house' },
  inky: { x: 11 * UNIT + 4, y: 14 * UNIT, state: 'house' },
  clyde: { x: 15 * UNIT + 4, y: 14 * UNIT, state: 'house' },
}
const SCATTER_TARGET: Record<GhostName, [number, number]> = {
  blinky: [25, -3],
  pinky: [2, -3],
  inky: [27, 31],
  clyde: [0, 31],
}
/** Release when activeTicks >= ticks or dotsEaten >= dots. */
const RELEASE: Record<GhostName, [number, number]> = {
  blinky: [0, 0],
  pinky: [0, 0],
  inky: [360, 30],
  clyde: [600, 60],
}

/** Speeds are hundredths of a sub-unit per tick. */
export function speeds(level: number) {
  if (level === 1) return { pac: 100, pacFright: 112, ghost: 94, ghostFright: 62, tunnel: 50 }
  if (level <= 4) return { pac: 112, pacFright: 119, ghost: 106, ghostFright: 69, tunnel: 56 }
  return { pac: 125, pacFright: 125, ghost: 119, ghostFright: 75, tunnel: 62 }
}

export function frightTicks(level: number): number {
  return Math.max(60, 420 - level * 60)
}

/** Alternating scatter/chase phase lengths in ticks; the final chase is endless. */
export function modeSchedule(level: number): number[] {
  const s = TICKS_PER_SECOND
  if (level === 1) return [7 * s, 20 * s, 7 * s, 20 * s, 5 * s, 20 * s, 5 * s]
  if (level <= 4) return [7 * s, 20 * s, 7 * s, 20 * s, 5 * s, 20 * s, 1 * s]
  return [5 * s, 20 * s, 5 * s, 20 * s, 5 * s, 20 * s, 1 * s]
}

/** Map a session seed (may exceed 2^53, so accept strings) to a nonzero uint32. */
export function seedToRng(seed: string | number | bigint): number {
  const value = Number(BigInt(seed) & 0xffffffffn)
  return value === 0 ? 0x6d2b79f5 : value
}

function nextRandom(state: GameState): number {
  let x = state.rng
  x = (x ^ (x << 13)) >>> 0
  x = (x ^ (x >>> 17)) >>> 0
  x = (x ^ (x << 5)) >>> 0
  state.rng = x
  return x
}

const mod = (n: number, m: number) => ((n % m) + m) % m

export function tileAt(tx: number, ty: number): string {
  if (ty === TUNNEL_ROW && (tx < 0 || tx >= COLS)) return ' '
  if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return '#'
  return MAZE[ty][tx]
}

function pacCanEnter(tx: number, ty: number) {
  const t = tileAt(tx, ty)
  return t !== '#' && t !== '-'
}

const atCenter = (x: number, y: number) => mod(x, UNIT) === 0 && mod(y, UNIT) === 0
/** Tile containing the point (nearest tile centre). */
export const tileOf = (v: number) => Math.floor((v + UNIT / 2) / UNIT)

function wrap(e: { x: number }) {
  if (e.x < -UNIT) e.x += WRAP
  else if (e.x > COLS * UNIT) e.x -= WRAP
}

function initialPellets() {
  const pellets: number[] = []
  let count = 0
  for (const row of MAZE) {
    for (const ch of row) {
      const v = ch === '.' ? 1 : ch === 'o' ? 2 : 0
      pellets.push(v)
      if (v) count += 1
    }
  }
  return { pellets, count }
}

function resetActors(state: GameState) {
  state.pac = { x: 13 * UNIT + 4, y: 23 * UNIT, dir: 'L', want: state.pac?.want ?? 'L', acc: 0 }
  state.ghosts = (['blinky', 'pinky', 'inky', 'clyde'] as GhostName[]).map((name) => ({
    name,
    x: GHOST_START[name].x,
    y: GHOST_START[name].y,
    dir: name === 'blinky' ? 'L' : 'U',
    state: GHOST_START[name].state,
    frightened: false,
    reverse: false,
    acc: 0,
  }))
  state.freeze = READY_TICKS
  state.dotsEaten = 0
  state.activeTicks = 0
  state.modeIndex = 0
  state.modeTimer = 0
  state.frightTimer = 0
  state.combo = 0
}

export function createGame(seed: string | number | bigint): GameState {
  const { pellets, count } = initialPellets()
  const state = {
    tick: 0,
    score: 0,
    level: 1,
    lives: 3,
    over: false,
    pellets,
    pelletsLeft: count,
    rng: seedToRng(seed),
  } as GameState
  resetActors(state)
  return state
}

function ghostTarget(state: GameState, g: Ghost): [number, number] {
  if (g.state === 'eyes') return [13, 11]
  const scatter = state.modeIndex % 2 === 0
  if (scatter) return SCATTER_TARGET[g.name]
  const px = tileOf(state.pac.x)
  const py = tileOf(state.pac.y)
  const d = state.pac.dir
  if (g.name === 'blinky') return [px, py]
  if (g.name === 'pinky') {
    // Includes the arcade's overflow quirk: facing up also shifts left.
    return [px + DX[d] * 4 - (d === 'U' ? 4 : 0), py + DY[d] * 4]
  }
  if (g.name === 'inky') {
    const ax = px + DX[d] * 2 - (d === 'U' ? 2 : 0)
    const ay = py + DY[d] * 2
    const blinky = state.ghosts[0]
    return [2 * ax - tileOf(blinky.x), 2 * ay - tileOf(blinky.y)]
  }
  const gx = tileOf(g.x)
  const gy = tileOf(g.y)
  const dist = (gx - px) * (gx - px) + (gy - py) * (gy - py)
  return dist > 64 ? [px, py] : SCATTER_TARGET.clyde
}

function chooseGhostDir(state: GameState, g: Ghost) {
  const tx = g.x / UNIT
  const ty = g.y / UNIT
  const options: Dir[] = []
  for (const d of DIRS) {
    if (d === OPP[g.dir]) continue
    if (!pacCanEnter(tx + DX[d], ty + DY[d])) continue
    if (d === 'U' && g.state === 'active' && !g.frightened && NO_UP_TILES.has(`${tx},${ty}`)) continue
    options.push(d)
  }
  if (options.length === 0) {
    g.dir = OPP[g.dir]
    return
  }
  if (g.frightened && g.state === 'active') {
    const start = nextRandom(state) % 4
    for (let i = 0; i < 4; i += 1) {
      const d = DIRS[(start + i) % 4]
      if (options.includes(d)) {
        g.dir = d
        return
      }
    }
  }
  const [targetX, targetY] = ghostTarget(state, g)
  let best = options[0]
  let bestDist = Infinity
  for (const d of options) {
    const nx = tx + DX[d] - targetX
    const ny = ty + DY[d] - targetY
    const dist = nx * nx + ny * ny
    if (dist < bestDist) {
      best = d
      bestDist = dist
    }
  }
  g.dir = best
}

function ghostSpeed(state: GameState, g: Ghost): number {
  const sp = speeds(state.level)
  if (g.state === 'eyes' || g.state === 'enter') return EYES_SPEED
  if (g.state === 'exit' || g.state === 'house') return HOUSE_SPEED
  const ty = tileOf(g.y)
  const tx = tileOf(g.x)
  if (ty === TUNNEL_ROW && (tx <= 5 || tx >= 22)) return sp.tunnel
  return g.frightened ? sp.ghostFright : sp.ghost
}

function stepGhost(state: GameState, g: Ghost) {
  if (g.state === 'house') return
  if (g.state === 'exit') {
    if (g.x !== HOUSE_DOOR_X) g.x += g.x < HOUSE_DOOR_X ? 1 : -1
    else if (g.y > HOUSE_EXIT_Y) g.y -= 1
    else {
      g.state = 'active'
      g.dir = 'L'
    }
    return
  }
  if (g.state === 'enter') {
    if (g.x !== HOUSE_DOOR_X) g.x += g.x < HOUSE_DOOR_X ? 1 : -1
    else if (g.y < HOUSE_MID_Y) g.y += 1
    else {
      g.state = 'exit'
      g.frightened = false
    }
    return
  }
  if (atCenter(g.x, g.y)) {
    if (g.state === 'eyes' && g.y === HOUSE_EXIT_Y && (g.x === 13 * UNIT || g.x === 14 * UNIT)) {
      g.state = 'enter'
      return
    }
    chooseGhostDir(state, g)
  }
  g.x += DX[g.dir]
  g.y += DY[g.dir]
  wrap(g)
}

function stepPac(state: GameState) {
  const p = state.pac
  if (atCenter(p.x, p.y)) {
    const tx = p.x / UNIT
    const ty = p.y / UNIT
    if (pacCanEnter(tx + DX[p.want], ty + DY[p.want])) p.dir = p.want
    if (!pacCanEnter(tx + DX[p.dir], ty + DY[p.dir])) return
  } else if (p.want === OPP[p.dir]) {
    p.dir = p.want
  }
  p.x += DX[p.dir]
  p.y += DY[p.dir]
  wrap(p)
}

function eat(state: GameState) {
  const tx = tileOf(state.pac.x)
  const ty = tileOf(state.pac.y)
  if (tx < 0 || tx >= COLS) return
  const i = ty * COLS + tx
  const v = state.pellets[i]
  if (!v) return
  state.pellets[i] = 0
  state.pelletsLeft -= 1
  state.dotsEaten += 1
  if (v === 1) {
    state.score += 10
    return
  }
  state.score += 50
  state.combo = 0
  state.frightTimer = frightTicks(state.level)
  for (const g of state.ghosts) {
    if (g.state === 'eyes' || g.state === 'enter') continue
    g.frightened = true
    if (g.state === 'active') g.reverse = true
  }
}

/** Returns true if Pac-Man died this check. */
function collide(state: GameState): boolean {
  const px = tileOf(state.pac.x)
  const py = tileOf(state.pac.y)
  for (const g of state.ghosts) {
    if (g.state !== 'active') continue
    if (tileOf(g.x) !== px || tileOf(g.y) !== py) continue
    if (g.frightened) {
      state.score += 200 << Math.min(state.combo, 3)
      state.combo += 1
      g.frightened = false
      g.state = 'eyes'
      continue
    }
    state.lives -= 1
    if (state.lives <= 0) state.over = true
    else resetActors(state)
    return true
  }
  return false
}

function updateModes(state: GameState) {
  if (state.frightTimer > 0) {
    state.frightTimer -= 1
    if (state.frightTimer === 0) {
      state.combo = 0
      for (const g of state.ghosts) g.frightened = false
    }
    return
  }
  const schedule = modeSchedule(state.level)
  if (state.modeIndex >= schedule.length) return
  state.modeTimer += 1
  if (state.modeTimer < schedule[state.modeIndex]) return
  state.modeIndex += 1
  state.modeTimer = 0
  for (const g of state.ghosts) if (g.state === 'active') g.reverse = true
}

function releaseGhosts(state: GameState) {
  for (const g of state.ghosts) {
    if (g.state !== 'house') continue
    const [ticks, dots] = RELEASE[g.name]
    if (state.activeTicks >= ticks || state.dotsEaten >= dots) g.state = 'exit'
  }
}

function advance(acc: number, speed: number): [number, number] {
  const total = acc + speed
  return [Math.floor(total / 100), total % 100]
}

/** Advance one tick. `input` (if any) sets the buffered direction first. */
export function step(state: GameState, input: Dir | null = null) {
  if (state.over) return
  state.tick += 1
  if (input) state.pac.want = input
  if (state.freeze > 0) {
    state.freeze -= 1
    return
  }
  state.activeTicks += 1
  updateModes(state)
  releaseGhosts(state)

  const sp = speeds(state.level)
  const [pacSteps, pacAcc] = advance(state.pac.acc, state.frightTimer > 0 ? sp.pacFright : sp.pac)
  state.pac.acc = pacAcc
  for (let i = 0; i < pacSteps; i += 1) {
    stepPac(state)
    eat(state)
  }
  if (state.pelletsLeft === 0) {
    state.level += 1
    const { pellets, count } = initialPellets()
    state.pellets = pellets
    state.pelletsLeft = count
    resetActors(state)
    return
  }
  if (collide(state)) return

  for (const g of state.ghosts) {
    if (g.reverse) {
      g.reverse = false
      g.dir = OPP[g.dir]
    }
    const [ghostSteps, ghostAcc] = advance(g.acc, ghostSpeed(state, g))
    g.acc = ghostAcc
    for (let i = 0; i < ghostSteps; i += 1) stepGhost(state, g)
  }
  collide(state)
}

/** The log submitted to the backend for verification. */
export type ActionLog = {
  version: number
  inputs: [number, Dir][]
  total_ticks: number
  claimed_score: number
}

/** Replays a log; used by the fixture generator and as a client-side sanity check. */
export function replay(seed: string | number | bigint, log: ActionLog): GameState {
  const state = createGame(seed)
  let i = 0
  while (!state.over) {
    const next = state.tick + 1
    let input: Dir | null = null
    while (i < log.inputs.length && log.inputs[i][0] === next) {
      input = log.inputs[i][1]
      i += 1
    }
    step(state, input)
    if (state.tick >= log.total_ticks) break
  }
  return state
}
