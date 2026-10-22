from celery import shared_task
from django.db import transaction
from django.utils import timezone

from hub.models import GameChoices, Session
from pacman.engine import TICKS_PER_SECOND, replay
from pacman.models import PacmanRun

# A run can't be played faster than real time. Allow some clock slack.
MIN_REAL_TIME_RATIO = 0.9


def verify(session, actions):
    """Return the replayed score for a session's log, or raise ValueError."""
    if not isinstance(actions, dict):
        raise ValueError("Action log must be an object.")
    total_ticks = actions.get("total_ticks")
    if isinstance(total_ticks, int) and not isinstance(total_ticks, bool):
        elapsed = (timezone.now() - session.created_at).total_seconds()
        if elapsed < total_ticks / TICKS_PER_SECOND * MIN_REAL_TIME_RATIO:
            raise ValueError("Run was submitted faster than it could be played.")
    return replay(session.seed, actions)["score"]


@shared_task
def calculate_score(session_id, actions) -> dict | None:
    """Replay a submitted Pac-Man log and record a verified score or a rejection."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(pk=session_id, game__name=GameChoices.PACMAN)
            .first()
        )
        if session is None:
            return None

        # One run per session. Resubmissions never overwrite the first result.
        existing = PacmanRun.objects.filter(session=session).first()
        if existing is not None:
            return {"status": existing.status, "score": existing.score}

        try:
            score = verify(session, actions)
        except ValueError as error:
            PacmanRun.objects.create(
                session=session,
                input_log=actions,
                status=PacmanRun.Status.REJECTED,
                reason=str(error)[:200],
            )
            return {"status": PacmanRun.Status.REJECTED, "reason": str(error)}

        PacmanRun.objects.create(
            session=session,
            input_log=actions,
            status=PacmanRun.Status.VERIFIED,
            score=score,
        )
        session.score = score
        session.save(update_fields=["score", "updated_at"])
        return {"status": PacmanRun.Status.VERIFIED, "score": score}
