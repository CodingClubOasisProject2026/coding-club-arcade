import logging
import re

from celery import shared_task
from django.db import transaction

from hub.models import GameChoices, Session
from tetris.engine import (
    check_collision,
    clear_line,
    lock_tetromino,
    move_piece,
    rotate_tetromino,
)
from tetris.pieces import (
    PIECE_SHAPES,
    SeededPieceRandomizer,
    Tetromino,
    create_grid,
)
from tetris.scoring import ScoringSystem

logger = logging.getLogger(__name__)

MAX_ACTIONS = 100_000

# One character per action. Must match ACTION_CODES in frontend/src/games/tetris/app.js.
ACTION_CODES = "TLRCcSH"
_VALID_ACTIONS = re.compile(f"[{ACTION_CODES}]*")
_DIRECTIONS = {"L": "left", "R": "right", "C": "clockwise", "c": "counterclockwise"}


def validate_actions(actions):
    """Raise ValueError unless actions is a string of known action codes."""
    if not isinstance(actions, str):
        raise ValueError("actions must be a string.")
    if len(actions) > MAX_ACTIONS:
        raise ValueError("actions is too long.")
    if not _VALID_ACTIONS.fullmatch(actions):
        raise ValueError(f"actions may only contain the characters {ACTION_CODES}.")


def make_tetromino(piece_type, color, grid_width):
    shape = [row[:] for row in PIECE_SHAPES[piece_type]]
    x = (grid_width - len(shape[0])) // 2
    return Tetromino(shape=shape, color=color, x=x, y=0, piece_type=piece_type)


def resolve_piece(grid, tetromino):
    """Land a piece, applying a bomb blast before gravity and line clearing."""
    if tetromino.piece_type == "B":
        center_x, center_y = tetromino.x, tetromino.y
        for y in range(max(0, center_y - 1), min(len(grid), center_y + 2)):
            for x in range(max(0, center_x - 1), min(len(grid[0]), center_x + 2)):
                grid[y][x] = 0
        for x in range(len(grid[0])):
            remaining = [grid[y][x] for y in range(len(grid)) if grid[y][x]]
            for y in range(len(grid) - 1, -1, -1):
                grid[y][x] = remaining.pop() if remaining else 0
    else:
        lock_tetromino(grid, tetromino)
    return clear_line(grid)


def replay(seed, actions):
    """Replay an action string from a seed. Returns (scoring, game_over)."""
    validate_actions(actions)

    grid = create_grid()
    randomizer = SeededPieceRandomizer(seed)
    scoring = ScoringSystem()

    piece_type, color = randomizer.next_piece()
    tetromino = make_tetromino(piece_type, color, len(grid[0]))
    game_over = check_collision(grid, tetromino)

    for code in actions:
        if game_over:
            raise ValueError("Actions continue after game over.")

        landed = False
        if code in "LR":
            move_piece(grid, tetromino, _DIRECTIONS[code])

        elif code in "Cc":
            rotate_tetromino(grid, tetromino, _DIRECTIONS[code])

        elif code in "ST":
            if not check_collision(grid, tetromino):
                old_y = tetromino.y
                move_piece(grid, tetromino, "down")
                # The piece couldn't move down, so it has landed.
                landed = tetromino.y == old_y

        else:  # "H"
            while not check_collision(grid, tetromino):
                tetromino.y += 1
            tetromino.y -= 1
            landed = True

        if landed:
            grid, lines_cleared = resolve_piece(grid, tetromino)
            scoring.register_lines_cleared(lines_cleared)
            piece_type, color = randomizer.next_piece()
            tetromino = make_tetromino(piece_type, color, len(grid[0]))
            game_over = check_collision(grid, tetromino)

    if not game_over:
        raise ValueError("The action list must end in game over.")

    return scoring, game_over


@shared_task
def calculate_score(user_id: int, session_id: str, actions: str) -> dict | None:
    """Replay the submitted controls and store the server-calculated score."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(pk=session_id, user_id=user_id, game__name=GameChoices.TETRIS)
            .first()
        )
        if session is None:
            return None

        # One score per session. Resubmissions never overwrite it.
        if session.score is not None:
            return {"score": session.score}

        try:
            scoring, game_over = replay(session.seed, actions)
        except ValueError as error:
            logger.warning("Rejected tetris run %s: %s", session_id, error)
            return None

        Session.update_score(session_id, user_id, scoring.total_score)

        return {
            "score": scoring.total_score,
            "lines_cleared": scoring.total_lines_cleared,
            "game_over": game_over,
        }
