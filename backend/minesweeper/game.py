import random 

# Stays under the PositiveSmallIntegerField limit (32767) for move_count.
MAX_MOVES = 30_000

# (width, height, mine_count)
DIFFICULTIES = {
    "beginner": (9, 9, 10),
    "intermediate": (16, 16, 40),
    "expert": (30, 16, 99),
}

def neighbors(idx, w, h):
    x, y = idx % w, idx // w
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dx or dy) and 0 <= x + dx < w and 0 <= y + dy < h:
                yield (y + dy) * w + (x + dx)

def set_mines(game,idx):
    w,h = game.width, game.height

    safe = set(neighbors(idx, w, h)) | {idx}

    cells = [i for i in range(w * h) if i not in safe]
    random.Random(game.seed).shuffle(cells)
    return sorted(cells[:game.mine_count])


def count(game_mines,idx,w,h):
    return sum(1 for n in neighbors(idx, w, h) if n in game_mines)

def reveal(game,idx,mines):
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


def score(game):
    # 1 point per safe cell opened; a win adds 10 per mine plus a time bonus
    # of 1 point per second under par (10 seconds per mine).
    points = len(game.revealed)
    if game.status == "won":
        elapsed = (game.finishedAt - game.startedAt).total_seconds()
        par = game.mine_count * 10
        points += game.mine_count * 10 + max(0, int(par - elapsed))
    return points
