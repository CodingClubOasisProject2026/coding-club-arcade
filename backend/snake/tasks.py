import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from hub.models import GameChoices, Session
from snake.game_logic import replay_actions

logger = logging.getLogger(__name__)

# A run can't be played faster than its tick delays add up to. Allow clock slack.
MIN_REAL_TIME_RATIO = 0.9


@shared_task
def calculate_score(user_id: int, session_id: str, actions: dict) -> int | None:
    """Replay a submitted Snake log and store the verified score."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(pk=session_id, user_id=user_id, game__name=GameChoices.SNAKE)
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
            if elapsed_ms < game["min_ms"] * MIN_REAL_TIME_RATIO:
                raise ValueError("Run was submitted faster than it could be played")
        except ValueError as error:
            logger.warning("Rejected snake run %s: %s", session_id, error)
            return None

        Session.update_score(session_id, user_id, game["score"])
        return game["score"]
