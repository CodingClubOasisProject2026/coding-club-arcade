from celery import shared_task
from django.db import transaction

from hub.models import Session
from tetris.engine import (
    check_collision,
    clear_line,
    lock_tetromino,
    rotate_tetromino,
    validate_move,
)
from tetris.pieces import (
    PIECE_TYPES,
    SeededPieceRandomizer,
    Tetromino,
    create_grid,
    shapes,
)
from tetris.scoring import ScoringSystem


def make_tetromino(piece_type, color, grid_width):
    shape = [row[:] for row in shapes[PIECE_TYPES.index(piece_type)]]
    x = (grid_width - len(shape[0])) // 2
    return Tetromino(shape=shape, color=color, x=x, y=0)


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
def calculate_score(session_id, actions: list[dict]) -> dict:
    """Replay client inputs from the session seed and save only the computed score."""
    if not isinstance(actions, list):
        raise ValueError("actions must be a list.")
    for action in actions:
        _validate_action(action)

    with transaction.atomic():
        session = Session.objects.select_for_update().get(id=session_id)
        grid = create_grid()
        randomizer = SeededPieceRandomizer(session.seed)
        scoring = ScoringSystem()

        piece_type, color = randomizer.next_piece()
        tetromino = make_tetromino(piece_type, color, len(grid[0]))
        results = []
        game_over = check_collision(grid, tetromino)

        for action in actions:
            if game_over:
                results.append({"type": action["type"], "accepted": False, "reason": "game_over"})
                continue

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
                        lock_tetromino(grid, tetromino)
                        grid, lines_cleared = clear_line(grid)
                        scoring.register_lines_cleared(lines_cleared)
                        piece_type, color = randomizer.next_piece()
                        tetromino = make_tetromino(piece_type, color, len(grid[0]))
                        game_over = check_collision(grid, tetromino)

            elif action_type == "hard_drop":
                while not check_collision(grid, tetromino):
                    tetromino.y += 1
                tetromino.y -= 1
                resolved_position = (tetromino.x, tetromino.y)
                lock_tetromino(grid, tetromino)
                grid, lines_cleared = clear_line(grid)
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

#         session.score = scoring.total_score
#         session.save(update_fields=["score", "updated_at"])

        return {
            "score": scoring.total_score,
            "lines_cleared": scoring.total_lines_cleared,
            "game_over": game_over,
            "results": results,
        }
