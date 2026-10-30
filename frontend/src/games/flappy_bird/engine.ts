// Port of backend/flappy_bird/game_logic.py. The backend replays the recorded
// log with that file to verify the score, so rule changes must be made in both.
export const SCALE = 1000;
export const WORLD_WIDTH = 480 * SCALE;
export const WORLD_HEIGHT = 640 * SCALE;
export const BIRD_X = 120 * SCALE;
export const BIRD_RADIUS = 14 * SCALE;
export const PIPE_WIDTH = 80 * SCALE;
export const PIPE_GAP = 180 * SCALE;
export const PIPE_SPACING = 260 * SCALE;
export const PIPE_SPEED = 3 * SCALE;
// Pipes speed up a little with each point, up to MAX_PIPE_SPEED.
export const PIPE_SPEED_PER_POINT = 40;
export const MAX_PIPE_SPEED = 6 * SCALE;
export const GRAVITY = 350;
export const FLAP_VELOCITY = -7000;
export const MAX_FALL_SPEED = 9000;
export const MAX_TICKS = 100000;
export const TICK_MS = 1000 / 60;

const INITIAL_PIPE_X = [600 * SCALE, 860 * SCALE, 1120 * SCALE];
const GAP_MIN = 170;
const GAP_MAX = 470;

export type Pipe = { x: number; gap_top: number; scored: boolean };
export type GameState = {
  bird_y: number;
  velocity: number;
  pipes: Pipe[];
  score: number;
  status: "ACTIVE" | "GAME_OVER" | "QUIT";
  tick: number;
  rng: number;
};
export type ActionLog = {
  actions: { tick: number; action: "FLAP" }[];
  total_ticks: number;
  end_reason: "COLLISION" | "QUIT";
};

// Seeds are 63-bit, so they arrive as strings. Keep the low 32 bits, like seed_to_rng.
export function seedToRng(seed: string | number | bigint): number {
  const value = Number(BigInt(seed) & 0xffffffffn);
  return value === 0 ? 0x6d2b79f5 : value;
}

// xorshift32, same as next_random in game_logic.py.
function nextRandom(game: GameState): number {
  let x = game.rng;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  game.rng = x;
  return x;
}

function createPipe(x: number, game: GameState): Pipe {
  const gapTop = GAP_MIN + (nextRandom(game) % (GAP_MAX - GAP_MIN + 1));
  return {
    x: x,
    gap_top: gapTop * SCALE - Math.floor(PIPE_GAP / 2),
    scored: false,
  };
}

export function createGame(seed: string | number | bigint): GameState {
  const game: GameState = {
    bird_y: Math.floor(WORLD_HEIGHT / 2),
    velocity: 0,
    pipes: [],
    score: 0,
    status: "ACTIVE",
    tick: 0,
    rng: seedToRng(seed),
  };
  game.pipes = INITIAL_PIPE_X.map((x) => createPipe(x, game));
  return game;
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

export function pipeSpeed(score: number): number {
  return Math.min(PIPE_SPEED + score * PIPE_SPEED_PER_POINT, MAX_PIPE_SPEED);
}

export function stepGame(game: GameState, flap: boolean) {
  if (game.status !== "ACTIVE") return game;

  if (flap) game.velocity = FLAP_VELOCITY;

  game.velocity = Math.min(game.velocity + GRAVITY, MAX_FALL_SPEED);
  game.bird_y += game.velocity;

  const speed = pipeSpeed(game.score);
  for (const pipe of game.pipes) {
    pipe.x -= speed;
    if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.scored = true;
      game.score += 1;
    }
  }

  const lastPipe = game.pipes[game.pipes.length - 1];
  if (lastPipe.x <= WORLD_WIDTH) {
    game.pipes.push(createPipe(lastPipe.x + PIPE_SPACING, game));
  }

  game.tick += 1;

  const hitGroundOrCeil = game.bird_y - BIRD_RADIUS <= 0 || game.bird_y + BIRD_RADIUS >= WORLD_HEIGHT;
  const hitAnyPipe = game.pipes.some((p) => hitsPipe(game.bird_y, p));

  if (hitGroundOrCeil || hitAnyPipe) {
    game.status = "GAME_OVER";
  }

  return game;
}
