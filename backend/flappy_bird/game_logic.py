import random


WORLD_WIDTH = 480
WORLD_HEIGHT = 640
SCALE = 1_000
BIRD_X = 120 * SCALE
BIRD_RADIUS = 14 * SCALE
PIPE_WIDTH = 80 * SCALE
PIPE_GAP = 180 * SCALE
PIPE_SPACING = 260 * SCALE
PIPE_SPEED = 3 * SCALE
GRAVITY = 350
FLAP_VELOCITY = -7_000
MAX_FALL_SPEED = 9_000
MAX_TICKS = 100_000


def create_game(seed):
    rng = random.Random(seed)
    pipes = [
        _create_pipe(x, rng)
        for x in (600 * SCALE, 860 * SCALE, 1_120 * SCALE)
    ]
    return {
        "bird_y": WORLD_HEIGHT * SCALE // 2,
        "velocity": 0,
        "pipes": pipes,
        "score": 0,
        "status": "ACTIVE",
        "tick": 0,
        "rng": rng,
    }


def _create_pipe(x, rng):
    return {
        "x": x,
        "gap_top": rng.randint(170, 470) * SCALE - PIPE_GAP // 2,
        "scored": False,
    }


def step_game(game, flap=False):
    if game["status"] != "ACTIVE":
        raise ValueError("Game is not active")

    if flap:
        game["velocity"] = FLAP_VELOCITY

    game["velocity"] = min(game["velocity"] + GRAVITY, MAX_FALL_SPEED)
    game["bird_y"] += game["velocity"]

    for pipe in game["pipes"]:
        pipe["x"] -= PIPE_SPEED
        if not pipe["scored"] and pipe["x"] + PIPE_WIDTH < BIRD_X:
            pipe["scored"] = True
            game["score"] += 1

    if game["pipes"][-1]["x"] <= WORLD_WIDTH * SCALE:
        game["pipes"].append(
            _create_pipe(
                game["pipes"][-1]["x"] + PIPE_SPACING,
                game["rng"],
            )
        )

    game["tick"] += 1

    if (
        game["bird_y"] - BIRD_RADIUS <= 0
        or game["bird_y"] + BIRD_RADIUS >= WORLD_HEIGHT * SCALE
        or any(_hits_pipe(game["bird_y"], pipe) for pipe in game["pipes"])
    ):
        game["status"] = "GAME_OVER"

    return game


def _hits_pipe(bird_y, pipe):
    bird_left = BIRD_X - BIRD_RADIUS
    bird_right = BIRD_X + BIRD_RADIUS
    pipe_left = pipe["x"]
    pipe_right = pipe_left + PIPE_WIDTH
    if bird_right <= pipe_left or bird_left >= pipe_right:
        return False

    gap_bottom = pipe["gap_top"] + PIPE_GAP
    return bird_y - BIRD_RADIUS < pipe["gap_top"] or bird_y + BIRD_RADIUS > gap_bottom


def replay_actions(seed, action_log):
    if not isinstance(action_log, dict):
        raise ValueError("Action log must be a JSON object")

    actions = action_log.get("actions")
    total_ticks = action_log.get("total_ticks")
    end_reason = action_log.get("end_reason")

    if not isinstance(actions, list):
        raise ValueError("Actions must be a list")
    if type(total_ticks) is not int or not 0 <= total_ticks <= MAX_TICKS:
        raise ValueError("Invalid total_ticks")
    if not isinstance(end_reason, str) or end_reason not in {"QUIT", "COLLISION"}:
        raise ValueError("Invalid end_reason")

    previous_tick = 0
    for action in actions:
        if not isinstance(action, dict):
            raise ValueError("Each action must be an object")
        tick = action.get("tick")
        if type(tick) is not int or not 1 <= tick <= total_ticks:
            raise ValueError("Invalid action tick")
        if tick <= previous_tick:
            raise ValueError("Action ticks must be strictly increasing")
        if action.get("action") != "FLAP":
            raise ValueError("Invalid action")
        previous_tick = tick

    game = create_game(seed)
    action_index = 0
    for tick in range(1, total_ticks + 1):
        if game["status"] != "ACTIVE":
            raise ValueError("Actions continue after the game ended")

        flap = (
            action_index < len(actions)
            and actions[action_index]["tick"] == tick
        )
        if flap:
            action_index += 1

        step_game(game, flap=flap)

    if end_reason == "COLLISION" and game["status"] != "GAME_OVER":
        raise ValueError("Replay did not end in a collision")
    if end_reason == "QUIT" and game["status"] != "ACTIVE":
        raise ValueError("Cannot quit after the game has ended")
    if end_reason == "QUIT":
        game["status"] = "QUIT"

    return game
