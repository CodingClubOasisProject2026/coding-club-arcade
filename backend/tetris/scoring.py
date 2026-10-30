
from tetris.pieces import ROWS


class ScoringSystem:
    """Score each locked piece and cleared lines, with consecutive-clear bonuses."""

    POINTS_PER_LINE = 100
    POINTS_PER_DROP = 10

    GRAVITY_INTERVAL_MS = 600

    def __init__(self):
        self.total_score = 0
        self.total_lines_cleared = 0
        self.consecutive_clears = 0

    def register_piece_dropped(self):
        """Award points once when a piece locks onto the board."""
        points_earned = self.POINTS_PER_DROP
        self.total_score += points_earned
        return self.get_game_state(points_earned)

    def register_lines_cleared(self, lines_cleared):
        if not isinstance(lines_cleared, int) or isinstance(lines_cleared, bool):
            raise TypeError("lines_cleared must be an integer")

        if lines_cleared < 0 or lines_cleared > ROWS:
            raise ValueError(f"lines_cleared must be between 0 and {ROWS}")

        if lines_cleared == 0:
            self.consecutive_clears = 0
            multiplier = 1
        else:
            self.consecutive_clears += 1
            multiplier = self.consecutive_clears

        points_earned = self.POINTS_PER_LINE * lines_cleared * multiplier

        self.total_score += points_earned
        self.total_lines_cleared += lines_cleared

        return self.get_game_state(points_earned, multiplier)

    def get_game_state(self, points_earned=0, multiplier=1):
        return {
            "points_earned": points_earned,
            "total_score": self.total_score,
            "total_lines_cleared": self.total_lines_cleared,
            "multiplier": multiplier,
            "consecutive_clears": self.consecutive_clears,
            "gravity_interval_ms": self.GRAVITY_INTERVAL_MS,
        }

    def reset(self):
        self.total_score = 0
        self.total_lines_cleared = 0
        self.consecutive_clears = 0


