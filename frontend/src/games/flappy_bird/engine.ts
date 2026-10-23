export const SCALE = 1000;
export const WORLD_WIDTH = 480 * SCALE;
export const WORLD_HEIGHT = 640 * SCALE;
export const BIRD_X = 120 * SCALE;
export const BIRD_RADIUS = 14 * SCALE;
export const PIPE_WIDTH = 80 * SCALE;
export const PIPE_GAP = 180 * SCALE;
export const PIPE_SPACING = 260 * SCALE;
export const PIPE_SPEED = 3 * SCALE;
export const GRAVITY = 350;
export const FLAP_VELOCITY = -7000;
export const MAX_FALL_SPEED = 9000;
export const MAX_TICKS = 100000;

// Deterministic RNG (Matches Python's randint bounds)
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randint(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export type Pipe = { x: number; gap_top: number; scored: boolean };
export type GameState = {
  bird_y: number;
  velocity: number;
  pipes: Pipe[];
  score: number;
  status: "ACTIVE" | "GAME_OVER" | "QUIT";
  tick: number;
  rng: () => number;
};
export type ActionLog = {
  actions: { tick: number; action: "FLAP" }[];
  total_ticks: number;
  end_reason: "COLLISION" | "QUIT";
};

function createPipe(x: number, rng: () => number): Pipe {
  return {
    x: x,
    gap_top: randint(rng, 170, 470) * SCALE - Math.floor(PIPE_GAP / 2),
    scored: false,
  };
}

export function createGame(seed: number): GameState {
  const rng = mulberry32(seed);
  const pipes = [
    createPipe(600 * SCALE, rng),
    createPipe(860 * SCALE, rng),
    createPipe(1120 * SCALE, rng),
  ];

  return {
    bird_y: Math.floor((WORLD_HEIGHT) / 2),
    velocity: 0,
    pipes,
    score: 0,
    status: "ACTIVE",
    tick: 0,
    rng,
  };
}

function hitsPipe(bird_y: number, pipe: Pipe): boolean {
  const bird_left = BIRD_X - BIRD_RADIUS;
  const bird_right = BIRD_X + BIRD_RADIUS;
  const pipe_left = pipe.x;
  const pipe_right = pipe_left + PIPE_WIDTH;

  if (bird_right <= pipe_left || bird_left >= pipe_right) return false;

  const gap_bottom = pipe.gap_top + PIPE_GAP;
  return bird_y - BIRD_RADIUS < pipe.gap_top || bird_y + BIRD_RADIUS > gap_bottom;
}

export function stepGame(game: GameState, flap: boolean) {
  if (game.status !== "ACTIVE") return game;

  if (flap) game.velocity = FLAP_VELOCITY;

  game.velocity = Math.min(game.velocity + GRAVITY, MAX_FALL_SPEED);
  game.bird_y += game.velocity;

  for (const pipe of game.pipes) {
    pipe.x -= PIPE_SPEED;
    if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.scored = true;
      game.score += 1;
    }
  }

  const lastPipe = game.pipes[game.pipes.length - 1];
  if (lastPipe.x <= WORLD_WIDTH) {
    game.pipes.push(createPipe(lastPipe.x + PIPE_SPACING, game.rng));
  }

  game.tick += 1;

  const hitGroundOrCeil = game.bird_y - BIRD_RADIUS <= 0 || game.bird_y + BIRD_RADIUS >= WORLD_HEIGHT;
  const hitAnyPipe = game.pipes.some((p) => hitsPipe(game.bird_y, p));

  if (hitGroundOrCeil || hitAnyPipe) {
    game.status = "GAME_OVER";
  }

  return game;
}