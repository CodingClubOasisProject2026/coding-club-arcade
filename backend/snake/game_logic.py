import random

BOARD_WIDTH = 20
BOARD_HEIGHT = 20
POINTS_PER_APPLE = 10

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


def create_game(seed):
    # Create an initial game state using a deterministic random seed.
    rng = random.Random(seed)

    snake = [segment.copy() for segment in INITIAL_SNAKE]

    game = {
        "snake": snake,
        "direction": INITIAL_DIRECTION,
        "apple": generate_apple(snake, rng),
        "score": 0,
        "apples_eaten": 0,
        "status": "ACTIVE",
        "tick": 0,
        "rng": rng,
    }

    return game


def generate_apple(snake, rng):
    # Generate an apple at an unoccupied position.
    occupied = {tuple(segment) for segment in snake}

    available_positions = [
        [x, y]
        for x in range(BOARD_WIDTH)
        for y in range(BOARD_HEIGHT)
        if (x, y) not in occupied
    ]

    if not available_positions:
        return None

    return rng.choice(available_positions)


def move_snake(game, action, rng):
    # Process one movement tick.
    if game["status"] != "ACTIVE":
        raise ValueError("Game is not active")

    if action not in DIRECTIONS:
        raise ValueError("Invalid direction")

    if action == OPPOSITE[game["direction"]]:
        raise ValueError("Cannot reverse direction")

    dx, dy = DIRECTIONS[action]

    head_x, head_y = game["snake"][0]
    new_head = [head_x + dx, head_y + dy]

    x, y = new_head
    ate_apple = new_head == game["apple"]

    # The tail vacates its position unless the snake grows.
    body_to_check = (
        game["snake"]
        if ate_apple
        else game["snake"][:-1]
    )

    # Wall collision.
    if not (0 <= x < BOARD_WIDTH and 0 <= y < BOARD_HEIGHT):
        game["status"] = "GAME_OVER"
        game["tick"] += 1
        return game

    # Self-collision.
    if new_head in body_to_check:
        game["status"] = "GAME_OVER"
        game["tick"] += 1
        return game

    # Apply movement.
    game["direction"] = action
    game["snake"].insert(0, new_head)

    if ate_apple:
        game["score"] += POINTS_PER_APPLE
        game["apples_eaten"] += 1

        game["apple"] = generate_apple(game["snake"], rng)

        if game["apple"] is None:
            game["status"] = "WON"
    else:
        game["snake"].pop()

    game["tick"] += 1

    return game

def replay_actions(seed, action_log):
    if not isinstance(action_log, dict):
        raise ValueError("Action log must be a JSON object")

    initial_direction = action_log.get("initial_direction")
    actions = action_log.get("actions")
    total_ticks = action_log.get("total_ticks")
    end_reason = action_log.get("end_reason")

    if initial_direction != INITIAL_DIRECTION:
        raise ValueError("Invalid initial direction")

    if not isinstance(actions, list):
        raise ValueError("Actions must be a list")

    if type(total_ticks) is not int or not 0 <= total_ticks <= 100_000:
        raise ValueError("Invalid total_ticks")

    if end_reason not in {"QUIT", "COLLISION", "WON"}:
        raise ValueError("Invalid end_reason")

    # Validate the complete action log before replaying it.
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
    rng = game["rng"]

    current_direction = INITIAL_DIRECTION
    action_index = 0

    for tick in range(1, total_ticks + 1):
        # The game must still be active before processing this tick.
        if game["status"] != "ACTIVE":
            raise ValueError("Actions continue after the game ended")

        if (
            action_index < len(actions)
            and actions[action_index]["tick"] == tick
        ):
            new_direction = actions[action_index]["direction"]

            if new_direction == OPPOSITE[current_direction]:
                raise ValueError("Cannot reverse direction")

            current_direction = new_direction
            action_index += 1

        move_snake(game, current_direction, rng)

    # Validate that the submitted ending reason matches the replay.
    if end_reason == "COLLISION" and game["status"] != "GAME_OVER":
        raise ValueError("Replay did not end in a collision")

    if end_reason == "WON" and game["status"] != "WON":
        raise ValueError("Replay did not end in a win")

    if end_reason == "QUIT" and game["status"] != "ACTIVE":
        raise ValueError("Cannot quit after the game has already ended")

    # A quit is valid even if the snake was still alive.
    if end_reason == "QUIT":
        game["status"] = "QUIT"
        if game["status"] != "ACTIVE":
            raise ValueError("Actions continue after the game ended")

        move_snake(game, current_direction, rng)

    return game