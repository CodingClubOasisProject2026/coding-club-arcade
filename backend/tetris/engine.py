import random

def clear_line(grid):
    new_grid = [row for row in grid if any(cell == 0 for cell in row)]
    lines_cleared = len(grid) - len(new_grid)
    new_grid = [[0] * len(grid[0]) for _ in range(lines_cleared)] + new_grid
    
    return new_grid, lines_cleared


