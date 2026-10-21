export const BOARD = { width: 20, height: 20 };
export const POINTS = 10;

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type GameStatus = "ACTIVE" | "GAME_OVER" | "WON" | "QUIT";
export type Position = [number, number];

export interface Action {
  tick: number;
  direction: Direction;
}

export interface GameState {
  board: { width: number; height: number };
  snake: Position[];
  direction: Direction;
  apple: Position | null;
  score: number;
  apples_eaten: number;
  status: GameStatus;
  tick: number;
  actions: Action[];
}

export const INIT_DIR: Direction = "RIGHT";

const INIT_SNAKE: Position[] = [
  [5, 5],
  [4, 5],
  [3, 5],
];

export const DIR: Record<Direction, Position> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

export const OPP: Record<Direction, Direction> = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT",
};

export function randomFreeCell(snake: Position[]): Position | null {
  const occupied = new Set(snake.map(([x, y]) => `${x},${y}`));
  const free: Position[] = [];

  for (let x = 0; x < BOARD.width; x++) {
    for (let y = 0; y < BOARD.height; y++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push([x, y]);
      }
    }
  }

  return free.length
    ? free[Math.floor(Math.random() * free.length)]
    : null;
}

export function createGame(
  spawnApple: (snake: Position[]) => Position | null,
): GameState {
  const snake = INIT_SNAKE.map(([x, y]) => [x, y] as Position);

  return {
    board: { ...BOARD },
    snake,
    direction: INIT_DIR,
    apple: spawnApple(snake),
    score: 0,
    apples_eaten: 0,
    status: "ACTIVE",
    tick: 0,
    actions: [],
  };
}

export function moveSnake(
  game: GameState,
  action: Direction,
  spawnApple: (snake: Position[]) => Position | null,
): GameState {
  if (game.status !== "ACTIVE") {
    throw new Error("Game is not active");
  }

  if (!(action in DIR)) {
    throw new Error("Invalid direction");
  }

  if (action === OPP[game.direction]) {
    throw new Error("Cannot reverse direction");
  }

  const [dx, dy] = DIR[action];
  const [hx, hy] = game.snake[0];

  const x = hx + dx;
  const y = hy + dy;
  const tick = game.tick + 1;

  // Record direction changes, including changes that cause a collision.
  const actions =
    action !== game.direction
      ? [...game.actions, { tick, direction: action }]
      : game.actions;

  // Wall collision.
  if (
    x < 0 ||
    x >= game.board.width ||
    y < 0 ||
    y >= game.board.height
  ) {
    return { ...game, status: "GAME_OVER", tick, actions };
  }

  const ateApple =
    game.apple !== null &&
    game.apple[0] === x &&
    game.apple[1] === y;

  const bodyToCheck = ateApple
    ? game.snake
    : game.snake.slice(0, -1);

  // Self collision.
  if (bodyToCheck.some(([sx, sy]) => sx === x && sy === y)) {
    return { ...game, status: "GAME_OVER", tick, actions };
  }

  const snake: Position[] = [[x, y], ...game.snake];

  if (!ateApple) {
    snake.pop();
  }

  let apple = game.apple;
  let score = game.score;
  let apples_eaten = game.apples_eaten;
  let status: GameStatus = game.status;

  if (ateApple) {
    score += POINTS;
    apples_eaten += 1;
    apple = spawnApple(snake);

    if (apple === null) {
      status = "WON";
    }
  }

  return {
    ...game,
    snake,
    direction: action,
    apple,
    score,
    apples_eaten,
    status,
    tick,
    actions,
  };
}

// Same shape as the /end/ response's actions field.
export function getActionLog(game: GameState) {
  return {
    initial_direction: INIT_DIR,
    actions: game.actions,
    total_ticks: game.tick,
  };
}