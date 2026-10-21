"""Deterministic Pac-Man engine used to verify submitted runs.

Line-for-line port of frontend/src/games/pacman/engine.ts. Any rule change must
be made in both files and ENGINE_VERSION bumped; the fixture tests in
pacman/tests.py fail if the two drift apart.
"""

ENGINE_VERSION = 1
TICKS_PER_SECOND = 60
COLS = 28
ROWS = 31
UNIT = 8

# '#' wall, '-' ghost door, '.' pellet, 'o' power pellet, ' ' empty.
MAZE = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "     #.##### ## #####.#     ",
    "     #.##          ##.#     ",
    "     #.## ###--### ##.#     ",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "     #.## ######## ##.#     ",
    "     #.##          ##.#     ",
    "     #.## ######## ##.#     ",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##.......  .......##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
]

DIRS = ("U", "L", "D", "R")
DX = {"U": 0, "L": -1, "D": 0, "R": 1}
DY = {"U": -1, "L": 0, "D": 1, "R": 0}
OPP = {"U": "D", "L": "R", "D": "U", "R": "L"}

TUNNEL_ROW = 14
WRAP = (COLS + 2) * UNIT
HOUSE_DOOR_X = 13 * UNIT + 4
HOUSE_EXIT_Y = 11 * UNIT
HOUSE_MID_Y = 14 * UNIT
READY_TICKS = 120
EYES_SPEED = 200
HOUSE_SPEED = 60
NO_UP_TILES = {(12, 11), (15, 11), (12, 23), (15, 23)}

GHOST_NAMES = ("blinky", "pinky", "inky", "clyde")
GHOST_START = {
    "blinky": (13 * UNIT + 4, 11 * UNIT, "active"),
    "pinky": (13 * UNIT + 4, 14 * UNIT, "house"),
    "inky": (11 * UNIT + 4, 14 * UNIT, "house"),
    "clyde": (15 * UNIT + 4, 14 * UNIT, "house"),
}
SCATTER_TARGET = {
    "blinky": (25, -3),
    "pinky": (2, -3),
    "inky": (27, 31),
    "clyde": (0, 31),
}
RELEASE = {
    "blinky": (0, 0),
    "pinky": (0, 0),
    "inky": (360, 30),
    "clyde": (600, 60),
}


def speeds(level):
    if level == 1:
        return {"pac": 100, "pacFright": 112, "ghost": 94, "ghostFright": 62, "tunnel": 50}
    if level <= 4:
        return {"pac": 112, "pacFright": 119, "ghost": 106, "ghostFright": 69, "tunnel": 56}
    return {"pac": 125, "pacFright": 125, "ghost": 119, "ghostFright": 75, "tunnel": 62}


def fright_ticks(level):
    return max(60, 420 - level * 60)


def mode_schedule(level):
    s = TICKS_PER_SECOND
    if level == 1:
        return [7 * s, 20 * s, 7 * s, 20 * s, 5 * s, 20 * s, 5 * s]
    if level <= 4:
        return [7 * s, 20 * s, 7 * s, 20 * s, 5 * s, 20 * s, 1 * s]
    return [5 * s, 20 * s, 5 * s, 20 * s, 5 * s, 20 * s, 1 * s]


def seed_to_rng(seed):
    value = int(seed) & 0xFFFFFFFF
    return value or 0x6D2B79F5


def next_random(state):
    x = state["rng"]
    x ^= (x << 13) & 0xFFFFFFFF
    x ^= x >> 17
    x ^= (x << 5) & 0xFFFFFFFF
    x &= 0xFFFFFFFF
    state["rng"] = x
    return x


def tile_at(tx, ty):
    if ty == TUNNEL_ROW and (tx < 0 or tx >= COLS):
        return " "
    if ty < 0 or ty >= ROWS or tx < 0 or tx >= COLS:
        return "#"
    return MAZE[ty][tx]


