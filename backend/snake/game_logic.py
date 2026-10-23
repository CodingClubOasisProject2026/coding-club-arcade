"""Snake rules, used by the Celery task to replay and verify a submitted run.

frontend/src/games/snake/engine.ts is a line-for-line port of this file.
Any rule change must be made in both, or verified scores will diverge.
"""

BOARD_WIDTH = 20
BOARD_HEIGHT = 20
POINTS_PER_APPLE = 10
MAX_TICKS = 100_000

# Tick speed. The frontend waits this long before each tick, so a run can't
# legitimately finish faster than the sum of these delays.
BASE_TICK_MS = 150
MIN_TICK_MS = 90
SPEEDUP_PER_APPLE_MS = 4

INITIAL_SNAKE = [[5, 5], [4, 5], [3, 5]]
INITIAL_DIRECTION = "RIGHT"

DIRECTIONS = {
    "UP": (0, -1),
    "DOWN": (0, 1),
    "LEFT": (-1, 0),
    "RIGHT": (1, 0),
}

OPPOSITE = {
    "UP": "DOWN",
    "DOWN": "UP",
    "LEFT": "RIGHT",
    "RIGHT": "LEFT",
}


def seed_to_rng(seed):
    # xorshift32 state; must be nonzero.
    value = int(seed) & 0xFFFFFFFF
    return value or 0x6D2B79F5


def next_random(game):
    x = game["rng"]
    x ^= (x << 13) & 0xFFFFFFFF
    x ^= x >> 17
    x ^= (x << 5) & 0xFFFFFFFF
    x &= 0xFFFFFFFF
    game["rng"] = x
    return x


def tick_delay_ms(apples_eaten):
    return max(MIN_TICK_MS, BASE_TICK_MS - apples_eaten * SPEEDUP_PER_APPLE_MS)


def create_game(seed):
    game = {
        "snake": [segment.copy() for segment in INITIAL_SNAKE],
        "direction": INITIAL_DIRECTION,
        "apple": None,
        "score": 0,
        "apples_eaten": 0,
        "status": "ACTIVE",
        "tick": 0,
        "min_ms": 0,
        "rng": seed_to_rng(seed),
    }
    game["apple"] = generate_apple(game)
    return game


def generate_apple(game):
    # Pick a free cell, scanning column by column (x outer, y inner).
    occupied = {tuple(segment) for segment in game["snake"]}
    free = [
        [x, y]
        for x in range(BOARD_WIDTH)
        for y in range(BOARD_HEIGHT)
        if (x, y) not in occupied
    ]
    if not free:
        return None
    return free[next_random(game) % len(free)]


def move_snake(game, direction):
    """Advance one tick in the given direction."""
    if game["status"] != "ACTIVE":
        raise ValueError("Game is not active")
    if direction not in DIRECTIONS:
        raise ValueError("Invalid direction")
    if direction == OPPOSITE[game["direction"]]:
        raise ValueError("Cannot reverse direction")

    game["min_ms"] += tick_delay_ms(game["apples_eaten"])
    game["tick"] += 1

    dx, dy = DIRECTIONS[direction]
    head_x, head_y = game["snake"][0]
    new_head = [head_x + dx, head_y + dy]
    x, y = new_head
    ate_apple = new_head == game["apple"]

    # The tail moves out of the way unless the snake grows.
    body = game["snake"] if ate_apple else game["snake"][:-1]

    if not (0 <= x < BOARD_WIDTH and 0 <= y < BOARD_HEIGHT) or new_head in body:
        game["status"] = "GAME_OVER"
        return game

    game["direction"] = direction
    game["snake"].insert(0, new_head)

    if ate_apple:
        game["score"] += POINTS_PER_APPLE
        game["apples_eaten"] += 1
        game["apple"] = generate_apple(game)
        if game["apple"] is None:
            game["status"] = "WON"
    else:
        game["snake"].pop()

    return game


def replay_actions(seed, action_log):
    """Replay a submitted log and return the final game, or raise ValueError.

    Log format:
        {
          "actions": [{"tick": 12, "direction": "UP"}, ...],  # direction changes
          "total_ticks": 250,
          "end_reason": "COLLISION" | "WON" | "QUIT",
        }
    An action at tick N takes effect on the move that brings the game to tick N.
    """
    if not isinstance(action_log, dict):
        raise ValueError("Action log must be a JSON object")

    actions = action_log.get("actions")
    total_ticks = action_log.get("total_ticks")
    end_reason = action_log.get("end_reason")

    if not isinstance(actions, list):
        raise ValueError("Actions must be a list")
    if type(total_ticks) is not int or not 0 <= total_ticks <= MAX_TICKS:
        raise ValueError("Invalid total_ticks")
    if end_reason not in {"QUIT", "COLLISION", "WON"}:
        raise ValueError("Invalid end_reason")

    previous_tick = 0
    for action in actions:
        if not isinstance(action, dict):
            raise ValueError("Each action must be an object")
        tick = action.get("tick")
        direction = action.get("direction")
        if type(tick) is not int or not 1 <= tick <= total_ticks:
            raise ValueError("Invalid action tick")
        if tick <= previous_tick:
            raise ValueError("Action ticks must be strictly increasing")
        if not isinstance(direction, str) or direction not in DIRECTIONS:
            raise ValueError("Invalid direction")
        previous_tick = tick

    game = create_game(seed)
    direction = INITIAL_DIRECTION
    action_index = 0

    for tick in range(1, total_ticks + 1):
        if game["status"] != "ACTIVE":
            raise ValueError("Actions continue after the game ended")
        if action_index < len(actions) and actions[action_index]["tick"] == tick:
            direction = actions[action_index]["direction"]
            action_index += 1
        move_snake(game, direction)

    if end_reason == "COLLISION" and game["status"] != "GAME_OVER":
        raise ValueError("Replay did not end in a collision")
    if end_reason == "WON" and game["status"] != "WON":
        raise ValueError("Replay did not end in a win")
    if end_reason == "QUIT":
        if game["status"] != "ACTIVE":
            raise ValueError("Cannot quit after the game has already ended")
        game["status"] = "QUIT"

    return game
