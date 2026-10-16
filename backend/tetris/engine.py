import random

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
    return grid
