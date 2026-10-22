// Canvas renderer. Reads engine state only; never mutates it.
import { COLS, type Dir, type GameState, type Ghost, MAZE, ROWS, UNIT } from './engine'

export const TILE = 16
export const WIDTH = COLS * TILE
export const HEIGHT = ROWS * TILE

const WALL = '#2b3cff'
const GHOST_COLORS = { blinky: '#ff3b3b', pinky: '#ffb8ff', inky: '#3fe8ff', clyde: '#ffb852' }
const ANGLE: Record<Dir, number> = { R: 0, D: Math.PI / 2, L: Math.PI, U: -Math.PI / 2 }
const PUPIL: Record<Dir, [number, number]> = { U: [0, -2], L: [-2, 0], D: [0, 2], R: [2, 0] }

const px = (v: number) => (v / UNIT) * TILE + TILE / 2

const isWall = (x: number, y: number) => {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return y !== 14
  return MAZE[y][x] === '#'
}

/** Draw wall outlines once; walls only show edges that face open space. */
export function renderMaze(scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * scale
  canvas.height = HEIGHT * scale
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.strokeStyle = WALL
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  const inset = 5
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const tile = MAZE[y][x]
      if (tile === '-') {
        ctx.fillStyle = '#ffb8ff'
        ctx.fillRect(x * TILE, y * TILE + TILE / 2 - 1, TILE, 3)
        continue
      }
      if (tile !== '#') continue
      const left = x * TILE
      const top = y * TILE
      ctx.beginPath()
      if (!isWall(x, y - 1)) {
        ctx.moveTo(left, top + inset)
        ctx.lineTo(left + TILE, top + inset)
      }
      if (!isWall(x, y + 1)) {
        ctx.moveTo(left, top + TILE - inset)
        ctx.lineTo(left + TILE, top + TILE - inset)
      }
      if (!isWall(x - 1, y)) {
        ctx.moveTo(left + inset, top)
        ctx.lineTo(left + inset, top + TILE)
      }
      if (!isWall(x + 1, y)) {
        ctx.moveTo(left + TILE - inset, top)
        ctx.lineTo(left + TILE - inset, top + TILE)
      }
      ctx.stroke()
    }
  }
  return canvas
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, state: GameState) {
  const x = px(g.x)
  const y = px(g.y)
  const r = TILE * 0.7
  if (g.state !== 'eyes' && g.state !== 'enter') {
    const flashing = state.frightTimer < 120 && Math.floor(state.tick / 12) % 2 === 0
    ctx.fillStyle = g.frightened ? (flashing ? '#f5f5ff' : '#2121ff') : GHOST_COLORS[g.name]
    ctx.beginPath()
    ctx.arc(x, y - 1, r, Math.PI, 0)
    const bottom = y + r - 1
    const wave = Math.floor(state.tick / 8) % 2 === 0 ? 2 : -2
    ctx.lineTo(x + r, bottom)
    for (let i = 0; i < 4; i += 1) {
      const sx = x + r - ((i + 0.5) * 2 * r) / 4
      ctx.lineTo(sx, bottom - 3 + (i % 2 === 0 ? wave : -wave))
      ctx.lineTo(x + r - ((i + 1) * 2 * r) / 4, bottom)
    }
    ctx.closePath()
    ctx.fill()
    if (g.frightened) {
      ctx.fillStyle = flashing ? '#ff3b3b' : '#ffd2b0'
      ctx.fillRect(x - 5, y - 4, 3, 3)
      ctx.fillRect(x + 2, y - 4, 3, 3)
      return
    }
  }
  const [ox, oy] = PUPIL[g.dir]
  for (const side of [-4, 4]) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(x + side + ox / 2, y - 3 + oy / 2, 3.2, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1b2bff'
    ctx.beginPath()
    ctx.arc(x + side + ox, y - 3 + oy, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function draw(ctx: CanvasRenderingContext2D, maze: HTMLCanvasElement, state: GameState) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.drawImage(maze, 0, 0, WIDTH, HEIGHT)

  const blink = Math.floor(state.tick / 15) % 2 === 0 || state.freeze > 0
  for (let i = 0; i < state.pellets.length; i += 1) {
    const v = state.pellets[i]
    if (!v) continue
    const cx = (i % COLS) * TILE + TILE / 2
    const cy = Math.floor(i / COLS) * TILE + TILE / 2
    ctx.fillStyle = '#ffd7c2'
    if (v === 1) {
      ctx.fillRect(cx - 2, cy - 2, 4, 4)
    } else if (blink) {
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const g of state.ghosts) drawGhost(ctx, g, state)

  const p = state.pac
  const mouth = state.freeze > 0 ? 0.2 : (Math.abs((state.tick % 16) - 8) / 8) * 0.28 * Math.PI
  const angle = ANGLE[p.dir]
  ctx.fillStyle = '#ffe600'
  ctx.beginPath()
  ctx.moveTo(px(p.x), px(p.y))
  ctx.arc(px(p.x), px(p.y), TILE * 0.68, angle + mouth, angle + Math.PI * 2 - mouth)
  ctx.closePath()
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${TILE * 0.75}px 'Press Start 2P', monospace`
  if (state.over) {
    ctx.fillStyle = '#ff3b3b'
    ctx.fillText('GAME  OVER', WIDTH / 2, 17 * TILE + TILE / 2)
  } else if (state.freeze > 0) {
    ctx.fillStyle = '#ffe600'
    ctx.fillText('READY!', WIDTH / 2, 17 * TILE + TILE / 2)
  }
}
