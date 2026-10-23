def clear_line(grid):
    new_grid = [row for row in grid if any(cell == 0 for cell in row)]
    lines_cleared = len(grid) - len(new_grid)
    new_grid = [[0] * len(grid[0]) for _ in range(lines_cleared)] + new_grid

    return new_grid, lines_cleared

def check_collision(grid, tetromino):
    for i, row in enumerate(tetromino.shape):
        for j, cell in enumerate(row):
            if cell:
                x = tetromino.x + j
                y = tetromino.y + i
                if x < 0 or x >= len(grid[0]) or y >= len(grid) or (y >= 0 and grid[y][x]):
                    return True
    return False

def lock_tetromino(grid, tetromino):

    for i, row in enumerate(tetromino.shape):
        for j, cell in enumerate(row):
            if cell:
                x = tetromino.x + j
                y = tetromino.y + i
                if 0 <= y < len(grid) and 0 <= x < len(grid[0]):
                    grid[y][x] = 1
                else:
                    raise ValueError("Tetromino position is out of bounds")


def move_piece(grid, tetromino, direction):
    """Move the piece one cell if it fits; otherwise leave it where it was."""
    old_x, old_y = tetromino.x, tetromino.y

    if direction == "left":
        tetromino.x -= 1
    elif direction == "right":
        tetromino.x += 1
    elif direction == "down":
        tetromino.y += 1
    elif direction == "up":
        pass
    else:
        raise ValueError("direction must be left, right, down, or up")

    if check_collision(grid, tetromino):
        tetromino.x, tetromino.y = old_x, old_y
        return tetromino.x, tetromino.y

    return tetromino.x, tetromino.y


def rotate_tetromino(grid, tetromino, direction):
    """Rotate a piece if its new shape fits, using small horizontal wall kicks."""
    if direction not in ("clockwise", "counterclockwise"):
        raise ValueError("direction must be 'clockwise' or 'counterclockwise'")

    old_shape = tetromino.shape
    if direction == "clockwise":
        rotated = [list(row) for row in zip(*old_shape[::-1])]
    else:
        rotated = [list(row) for row in zip(*old_shape)][::-1]

    old_x = tetromino.x
    tetromino.shape = rotated
    for kick in (0, -1, 1, -2, 2):
        tetromino.x = old_x + kick
        if not check_collision(grid, tetromino):
            return True

    tetromino.shape = old_shape
    tetromino.x = old_x
    return False
