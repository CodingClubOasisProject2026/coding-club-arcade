import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from flappy_bird.game_logic import replay_actions
from hub.models import GameChoices, Session

logger = logging.getLogger(__name__)

# The frontend runs the simulation at 60 Hz, so a run can't finish faster than its ticks take.
TICK_MS = 1000 / 60
MIN_REAL_TIME_RATIO = 0.9


@shared_task
def calculate_score(user_id: int, session_id: str, actions: dict) -> int | None:
    """Replay a submitted Flappy Bird log and store the verified score."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(pk=session_id, user_id=user_id, game__name=GameChoices.FLAPPY_BIRD)
            .first()
        )
        if session is None:
            return None

        # One score per session. Resubmissions never overwrite it.
        if session.score is not None:
            return session.score

        try:
            game = replay_actions(seed=session.seed, action_log=actions)
            elapsed_ms = (timezone.now() - session.created_at).total_seconds() * 1000
            if elapsed_ms < game["tick"] * TICK_MS * MIN_REAL_TIME_RATIO:
                raise ValueError("Run was submitted faster than it could be played")
        except ValueError as error:
            logger.warning("Rejected flappy bird run %s: %s", session_id, error)
            return None

        Session.update_score(session_id, user_id, game["score"])
        return game["score"]
