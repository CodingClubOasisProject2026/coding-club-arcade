"""Minesweeper game state, kept in the cache (Valkey) instead of the database.

Only the final score is durable: it is written to hub.Session when a game ends.
"""

from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime

from django.core.cache import cache
from django.utils import timezone

IN_PROGRESS, WON, LOST = "in_progress", "won", "lost"

# Abandoned games expire; finished ones linger briefly so the final board can be shown.
ACTIVE_TTL = 24 * 60 * 60
FINISHED_TTL = 60 * 60
LOCK_TTL = 5


def key(game_id):
    return f"minesweeper:game:{game_id}"


@dataclass
class MinesweeperState:
    id: str
    user_id: int
    seed: int
    width: int
    height: int
    mine_count: int
    mines: list | None = None
    revealed: list = field(default_factory=list)
    flagged: list = field(default_factory=list)
    exploded: list = field(default_factory=list)
    move_count: int = 0
    status: str = IN_PROGRESS
    startedAt: datetime = field(default_factory=timezone.now)
    finishedAt: datetime | None = None
    score: int | None = None
    # Limits. None means no limit (games cached before limits existed).
    time_limit: int | None = None
    move_limit: int | None = None
    moves_used: int = 0
    bonus_seconds: int = 0
    bonus_moves: int = 0
    # Power-ups: how many to hide (placed with the mines on the first reveal),
    # [[cell, type], ...] still hidden, and the ones picked up.
    powerup_count: int = 0
    powerups: list = field(default_factory=list)
    found: list = field(default_factory=list)
    shields: int = 0
    sonars: int = 0
    # Mines shown by sonar, and mines blocked by a shield.
    detected: list = field(default_factory=list)
    defused: list = field(default_factory=list)
    # Why a lost game ended: "mine", "time" or "moves".
    end_reason: str | None = None

    @property
    def pk(self):
        return self.id

    @property
    def ttl(self):
        return ACTIVE_TTL if self.status == IN_PROGRESS else FINISHED_TTL


def create(state):
    """Store a new game. Returns False if one already exists for this id."""
    return cache.add(key(state.id), asdict(state), timeout=state.ttl)


def load(game_id, user_id):
    """Return the game, or None if it is missing or belongs to someone else."""
    data = cache.get(key(game_id))
    if data is None or data["user_id"] != user_id:
        return None
    return MinesweeperState(**data)


def save(state):
    cache.set(key(state.id), asdict(state), timeout=state.ttl)


@contextmanager
def lock(game_id):
    """Yields True if this caller holds the game's lock, False if someone else does."""
    lock_key = f"{key(game_id)}:lock"
    acquired = cache.add(lock_key, 1, timeout=LOCK_TTL)
    try:
        yield acquired
    finally:
        if acquired:
            cache.delete(lock_key)
