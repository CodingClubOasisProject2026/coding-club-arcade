export const BOARD = { width: 20, height: 20 }
export const POINTS = 10
export const INIT_DIR = 'RIGHT'

export const INIT_SNAKE: [number, number][] = [
  [5, 5],
  [4, 5],
  [3, 5],
]

export const DIR: Record<string, [number, number]> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
}

export const OPP: Record<string, string> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
}

export function createPreviewGame() {
  return {
    board: { ...BOARD },
    snake: INIT_SNAKE.map(([x, y]) => [x, y] as [number, number]),
    direction: INIT_DIR,
    apple: [10, 5] as [number, number] | null,
    score: 0,
    apples_eaten: 0,
    status: 'ACTIVE',
    tick: 0,
    actions: [],
  }
}
