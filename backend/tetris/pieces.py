#game size
import random


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
COLORS = (CYAN, YELLOW, MAGENTA, RED, GREEN, BLUE, ORANGE)
PIECE_TYPES = ("I", "O", "T", "S", "Z", "J", "L", "B")
PIECE_SHAPES = dict(zip(PIECE_TYPES[:7], shapes))
PIECE_SHAPES["B"] = [[1]]
PIECE_COLORS = dict(zip(PIECE_TYPES[:7], COLORS))
PIECE_COLORS["B"] = (35, 35, 45)


def create_grid():
    return [[0 for _ in range(COLUMNS)] for _ in range(ROWS)]

class SeededPieceRandomizer:
    """Shuffle seven-piece bags and add one bomb every two to four bags."""

    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.bag: list[tuple[str, tuple[int, int, int]]] = []
        self.bags_until_bomb = self.rng.randint(2,4)

    def next_piece(self) -> tuple[str, tuple[int, int, int]]:
        if not self.bag:
            self.bag = list(zip(PIECE_TYPES[:7], COLORS))
            if self.bags_until_bomb == 0:
                self.bag.append(("B", PIECE_COLORS["B"]))
                self.bags_until_bomb = self.rng.randint(2, 4)
            else:
                self.bags_until_bomb -= 1
            self.rng.shuffle(self.bag)

        return self.bag.pop()

class Tetromino:
    def __init__(self, shape, color, x, y, piece_type=None):
        self.shape = shape
        self.color = color
        self.x = x
        self.y = y
        self.piece_type = piece_type


