// Game rules shared by the UI, plus a local copy of the server rules for
// practice games (signed out or out of tickets). Keep this in step with
// backend/minesweeper/game.py and views.py.
import type { Cell, Difficulty, EndReason, GameState, MoveResult, MoveType, PowerUp, PowerUpCell } from './api'

export type DifficultyConfig = {
  key: Difficulty
  label: string
  cols: number
  rows: number
  mines: number
  /** Seconds, counted from the first reveal. */
  time: number
  /** Reveals, chords and sonar pings. Flags are free. */
  moves: number
  powerups: number
}

export const DIFFICULTIES: DifficultyConfig[] = [
  { key: 'beginner', label: 'Beginner', cols: 9, rows: 9, mines: 10, time: 90, moves: 45, powerups: 2 },
  { key: 'intermediate', label: 'Intermediate', cols: 11, rows: 11, mines: 19, time: 150, moves: 75, powerups: 3 },
  { key: 'expert', label: 'Expert', cols: 13, rows: 13, mines: 35, time: 240, moves: 120, powerups: 4 },
]

export const EXTEND_SECONDS = 20
export const EXTEND_MOVES = 10

const POWERUP_TYPES: PowerUp[] = ['shield', 'sonar', 'extender']

export const POWERUP_ICON: Record<PowerUp, string> = {
  shield: '🛡️',
  sonar: '📡',
  extender: '⏱️',
}

export const POWERUP_NAME: Record<PowerUp, string> = {
  shield: 'Shield',
  sonar: 'Sonar',
  extender: 'Extender',
}

/** What the player learns from one move, for sounds and pop-ups. */
export type MoveEvents = Pick<MoveResult, 'cells' | 'picked_up' | 'blocked' | 'pinged'>

export function neighbors(idx: number, w: number, h: number): number[] {
  const x = idx % w
  const y = Math.floor(idx / w)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx)
    }
  }
  return out
}

export function blankGame(config: DifficultyConfig, id: string): GameState {
  return {
    id,
    width: config.cols,
    height: config.rows,
    mine_count: config.mines,
    time_limit: config.time,
    move_limit: config.moves,
    status: 'in_progress',
    move_count: 0,
    cells: [],
    flagged: [],
    mines_left: config.mines,
    moves_used: 0,
    moves_left: config.moves,
    time_left: config.time,
    shields: 0,
    sonars: 0,
    found: [],
    detected: [],
    defused: [],
    end_reason: null,
    startedAt: null,
    finishedAt: null,
    mines: undefined,
    exploded: [],
    score: 0,
    powerups: [],
  }
}

/** Merge a server move result into the board. */
export function applyResult(g: GameState, r: MoveResult): GameState {
  const over = r.status !== 'in_progress'
  return {
    ...g,
    status: r.status,
    move_count: r.move_count,
    flagged: r.flagged,
    mines_left: r.mines_left,
    moves_used: r.moves_used,
    moves_left: r.moves_left,
    time_left: r.time_left,
    shields: r.shields,
    sonars: r.sonars,
    found: r.found,
    detected: r.detected,
    defused: r.defused,
    end_reason: r.end_reason,
    mines: r.mines,
    exploded: r.exploded,
    score: r.score,
    powerups: r.powerups,
    cells: [...g.cells, ...r.cells],
    // Any accepted move means the board has started (the first one is a reveal).
    startedAt: g.startedAt ?? new Date().toISOString(),
    finishedAt: over ? (g.finishedAt ?? new Date().toISOString()) : g.finishedAt,
  }
}

// ---------------------------------------------------------
// Local practice rules
// The hidden state (mines, unfound power-ups) lives on the GameState; the UI
// only draws it once the game is over, as with server games.
// ---------------------------------------------------------

function movesLeft(g: GameState, movesUsed: number, bonusMoves: number): number | null {
  return g.move_limit === null ? null : Math.max(0, g.move_limit + bonusMoves - movesUsed)
}

function timeLeft(g: GameState, bonusSeconds: number, startedAt: string | null, end: number): number | null {
  if (g.time_limit === null) return null
  const total = g.time_limit + bonusSeconds
  if (!startedAt) return total
  return Math.max(0, total - (end - Date.parse(startedAt)) / 1000)
}

/** Seconds and moves added by extenders picked up so far. */
function bonuses(found: PowerUpCell[]) {
  const n = found.filter(([, kind]) => kind === 'extender').length
  return { seconds: n * EXTEND_SECONDS, moves: n * EXTEND_MOVES }
}

