export const BOARD = { width: 20, height: 20 };
export const POINTS = 10;
export const INIT_DIR = "RIGHT";

const INIT_SNAKE = [[5, 5], [4, 5], [3, 5]];

export const DIR = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

export const OPP = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };


export function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


export function generateApple(snake, rng) {
  const occupied = new Set(snake.map(([x, y]) => `${x},${y}`));
  const free = [];
  for (let x = 0; x < BOARD.width; x++) {
    for (let y = 0; y < BOARD.height; y++) {
      if (!occupied.has(`${x},${y}`)) free.push([x, y]);
    }
  }
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}

export function createGame(rng) {
  const snake = INIT_SNAKE.map((s) => [...s]);
  return {
    board: { ...BOARD },
    snake,
    direction: INIT_DIR,
    apple: generateApple(snake, rng),
    score: 0,
    apples_eaten: 0,
    status: "ACTIVE", // ACTIVE | GAME_OVER | WON
    tick: 0,
    actions: [], // direction changes, same format the backend replays
  };
}


export function moveSnake(game, action, rng) {
  if (game.status !== "ACTIVE") throw new Error("Game is not active");
  if (!DIR[action]) throw new Error("Invalid direction");
  if (action === OPP[game.direction]) throw new Error("Cannot reverse direction");

  const [dx, dy] = DIR[action];
  const [hx, hy] = game.snake[0];
  const x = hx + dx;
  const y = hy + dy;

  const tick = game.tick + 1;
  // logs every direction change including a fatal one so a replay dies on the same tick
  const actions =
    action !== game.direction ? [...game.actions, { tick, direction: action }] : game.actions;

  if (x < 0 || x >= game.board.width || y < 0 || y >= game.board.height) {
    return { ...game, status: "GAME_OVER", tick, actions };
  }

  const ateApple = !!game.apple && game.apple[0] === x && game.apple[1] === y;

  const bodyToCheck = ateApple ? game.snake : game.snake.slice(0, -1);
  if (bodyToCheck.some(([sx, sy]) => sx === x && sy === y)) {
    return { ...game, status: "GAME_OVER", tick, actions };
  }

  const snake = [[x, y], ...game.snake];
  if (!ateApple) snake.pop();

  let { apple, score, apples_eaten, status } = game;
  if (ateApple) {
    score += POINTS;
    apples_eaten += 1;
    apple = generateApple(snake, rng);
    if (apple === null) status = "WON";
  }

  return { ...game, snake, direction: action, apple, score, apples_eaten, status, tick, actions };
}

// Same shape as the /end/ response's `actions` field.
export function getActionLog(game) {
  return {
    initial_direction: INIT_DIR,
    actions: game.actions,
    total_ticks: game.tick,
  };
}