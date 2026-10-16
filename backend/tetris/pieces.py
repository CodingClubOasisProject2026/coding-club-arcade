#game size
from random import random
from backend.tetris.engine import PIECE_TYPES


COLUMNS = 10
ROWS = 20
CELL_SIZE= 40
GAME_WIDTH, GAME_HEIGHT = COLUMNS * CELL_SIZE, ROWS*CELL_SIZE

#sidebar size
SIDEBAR_WIDTH= 200
HEIGHT_FRACTION= 0.7
SCORE_HEIGHT_FRACTION= 1- HEIGHT_FRACTION

PADDING = 200
WINDOW_WIDTH= GAME_WIDTH + SIDEBAR_WIDTH+ PADDING*3
WINDOW_HEIGHT= GAME_HEIGHT+ PADDING*2

#game behaviour
UPDATE_START_SPEED= 800
MOVE_WAIT_TIME= 200
ROTATE_WAIT_TIME= 200

# Define colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
CYAN = (0, 255, 255)
YELLOW = (255, 255, 0)
MAGENTA = (255, 0, 255)
RED = (255, 0, 0)
GREEN = (0, 255, 0)
BLUE = (0, 0, 255)
ORANGE = (255, 165, 0)

# Tetromino shapes
shapes = [
    [[1, 1, 1, 1]],
    [[1, 1], [1, 1]],
    [[1, 1, 1], [0, 1, 0]],
    [[1, 1, 1], [1, 0, 0]],
    [[1, 1, 1], [0, 0, 1]],
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1, 1], [1, 1, 0]]
]

# Tetromino colors
shape_colors = [CYAN, YELLOW, MAGENTA, RED, GREEN, BLUE, ORANGE]

PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"]

class PieceGenerator:
    def __init__(self):
        self.bag = []

    def next_piece(self):
        if not self.bag:
            self.bag = PIECE_TYPES.copy()
            random.shuffle(self.bag)

        return self.bag.pop()
