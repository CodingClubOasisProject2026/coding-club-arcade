
# from venv import logger

# from celery import shared_task
# from django.contrib.admin import action
# from django.db import transaction
# from backend.hub.models import Session
# from backend.tetris.pieces import PIECE_TYPES, SeededPieceRandomizer, Tetromino
# from backend.tetris.pieces import create_grid, shapes
# from backend.tetris.engine import check_collision, clear_line, lock_tetromino, validate_move
# from backend.tetris.scoring import ScoringSystem

# def make_tetromino(piece_type, color, grid_width):
#     shape_index = PIECE_TYPES.index(piece_type)
#     shape = [row[:] for row in shapes[shape_index]]
#     x = (grid_width - len(shape[0])) // 2

#     return Tetromino(shape=shape, color=color, x=x, y=0)

# def calculate_score(session_id, actions: list[dict]) -> dict:
#     with transaction.atomic():
#         session = Session.objects.select_for_update().get(id=session_id)

#         # This task handles the complete game, so keep these in memory
#         # while processing the action list.
#         grid = create_grid()
#         randomizer = SeededPieceRandomizer(session.seed)
#         scoring = ScoringSystem()

#         piece_type, color = randomizer.next_piece()
#         tetromino = make_tetromino(piece_type, color, len(grid[0]))

#         results = []

#         for action in actions:
#             # The frontend sends the proposed position.
#             proposed_x = int(action["x"])
#             proposed_y = int(action["y"])

#             tetromino.x = proposed_x
#             tetromino.y = proposed_y

#             if check_collision(grid, tetromino):
#                 results.append({
#                     "accepted": False,
#                     "x": proposed_x,
#                     "y": proposed_y,
#                     "reason": "collision",
#                 })
#                 continue

#             lines_cleared = 0


#             if action.get("lock", False):
#                 lock_tetromino(grid, tetromino)
#                 grid, lines_cleared = clear_line(grid)
#                 score_state = scoring.register_lines_cleared(lines_cleared)

#                 piece_type, color = randomizer.next_piece()
#                 tetromino = make_tetromino(
#                     piece_type,
#                     color,
#                     len(grid[0]),
#                 )
#             results.append({
#                 "accepted": True,
#                 "x": proposed_x,
#                 "y": proposed_y,
#                 "lines_cleared": lines_cleared,
#             })

#         session.score = scoring.total_score
#         session.save(update_fields=["score", "updated_at"])

#         return {
#             "score": scoring.total_score,
#             "results": results,
#         }