def pac_can_enter(tx, ty):
    t = tile_at(tx, ty)
    return t != "#" and t != "-"


def at_center(x, y):
    return x % UNIT == 0 and y % UNIT == 0


def tile_of(v):
    return (v + UNIT // 2) // UNIT


def wrap(e):
    if e["x"] < -UNIT:
        e["x"] += WRAP
    elif e["x"] > COLS * UNIT:
        e["x"] -= WRAP


def initial_pellets():
    pellets = []
    count = 0
    for row in MAZE:
        for ch in row:
            v = 1 if ch == "." else 2 if ch == "o" else 0
            pellets.append(v)
            if v:
                count += 1
    return pellets, count


def reset_actors(state):
    want = state["pac"]["want"] if state.get("pac") else "L"
    state["pac"] = {"x": 13 * UNIT + 4, "y": 23 * UNIT, "dir": "L", "want": want, "acc": 0}
    state["ghosts"] = [
        {
            "name": name,
            "x": GHOST_START[name][0],
            "y": GHOST_START[name][1],
            "dir": "L" if name == "blinky" else "U",
            "state": GHOST_START[name][2],
            "frightened": False,
            "reverse": False,
            "acc": 0,
        }
        for name in GHOST_NAMES
    ]
    state["freeze"] = READY_TICKS
    state["dotsEaten"] = 0
    state["activeTicks"] = 0
    state["modeIndex"] = 0
    state["modeTimer"] = 0
    state["frightTimer"] = 0
    state["combo"] = 0


def create_game(seed):
    pellets, count = initial_pellets()
    state = {
        "tick": 0,
        "score": 0,
        "level": 1,
        "lives": 3,
        "over": False,
        "pellets": pellets,
        "pelletsLeft": count,
        "rng": seed_to_rng(seed),
    }
    reset_actors(state)
    return state


def ghost_target(state, g):
    if g["state"] == "eyes":
        return (13, 11)
    if state["modeIndex"] % 2 == 0:
        return SCATTER_TARGET[g["name"]]
    pac = state["pac"]
    px = tile_of(pac["x"])
    py = tile_of(pac["y"])
    d = pac["dir"]
    name = g["name"]
    if name == "blinky":
        return (px, py)
    if name == "pinky":
        return (px + DX[d] * 4 - (4 if d == "U" else 0), py + DY[d] * 4)
    if name == "inky":
        ax = px + DX[d] * 2 - (2 if d == "U" else 0)
        ay = py + DY[d] * 2
        blinky = state["ghosts"][0]
        return (2 * ax - tile_of(blinky["x"]), 2 * ay - tile_of(blinky["y"]))
    gx = tile_of(g["x"])
    gy = tile_of(g["y"])
    dist = (gx - px) * (gx - px) + (gy - py) * (gy - py)
    return (px, py) if dist > 64 else SCATTER_TARGET["clyde"]


def choose_ghost_dir(state, g):
    tx = g["x"] // UNIT
    ty = g["y"] // UNIT
    options = []
    for d in DIRS:
        if d == OPP[g["dir"]]:
            continue
        if not pac_can_enter(tx + DX[d], ty + DY[d]):
            continue
        if d == "U" and g["state"] == "active" and not g["frightened"] and (tx, ty) in NO_UP_TILES:
            continue
        options.append(d)
    if not options:
        g["dir"] = OPP[g["dir"]]
        return
    if g["frightened"] and g["state"] == "active":
        start = next_random(state) % 4
        for i in range(4):
            d = DIRS[(start + i) % 4]
            if d in options:
                g["dir"] = d
                return
    target_x, target_y = ghost_target(state, g)
    best = options[0]
    best_dist = float("inf")
    for d in options:
        nx = tx + DX[d] - target_x
        ny = ty + DY[d] - target_y
        dist = nx * nx + ny * ny
        if dist < best_dist:
            best = d
            best_dist = dist
    g["dir"] = best


def ghost_speed(state, g):
    sp = speeds(state["level"])
    if g["state"] in ("eyes", "enter"):
        return EYES_SPEED
    if g["state"] in ("exit", "house"):
        return HOUSE_SPEED
    ty = tile_of(g["y"])
    tx = tile_of(g["x"])
    if ty == TUNNEL_ROW and (tx <= 5 or tx >= 22):
        return sp["tunnel"]
    return sp["ghostFright"] if g["frightened"] else sp["ghost"]


def step_ghost(state, g):
    if g["state"] == "house":
        return
    if g["state"] == "exit":
        if g["x"] != HOUSE_DOOR_X:
            g["x"] += 1 if g["x"] < HOUSE_DOOR_X else -1
        elif g["y"] > HOUSE_EXIT_Y:
            g["y"] -= 1
        else:
            g["state"] = "active"
            g["dir"] = "L"
        return
    if g["state"] == "enter":
        if g["x"] != HOUSE_DOOR_X:
            g["x"] += 1 if g["x"] < HOUSE_DOOR_X else -1
        elif g["y"] < HOUSE_MID_Y:
            g["y"] += 1
        else:
            g["state"] = "exit"
            g["frightened"] = False
        return
    if at_center(g["x"], g["y"]):
        if g["state"] == "eyes" and g["y"] == HOUSE_EXIT_Y and g["x"] in (13 * UNIT, 14 * UNIT):
            g["state"] = "enter"
            return
        choose_ghost_dir(state, g)
    g["x"] += DX[g["dir"]]
    g["y"] += DY[g["dir"]]
    wrap(g)


def step_pac(state):
    p = state["pac"]
    if at_center(p["x"], p["y"]):
        tx = p["x"] // UNIT
        ty = p["y"] // UNIT
        if pac_can_enter(tx + DX[p["want"]], ty + DY[p["want"]]):
            p["dir"] = p["want"]
        if not pac_can_enter(tx + DX[p["dir"]], ty + DY[p["dir"]]):
            return
    elif p["want"] == OPP[p["dir"]]:
        p["dir"] = p["want"]
    p["x"] += DX[p["dir"]]
    p["y"] += DY[p["dir"]]
    wrap(p)


def eat(state):
    tx = tile_of(state["pac"]["x"])
    ty = tile_of(state["pac"]["y"])
    if tx < 0 or tx >= COLS:
        return
    i = ty * COLS + tx
    v = state["pellets"][i]
    if not v:
        return
    state["pellets"][i] = 0
    state["pelletsLeft"] -= 1
    state["dotsEaten"] += 1
    if v == 1:
        state["score"] += 10
        return
    state["score"] += 50
    state["combo"] = 0
    state["frightTimer"] = fright_ticks(state["level"])
    for g in state["ghosts"]:
        if g["state"] in ("eyes", "enter"):
            continue
        g["frightened"] = True
        if g["state"] == "active":
            g["reverse"] = True


def collide(state):
    px = tile_of(state["pac"]["x"])
    py = tile_of(state["pac"]["y"])
    for g in state["ghosts"]:
        if g["state"] != "active":
            continue
        if tile_of(g["x"]) != px or tile_of(g["y"]) != py:
            continue
        if g["frightened"]:
            state["score"] += 200 << min(state["combo"], 3)
            state["combo"] += 1
            g["frightened"] = False
            g["state"] = "eyes"
            continue
        state["lives"] -= 1
        if state["lives"] <= 0:
            state["over"] = True
        else:
            reset_actors(state)
        return True
    return False


def update_modes(state):
    if state["frightTimer"] > 0:
        state["frightTimer"] -= 1
        if state["frightTimer"] == 0:
            state["combo"] = 0
            for g in state["ghosts"]:
                g["frightened"] = False
        return
    schedule = mode_schedule(state["level"])
    if state["modeIndex"] >= len(schedule):
        return
    state["modeTimer"] += 1
    if state["modeTimer"] < schedule[state["modeIndex"]]:
        return
    state["modeIndex"] += 1
    state["modeTimer"] = 0
    for g in state["ghosts"]:
        if g["state"] == "active":
            g["reverse"] = True


def release_ghosts(state):
    for g in state["ghosts"]:
        if g["state"] != "house":
            continue
        ticks, dots = RELEASE[g["name"]]
        if state["activeTicks"] >= ticks or state["dotsEaten"] >= dots:
            g["state"] = "exit"


def advance(acc, speed):
    total = acc + speed
    return total // 100, total % 100


def step(state, input_dir=None):
    if state["over"]:
        return
    state["tick"] += 1
    if input_dir:
        state["pac"]["want"] = input_dir
    if state["freeze"] > 0:
        state["freeze"] -= 1
        return
    state["activeTicks"] += 1
    update_modes(state)
    release_ghosts(state)

    sp = speeds(state["level"])
    pac_steps, state["pac"]["acc"] = advance(
        state["pac"]["acc"], sp["pacFright"] if state["frightTimer"] > 0 else sp["pac"]
    )
    for _ in range(pac_steps):
        step_pac(state)
        eat(state)
    if state["pelletsLeft"] == 0:
        state["level"] += 1
        state["pellets"], state["pelletsLeft"] = initial_pellets()
        reset_actors(state)
        return
    if collide(state):
        return

    for g in state["ghosts"]:
        if g["reverse"]:
            g["reverse"] = False
            g["dir"] = OPP[g["dir"]]
        ghost_steps, g["acc"] = advance(g["acc"], ghost_speed(state, g))
        for _ in range(ghost_steps):
            step_ghost(state, g)
    collide(state)


MAX_INPUTS = 20_000
MAX_TICKS = 30 * 60 * TICKS_PER_SECOND


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_log(log):
    """Check the shape of a submitted log. Raises ValueError with a reason."""
    if not isinstance(log, dict):
        raise ValueError("Action log must be an object.")
    if log.get("version") != ENGINE_VERSION:
        raise ValueError("Unsupported engine version.")
    inputs = log.get("inputs")
    total_ticks = log.get("total_ticks")
    claimed = log.get("claimed_score")
    if not isinstance(inputs, list):
        raise ValueError("inputs must be a list.")
    if len(inputs) > MAX_INPUTS:
        raise ValueError("Too many inputs.")
    if not _is_int(total_ticks) or not 0 < total_ticks <= MAX_TICKS:
        raise ValueError("total_ticks is out of range.")
    if not _is_int(claimed) or claimed < 0:
        raise ValueError("claimed_score must be a non-negative integer.")
    previous = 0
    for entry in inputs:
        if not isinstance(entry, list) or len(entry) != 2:
            raise ValueError("Each input must be [tick, direction].")
        tick, direction = entry
        if not _is_int(tick) or tick < 1 or tick > total_ticks:
            raise ValueError("Input tick is out of range.")
        if tick < previous:
            raise ValueError("Input ticks must be non-decreasing.")
        if direction not in DIRS:
            raise ValueError("Input direction is invalid.")
        previous = tick


def replay(seed, log):
    """Replay a validated log. Returns the final state or raises ValueError."""
    validate_log(log)
    inputs = log["inputs"]
    total_ticks = log["total_ticks"]
    state = create_game(seed)
    i = 0
    while state["tick"] < total_ticks:
        if state["over"]:
            raise ValueError("Inputs continue after game over.")
        next_tick = state["tick"] + 1
        direction = None
        while i < len(inputs) and inputs[i][0] == next_tick:
            direction = inputs[i][1]
            i += 1
        step(state, direction)
    if not state["over"]:
        raise ValueError("The run does not end in game over.")
    if state["score"] != log["claimed_score"]:
        raise ValueError("Claimed score does not match the replay.")
    return state