function powerupCount(g: GameState): number {
  const config = DIFFICULTIES.find((d) => d.cols === g.width && d.rows === g.height && d.mines === g.mine_count)
  return config?.powerups ?? 0
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** Recompute the derived fields and, if the game just ended, its score. */
function settle(g: GameState, now: number): GameState {
  const bonus = bonuses(g.found)
  const flaggedOrDetected = new Set([...g.flagged, ...g.detected])
  const next: GameState = {
    ...g,
    mines_left: g.mine_count - flaggedOrDetected.size - g.defused.length,
    moves_left: movesLeft(g, g.moves_used, bonus.moves),
    time_left: timeLeft(g, bonus.seconds, g.startedAt, g.finishedAt ? Date.parse(g.finishedAt) : now),
  }
  if (next.status !== 'in_progress') {
    let points = next.cells.length
    if (next.status === 'won') {
      points += next.mine_count * 10
      if (next.time_left !== null) points += Math.floor(next.time_left)
      if (next.moves_left !== null) points += next.moves_left * 2
    }
    next.score = points
  }
  return next
}

function finish(g: GameState, status: 'won' | 'lost', now: number, reason: EndReason | null = null): GameState {
  return settle({ ...g, status, end_reason: status === 'lost' ? reason : null, finishedAt: new Date(now).toISOString() }, now)
}

/** Ends a practice game whose clock has run out. Returns the same object otherwise. */
export function localExpire(g: GameState, now = Date.now()): GameState {
  if (g.status !== 'in_progress' || !g.startedAt) return g
  const left = timeLeft(g, bonuses(g.found).seconds, g.startedAt, now)
  return left !== null && left <= 0 ? finish(g, 'lost', now, 'time') : g
}

/** Plays one practice move. Returns null when the move isn't allowed (nothing changes). */
export function localMove(
  game: GameState,
  type: MoveType,
  index: number,
  now = Date.now(),
): { game: GameState; events: MoveEvents } | null {
  if (game.status !== 'in_progress') return null
  const events: MoveEvents = { cells: [], picked_up: [], blocked: [], pinged: [] }

  const expired = localExpire(game, now)
  if (expired !== game) return { game: expired, events }

  const { width: w, height: h, mine_count } = game
  const opened = new Map(game.cells)
  const flagged = new Set(game.flagged)
  const defused = new Set(game.defused)
  const detected = new Set(game.detected)
  let g: GameState = { ...game }

  if (type === 'flag') {
    if (opened.has(index) || defused.has(index)) return null
    if (!flagged.has(index) && flagged.size >= mine_count - defused.size) return null
    if (flagged.has(index)) flagged.delete(index)
    else flagged.add(index)
    g.flagged = Array.from(flagged)
  } else if (type === 'sonar') {
    if (!g.mines || g.sonars < 1) return null
    const mines = new Set(g.mines)
    events.pinged = [index, ...neighbors(index, w, h)]
      .filter((i) => mines.has(i) && !detected.has(i) && !defused.has(i))
      .sort((a, b) => a - b)
    g.sonars -= 1
    g.moves_used += 1
    g.detected = [...g.detected, ...events.pinged]
  } else {
    if (!g.mines) {
      // First reveal: keep the opening 3x3 clear, then hide the power-ups.
      const opening = new Set([index, ...neighbors(index, w, h)])
      const free = shuffle(Array.from({ length: w * h }, (_, i) => i).filter((i) => !opening.has(i)))
      const mines = free.slice(0, mine_count)
      const types = shuffle([...POWERUP_TYPES])
      g.mines = mines
      g.powerups = free
        .slice(mine_count, mine_count + powerupCount(g))
        .map((cell, n): PowerUpCell => [cell, types[n % types.length]])
      g.startedAt = new Date(now).toISOString()
    }
    const mines = new Set(g.mines)
    const marked = new Set([...flagged, ...defused, ...detected])

    let targets: number[]
    if (type === 'reveal') {
      if (opened.has(index) || marked.has(index)) return null
      targets = [index]
    } else {
      // chord
      const value = opened.get(index)
      if (value === undefined) return null
      const around = neighbors(index, w, h)
      if (around.filter((n) => marked.has(n)).length !== value) return null
      targets = around.filter((n) => !opened.has(n) && !marked.has(n))
      if (targets.length === 0) return null
    }

    g.moves_used += 1
    let hit = targets.filter((t) => mines.has(t))
    if (hit.length > 0 && g.shields > 0) {
      // A shield blocks one mine; any other mine hit still explodes.
      g.shields -= 1
      events.blocked = hit.slice(0, 1)
      g.defused = [...g.defused, ...events.blocked]
      hit = hit.slice(1)
    }

    if (hit.length > 0) {
      g = finish({ ...g, exploded: hit, move_count: g.move_count + 1 }, 'lost', now, 'mine')
      return { game: g, events }
    }

    // Flood-fill from each safe target.
    const stack = targets.filter((t) => !mines.has(t))
    while (stack.length > 0) {
      const i = stack.pop()!
      if (opened.has(i) || flagged.has(i)) continue
      const around = neighbors(i, w, h)
      const n = around.filter((x) => mines.has(x)).length
      opened.set(i, n)
      events.cells.push([i, n] as Cell)
      if (n === 0) stack.push(...around)
    }
    g.cells = [...g.cells, ...events.cells]

    // Pick up power-ups under the opened cells.
    const openedNow = new Set(events.cells.map(([i]) => i))
    events.picked_up = (g.powerups ?? []).filter(([cell]) => openedNow.has(cell))
    if (events.picked_up.length > 0) {
      g.powerups = (g.powerups ?? []).filter(([cell]) => !openedNow.has(cell))
      g.found = [...g.found, ...events.picked_up]
      for (const [, kind] of events.picked_up) {
        if (kind === 'shield') g.shields += 1
        else if (kind === 'sonar') g.sonars += 1
      }
    }

    if (g.cells.length === w * h - mine_count) {
      g = finish({ ...g, move_count: g.move_count + 1 }, 'won', now)
      return { game: g, events }
    }
  }

  g.move_count += 1
  g = settle(g, now)
  if (g.moves_left === 0) g = finish(g, 'lost', now, 'moves')
  return { game: g, events }
}
