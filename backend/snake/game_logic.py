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
    
    # Replay a Snake game from a validated sequence of direction changes.

    # Expected action_log:
    # {
    #     "initial_direction": "RIGHT",
    #     "actions": [
    #         {"tick": 5, "direction": "UP"},
    #         {"tick": 12, "direction": "LEFT"}
    #     ],
    #     "total_ticks": 20
    # }
    
    if not isinstance(action_log, dict):
        raise ValueError("Action log must be a JSON object")

    initial_direction = action_log.get("initial_direction")
    actions = action_log.get("actions")
    total_ticks = action_log.get("total_ticks")

    if initial_direction != INITIAL_DIRECTION:
        raise ValueError("Invalid initial direction")

    if not isinstance(actions, list):
        raise ValueError("Actions must be a list")

    # bool is a subclass of int in Python, so explicitly reject it.
    if type(total_ticks) is not int or not 0 <= total_ticks <= 100_000:
        raise ValueError("Invalid total_ticks")

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

        if direction not in DIRECTIONS:
            raise ValueError("Invalid direction")

        previous_tick = tick

    rng = random.Random(seed)
    game = create_game(seed)

    # Keep track of the direction currently being followed.
    current_direction = INITIAL_DIRECTION
    action_index = 0

    for tick in range(1, total_ticks + 1):
        # Apply a direction change at the beginning of its tick.
        if (
            action_index < len(actions)
            and actions[action_index]["tick"] == tick
        ):
            new_direction = actions[action_index]["direction"]

            if new_direction == OPPOSITE[current_direction]:
                raise ValueError("Cannot reverse direction")

            current_direction = new_direction
            action_index += 1

        if game["status"] != "ACTIVE":
            raise ValueError("Actions continue after the game ended")

        move_snake(game, current_direction, rng)

    return game