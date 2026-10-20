from celery import shared_task
from django.contrib.admin import action
from backend.hub.models import Session
from backend.tetris.pieces import SeededPieceRandomizer, Tetromino
from backend.tetris.pieces import create_grid
from backend.tetris.engine import check_collision, clear_line, lock_tetromino, validate_move
from backend.tetris.scoring import ScoringSystem


@shared_task
def calculate_score(session_id, actions: dict) -> None:
    session = Session.objects.get(id=session_id)
    seed = session.seed
    x = int(actions["x"])
    y = int(actions["y"])

    randomizer = SeededPieceRandomizer(str(seed))
    piece_type, color = randomizer.next_piece()

    grid = create_grid()
    piece_type, color = randomizer.next_piece()
    x, y = validate_move(grid, tetromino, actions)
    tetromino = Tetromino(piece_type, color, x, y)

    grid = lock_tetromino(grid, tetromino)

    grid, lines_cleared = clear_line(grid)
    game_state = ScoringSystem().register_lines_cleared(lines_cleared)
    session.update_score(session_id=session.id,user_id=session.user_id,score=game_state["total_score"],)