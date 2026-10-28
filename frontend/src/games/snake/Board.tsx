import { useEffect, useRef, useState, type CSSProperties } from 'react'

const SPRITE_DIR = '/snake-assets'
const BURST_MS = 700

const VEC: Record<string, string> = { '1,0': 'right', '-1,0': 'left', '0,1': 'down', '0,-1': 'up' }
const CORNERS: Record<string, string> = {
  'up,right': 'body_up_right',
  'right,down': 'body_right_down',
  'down,left': 'body_down_left',
  'left,up': 'body_left_up',
}

const dirTo = (a: [number, number], b: [number, number]) =>
  VEC[`${Math.sign(b[0] - a[0])},${Math.sign(b[1] - a[1])}`]

function spriteFor(snake: [number, number][], i: number) {
  const n = snake.length
  if (i === 0) return `head_${n > 1 ? dirTo(snake[1], snake[0]) : 'right'}`
  if (i === n - 1) return `tail_${dirTo(snake[i - 1], snake[i])}`

  const a = dirTo(snake[i], snake[i - 1])
  const b = dirTo(snake[i], snake[i + 1])
  const pair = [a, b]
  if (pair.includes('left') && pair.includes('right')) return 'body_h'
  if (pair.includes('up') && pair.includes('down')) return 'body_v'
  return CORNERS[`${a},${b}`] || CORNERS[`${b},${a}`] || 'body_h'
}

const pixelated: CSSProperties = { imageRendering: 'pixelated' }

const SPARKS: [number, number, string][] = [
  [0, -30, '#fff4b0'],
  [22, -22, '#ff4d5e'],
  [30, 0, '#ffd24a'],
  [22, 22, '#ff4d5e'],
  [0, 30, '#fff4b0'],
  [-22, 22, '#ffd24a'],
  [-30, 0, '#ff4d5e'],
  [-22, -22, '#ffd24a'],
]

function Sprite({ name }: { name: string }) {
  return (
    <img
      src={`${SPRITE_DIR}/${name}.webp`}
      alt=""
      draggable={false}
      className="snake-sprite"
      style={pixelated}
    />
  )
}

/** Pixel-art golden key (12x12 grid), drawn as SVG rects. */
const KEY_PIXELS: [number, number, number, number, string][] = [
  // [x, y, w, h, fill]
  [2, 1, 4, 1, '#fff4b0'],
  [1, 2, 6, 1, '#ffd24a'],
  [1, 3, 2, 3, '#ffd24a'],
  [5, 3, 2, 3, '#ffd24a'],
  [1, 6, 6, 1, '#c9921a'],
  [2, 7, 4, 1, '#c9921a'],
  [3, 7, 2, 1, '#ffd24a'],
  [3, 8, 2, 4, '#ffd24a'],
  [5, 9, 2, 1, '#ffd24a'],
  [5, 11, 2, 1, '#ffd24a'],
  [4, 8, 1, 4, '#c9921a'],
]

function KeySprite() {
  return (
    <svg className="snake-key" viewBox="0 0 8 12" shapeRendering="crispEdges" aria-hidden="true">
      {KEY_PIXELS.map(([x, y, w, h, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
      ))}
      <rect x="3" y="3" width="2" height="2" fill="#2a1b0a" />
    </svg>
  )
}

function Padlock() {
  return (
    <svg className="snake-lock" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 5V3h1V2h2v1h1v2" fill="none" stroke="#c8ccd6" strokeWidth="1" />
      <rect x="2" y="5" width="6" height="4" fill="#8a8f9e" />
      <rect x="2" y="5" width="6" height="1" fill="#c8ccd6" />
      <rect x="2" y="9" width="6" height="0.01" fill="#000" />
      <rect x="4.5" y="6.5" width="1" height="1.5" fill="#1b1d26" />
    </svg>
  )
}

function Burst({ x, y, board }: { x: number; y: number; board: { width: number; height: number } }) {
  return (
    <div
      className="ap-burst"
      style={{
        left: `${(x * 100) / board.width}%`,
        top: `${(y * 100) / board.height}%`,
        width: `${100 / board.width}%`,
        height: `${100 / board.height}%`,
      }}
    >
      <span className="ap-star" />
      {SPARKS.map(([dx, dy, c], i) => (
        <span
          key={i}
          className="ap-spark"
          style={{ background: c, ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }}
        />
      ))}
      <span className="ap-score">+10</span>
    </div>
  )
}

interface BoardProps {
  board: { width: number; height: number }
  snake: [number, number][]
  apple: [number, number] | null
  appleLocked?: boolean
  keyCell?: [number, number] | null
}

export default function Board({ board, snake, apple, appleLocked = false, keyCell = null }: BoardProps) {
  const [bursts, setBursts] = useState<{ id: string; x: number; y: number }[]>([])
  const prevApple = useRef<[number, number] | null>(null)

  useEffect(() => {
    const prev = prevApple.current
    prevApple.current = apple
    if (!prev) return
    const moved = !apple || apple[0] !== prev[0] || apple[1] !== prev[1]
    const [hx, hy] = snake[0] ?? [-1, -1]
    if (moved && hx === prev[0] && hy === prev[1]) {
      const id = `${Date.now()}-${Math.random()}`
      setBursts((b) => [...b, { id, x: prev[0], y: prev[1] }])
      setTimeout(() => setBursts((b) => b.filter((i) => i.id !== id)), BURST_MS + 50)
    }
  }, [apple, snake])

  const parts = new Map(snake.map(([x, y], i) => [`${x},${y}`, spriteFor(snake, i)]))
  const keyKey = keyCell ? `${keyCell[0]},${keyCell[1]}` : null
  const appleKey = apple ? `${apple[0]},${apple[1]}` : null

  const cells = []
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const key = `${x},${y}`
      const tile = (x + y) % 2 === 0 ? 'tile_a' : 'tile_b'
      const part = parts.get(key)

      cells.push(
        <div
          key={key}
          className="snake-cell"
          style={{
            backgroundImage: `url(${SPRITE_DIR}/${tile}.webp)`,
            backgroundSize: '100% 100%',
            ...pixelated,
          }}
        >
          {part ? <Sprite name={part} /> : key === appleKey ? (
            <div className={appleLocked ? 'snake-apple locked' : 'snake-apple'}>
              <Sprite name="apple" />
              {appleLocked && <Padlock />}
            </div>
          ) : key === keyKey ? (
            <div className="snake-key-wrap">
              <KeySprite />
            </div>
          ) : null}
        </div>
      )
    }
  }

  return (
    <div
      className="snake-board-frame"
      style={{
        backgroundImage: `url(${SPRITE_DIR}/border_stone.webp)`,
        ...pixelated,
      }}
    >
      <div
        className="snake-board-grid"
        style={{
          gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
        }}
      >
        {cells}
        {bursts.map((b) => (
          <Burst key={b.id} x={b.x} y={b.y} board={board} />
        ))}
      </div>
    </div>
  )
}
