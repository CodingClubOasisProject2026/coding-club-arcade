import random
from typing import NamedTuple

# Caps how many requests a single game can take (flags are free, so this
# stops endless flag toggling).
MAX_MOVES = 30_000


class Config(NamedTuple):
    width: int
    height: int
    mine_count: int
    time_limit: int  # seconds, counted from the first reveal
    move_limit: int  # reveals, chords and sonar pings; flags are free
    powerups: int  # power-ups hidden on safe tiles


DIFFICULTIES = {
    "beginner": Config(9, 9, 10, time_limit=90, move_limit=45, powerups=2),
    "intermediate": Config(11, 11, 19, time_limit=150, move_limit=75, powerups=3),
    "expert": Config(13, 13, 35, time_limit=240, move_limit=120, powerups=4),
}

SHIELD, SONAR, EXTENDER = "shield", "sonar", "extender"
POWERUP_TYPES = (SHIELD, SONAR, EXTENDER)

# What one extender adds.
EXTEND_SECONDS = 20
EXTEND_MOVES = 10

# Score bonuses on a win.
POINTS_PER_MINE = 10
POINTS_PER_SECOND_LEFT = 1
POINTS_PER_MOVE_LEFT = 2


def neighbors(idx, w, h):
    x, y = idx % w, idx // w
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h:
                yield (y + dy) * w + (x + dx)


def set_mines(game, idx):
    w, h = game.width, game.height

    safe = set(neighbors(idx, w, h)) | {idx}

    cells = [i for i in range(w * h) if i not in safe]
    random.Random(game.seed).shuffle(cells)
    return sorted(cells[: game.mine_count])


def set_powerups(game, idx, count):
    """Hide `count` power-ups on safe tiles outside the opening 3x3.

    Returns [[cell, type], ...]. Uses its own seeded generator so the layout is
    repeatable for a seed without changing where the mines go.
    """
    w, h = game.width, game.height
    blocked = set(game.mines) | set(neighbors(idx, w, h)) | {idx}
    cells = [i for i in range(w * h) if i not in blocked]

    rng = random.Random(f"{game.seed}:powerups")
    rng.shuffle(cells)
    # Cycle through a shuffled order of types so small boards get a mix.
    types = list(POWERUP_TYPES)
    rng.shuffle(types)
    return sorted(
        [cell, types[n % len(types)]] for n, cell in enumerate(cells[:count])
    )


def count(game_mines, idx, w, h):
    return sum(1 for n in neighbors(idx, w, h) if n in game_mines)


def reveal(game, idx, mines):
    revealed, flagged = set(game.revealed), set(game.flagged)
    out, stack = [], [idx]
    while stack:
        i = stack.pop()
        if i in revealed or i in flagged:
            continue
        revealed.add(i)
        n = count(mines, i, game.width, game.height)
        out.append([i, n])
        if n == 0:
            stack.extend(neighbors(i, game.width, game.height))
    game.revealed = sorted(revealed)
    return out


def collect(game, cells):
    """Pick up any power-ups under newly opened cells and apply them.

    Returns the [[cell, type], ...] picked up by this move.
    """
    opened = {i for i, _ in cells}
    picked = [p for p in game.powerups if p[0] in opened]
    if not picked:
        return []
    game.powerups = [p for p in game.powerups if p[0] not in opened]
    game.found = sorted(game.found + picked)
    for _, kind in picked:
        if kind == SHIELD:
            game.shields += 1
        elif kind == SONAR:
            game.sonars += 1
        elif kind == EXTENDER:
            game.bonus_seconds += EXTEND_SECONDS
            game.bonus_moves += EXTEND_MOVES
    return picked


def sonar(game, idx):
    """Mark every mine in the 3x3 around idx as detected. Returns the new ones."""
    area = set(neighbors(idx, game.width, game.height)) | {idx}
    known = set(game.detected) | set(game.defused)
    found = sorted(i for i in area if i in set(game.mines) and i not in known)
    game.detected = sorted(set(game.detected) | set(found))
    return found


def moves_left(game):
    """Moves remaining, or None for a game with no move limit."""
    if game.move_limit is None:
        return None
    return max(0, game.move_limit + game.bonus_moves - game.moves_used)


def time_left(game, now):
    """Seconds remaining as a float, or None for a game with no time limit.

    Before the first reveal the clock hasn't started, so the full time is left.
    """
    if game.time_limit is None:
        return None
    total = game.time_limit + game.bonus_seconds
    if game.mines is None:
        return float(total)
    end = game.finishedAt or now
    return max(0.0, total - (end - game.startedAt).total_seconds())


def score(game):
    # 1 point per safe cell opened. A win adds 10 per mine, 1 per second left
    # and 2 per move left.
    points = len(game.revealed)
    if game.status == "won":
        points += game.mine_count * POINTS_PER_MINE
        seconds = time_left(game, game.finishedAt)
        moves = moves_left(game)
        if seconds is not None:
            points += int(seconds) * POINTS_PER_SECOND_LEFT
        if moves is not None:
            points += moves * POINTS_PER_MOVE_LEFT
    return points
