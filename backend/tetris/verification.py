"""Authoritative replay for the browser Tetris game."""

from django.db import transaction

from hub.models import Session

WIDTH = 10
HEIGHT = 20
SHAPES = {
    "I": [[1, 1, 1, 1]],
    "O": [[1, 1], [1, 1]],
    "T": [[0, 1, 0], [1, 1, 1]],
    "S": [[0, 1, 1], [1, 1, 0]],
    "Z": [[1, 1, 0], [0, 1, 1]],
    "J": [[1, 0, 0], [1, 1, 1]],
    "L": [[0, 0, 1], [1, 1, 1]],
}


class PieceGenerator:
    """Matches SeededPieceGenerator in frontend/src/games/tetris/app.js."""

    def __init__(self, seed):
        self.state = int(seed) & 0xFFFFFFFF or 0x6D2B79F5
        self.bag = []

    def random(self):
        self.state ^= (self.state << 13) & 0xFFFFFFFF
        self.state ^= self.state >> 17
        self.state ^= (self.state << 5) & 0xFFFFFFFF
        self.state &= 0xFFFFFFFF
        return self.state / 0x100000000

    def next(self):
        if not self.bag:
            self.bag = list(SHAPES)
            for index in range(len(self.bag) - 1, 0, -1):
                swap = int(self.random() * (index + 1))
                self.bag[index], self.bag[swap] = self.bag[swap], self.bag[index]
        kind = self.bag.pop()
        return {"type": kind, "shape": [row[:] for row in SHAPES[kind]], "x": 0, "y": 0}


def rotated(shape):
    return [list(row) for row in zip(*shape[::-1])]


def replay(seed, submission):
    if not isinstance(submission, dict) or not isinstance(submission.get("action_log"), list):
        raise ValueError("actions must contain an action_log array.")
    log = submission["action_log"]
    if len(log) > 100000:
        raise ValueError("action_log is too long.")
    generator = PieceGenerator(seed)
    board = [[None] * WIDTH for _ in range(HEIGHT)]
    score = lines = 0
    piece = generator.next()
    next_piece = generator.next()
    piece["x"] = (WIDTH - len(piece["shape"][0])) // 2

    def collides(candidate, dx=0, dy=0, shape=None):
        shape = shape or candidate["shape"]
        for y, row in enumerate(shape):
            for x, filled in enumerate(row):
                if not filled:
                    continue
                bx, by = candidate["x"] + x + dx, candidate["y"] + y + dy
                if bx < 0 or bx >= WIDTH or by >= HEIGHT or (by >= 0 and board[by][bx]):
                    return True
        return False

    def spawn():
        nonlocal piece, next_piece
        piece = next_piece
        next_piece = generator.next()
        piece["x"] = (WIDTH - len(piece["shape"][0])) // 2
        piece["y"] = 0
        return not collides(piece)

    def lock():
        nonlocal score, lines
        for y, row in enumerate(piece["shape"]):
            for x, filled in enumerate(row):
                if filled:
                    by, bx = piece["y"] + y, piece["x"] + x
                    if by < 0:
                        return False
                    board[by][bx] = piece["type"]
        remaining = [row for row in board if not all(row)]
        cleared = HEIGHT - len(remaining)
        if cleared:
            score += ([0, 100, 300, 500, 800][cleared] if cleared < 5 else 1000) * (lines // 10 + 1)
            lines += cleared
            board[:] = [[None] * WIDTH for _ in range(cleared)] + remaining
        return spawn()

    if collides(piece):
        raise ValueError("Invalid initial game state.")
    previous_time = 0
    over = False
    for event in log:
        if not isinstance(event, dict) or event.get("action") not in {"left", "right", "rotate", "soft_drop", "hard_drop", "gravity"}:
            raise ValueError("action_log contains an invalid action.")
        at_ms = event.get("at_ms")
        if not isinstance(at_ms, int) or isinstance(at_ms, bool) or at_ms < previous_time:
            raise ValueError("action_log timestamps must be non-decreasing integers.")
        previous_time = at_ms
        if over:
            raise ValueError("Actions continue after game over.")
        action = event["action"]
        if action == "left" and not collides(piece, -1):
            piece["x"] -= 1
        elif action == "right" and not collides(piece, 1):
            piece["x"] += 1
        elif action == "rotate":
            shape = rotated(piece["shape"])
            for offset in (0, -1, 1, -2, 2):
                if not collides(piece, offset, 0, shape):
                    piece["x"] += offset
                    piece["shape"] = shape
                    break
        elif action in ("soft_drop", "gravity"):
            if collides(piece, 0, 1):
                over = not lock()
            else:
                piece["y"] += 1
        elif action == "hard_drop":
            distance = 0
            while not collides(piece, 0, distance + 1):
                distance += 1
            piece["y"] += distance
            score += 2 * distance
            over = not lock()
    if not over:
        raise ValueError("The action log does not end in game over.")
    duration = submission.get("duration_ms")
    if not isinstance(duration, int) or isinstance(duration, bool) or duration < previous_time:
        raise ValueError("duration_ms must be an integer at least as large as the last action timestamp.")
    return score


@transaction.atomic
def verify_action_log(session_id, actions):
    session = Session.objects.select_for_update().get(id=session_id)
    if session.game.name != "TETRIS":
        raise ValueError("Session is not a Tetris game.")
    if session.tetris_action_log:
        if session.tetris_action_log != actions:
            raise ValueError("This session was already submitted with a different action log.")
        return {"verified": True, "authoritative_score": session.score}
    score = replay(session.seed, actions)
    session.score = score
    session.tetris_action_log = actions
    session.save(update_fields=("score", "tetris_action_log", "updated_at"))
    return {"verified": True, "authoritative_score": score}
