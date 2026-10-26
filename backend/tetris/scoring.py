
class ScoringSystem:
    """Score cleared lines; multiply successive clears and reset on a dry lock."""

    LINE_CLEAR_POINTS = {
        0: 0,
        1: 100,
        2: 200,
        3: 300,
        4: 400,
        5:500,
        6:600,
        7:700,

    }

    GRAVITY_INTERVAL_MS = 800

    def __init__(self):
        self.total_score = 0
        self.total_lines_cleared = 0
        self.consecutive_clears = 0

    def register_lines_cleared(self, lines_cleared):
        if not isinstance(lines_cleared, int) or isinstance(lines_cleared, bool):
            raise TypeError("lines_cleared must be an integer")

        if lines_cleared not in self.LINE_CLEAR_POINTS:
            raise ValueError("lines_cleared must be between 0 and 4")

        if lines_cleared == 0:
            self.consecutive_clears = 0
            multiplier = 1
        else:
            self.consecutive_clears += 1
            multiplier = self.consecutive_clears

        points_earned = (
            self.LINE_CLEAR_POINTS[lines_cleared] * multiplier
        )

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


