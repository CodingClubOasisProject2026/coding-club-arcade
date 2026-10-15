import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from .engine import CLEARED, IN_PROGRESS, LOST, GameState


class WordleSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"      # accepting guesses
        FINISHED = "finished", "Finished"  # ended (lost / cleared / abandoned), awaiting replay
        SCORED = "scored", "Scored"      # replay has run

    GAME_STATUS_CHOICES = [
        (IN_PROGRESS, "In progress"),
        (LOST, "Lost"),
        (CLEARED, "Cleared"),
    ]

    # Fields that make up the live engine state; pass to save(update_fields=...).
    STATE_FIELDS = ("word_idx", "attempts", "words_solved", "score", "game_status")

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wordle_sessions",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE
    )

    # --- the secret + versions (everything the replayer needs as input) ---
    words = models.JSONField(help_text="SECRET. Ordered answer words for this game.")
    list_version = models.CharField(max_length=12)
    rules_version = models.PositiveSmallIntegerField(default=1)

    # --- live engine state, updated incrementally by /guess ---
    word_idx = models.PositiveSmallIntegerField(default=0)
    attempts = models.PositiveSmallIntegerField(default=0)
    words_solved = models.PositiveSmallIntegerField(default=0)
    score = models.PositiveIntegerField(default=0)
    game_status = models.CharField(
        max_length=12, choices=GAME_STATUS_CHOICES, default=IN_PROGRESS
    )

    # --- lifecycle ---
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    scored_at = models.DateTimeField(null=True, blank=True)

    # --- replay verification (written by the Celery task) ---
    replay_matched = models.BooleanField(null=True, blank=True)
    replay_error = models.TextField(blank=True)

    class Meta:
        constraints = [
            # At most one active session per user: stops session farming.
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(status="active"),
                name="wordle_one_active_session_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-started_at"], name="wordle_sess_user_started"),
            models.Index(fields=["status", "started_at"], name="wordle_sess_status_started"),
        ]

    def __str__(self) -> str:
        # Deliberately excludes `words`.
        return f"WordleSession {self.id} ({self.status})"

    def get_state(self) -> GameState:
        return GameState(
            word_idx=self.word_idx,
            attempts=self.attempts,
            words_solved=self.words_solved,
            score=self.score,
            status=self.game_status,
        )

    def set_state(self, state: GameState) -> None:
        """Copy an engine state onto the model. Does not save."""
        self.word_idx = state.word_idx
        self.attempts = state.attempts
        self.words_solved = state.words_solved
        self.score = state.score
        self.game_status = state.status


class WordleEvent(models.Model):
    session = models.ForeignKey(
        WordleSession, on_delete=models.CASCADE, related_name="events"
    )
    seq = models.PositiveSmallIntegerField()
    word = models.CharField(max_length=5)
    mask = models.JSONField(help_text="Per-letter result: 2=correct, 1=present, 0=absent.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["seq"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "seq"], name="wordle_event_unique_seq"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.session_id}#{self.seq}"
