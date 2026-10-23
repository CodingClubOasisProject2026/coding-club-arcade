from celery import shared_task
from django.db import transaction

from hub.models import GameChoices, Session
from tetris.engine import (
    check_collision,
    clear_line,
    lock_tetromino,
    rotate_tetromino,
    validate_move,
)
from tetris.pieces import (
    PIECE_SHAPES,
    SeededPieceRandomizer,
    Tetromino,
    create_grid,
)
from tetris.scoring import ScoringSystem

MAX_ACTIONS = 100_000


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


def _validate_action(action):
    if not isinstance(action, dict):
        raise ValueError("Each action must be a JSON object.")

    action_type = action.get("type")
    if action_type == "move":
        if action.get("direction") not in ("left", "right"):
            raise ValueError("move direction must be 'left' or 'right'.")
    elif action_type == "rotate":
        if action.get("direction") not in ("clockwise", "counterclockwise"):
            raise ValueError(
                "rotate direction must be 'clockwise' or 'counterclockwise'."
            )
    elif action_type not in ("soft_drop", "hard_drop", "tick"):
        raise ValueError("Action type must be move, rotate, soft_drop, hard_drop, or tick.")


@shared_task
def calculate_score(user_id: int, session_id: str, actions: list[dict]) -> dict | None:
    """Replay the submitted controls and persist the server-calculated score."""
    if not isinstance(actions, list):
        raise ValueError("actions must be a list.")
    if len(actions) > MAX_ACTIONS:
        raise ValueError("actions list is too long.")
    for action in actions:
        _validate_action(action)

    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(
                pk=session_id,
                user_id=user_id,
                game__name=GameChoices.TETRIS,
            )
            .first()
        )
        if session is None:
            return None

        grid = create_grid()
        randomizer = SeededPieceRandomizer(session.seed)
        scoring = ScoringSystem()

        piece_type, color = randomizer.next_piece()
        tetromino = make_tetromino(piece_type, color, len(grid[0]))
        results = []
        game_over = check_collision(grid, tetromino)

        for action in actions:
            if game_over:
                raise ValueError("Actions continue after game over.")

            action_type = action["type"]
            accepted = True
            lines_cleared = 0
            resolved_position = None

            if action_type == "move":
                old_x, old_y = tetromino.x, tetromino.y
                validate_move(grid, tetromino, action)
                accepted = (tetromino.x, tetromino.y) != (old_x, old_y)

            elif action_type == "rotate":
                accepted = rotate_tetromino(grid, tetromino, action["direction"])

            elif action_type in ("soft_drop", "tick"):
                if check_collision(grid, tetromino):
                    accepted = False
                else:
                    old_y = tetromino.y
                    validate_move(grid, tetromino, {"direction": "down"})
                    if tetromino.y == old_y:
                        # The active piece has landed; lock it and spawn the next one.
                        resolved_position = (tetromino.x, tetromino.y)
                        grid, lines_cleared = resolve_piece(grid, tetromino)
                        scoring.register_lines_cleared(lines_cleared)
                        piece_type, color = randomizer.next_piece()
                        tetromino = make_tetromino(piece_type, color, len(grid[0]))
                        game_over = check_collision(grid, tetromino)

            elif action_type == "hard_drop":
                while not check_collision(grid, tetromino):
                    tetromino.y += 1
                tetromino.y -= 1
                resolved_position = (tetromino.x, tetromino.y)
                grid, lines_cleared = resolve_piece(grid, tetromino)
                scoring.register_lines_cleared(lines_cleared)
                piece_type, color = randomizer.next_piece()
                tetromino = make_tetromino(piece_type, color, len(grid[0]))
                game_over = check_collision(grid, tetromino)

            result_x, result_y = resolved_position or (tetromino.x, tetromino.y)
            results.append({
                "type": action_type,
                "accepted": accepted,
                "x": result_x,
                "y": result_y,
                "lines_cleared": lines_cleared,
            })

        if not game_over:
            raise ValueError("The action list must end in game over.")

        Session.update_score(session_id, user_id, scoring.total_score)

        return {
            "score": scoring.total_score,
            "lines_cleared": scoring.total_lines_cleared,
            "game_over": game_over,
            "results": results,
        }
