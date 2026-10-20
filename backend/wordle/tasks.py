from celery import shared_task
from django.db import transaction

from hub.models import GameChoices, Session

from . import words
from .engine import replay


@shared_task
def calculate_score(session_id, actions: dict | None = None) -> None:
    """Submit the server-replayed Wordle score through the hub's task flow."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(pk=session_id, game__name=GameChoices.WORDLE)
            .first()
        )
        if session is None:
            return

        guesses = (session.wordle_state or {}).get("guesses", [])
        answers = words.pick_sequence(session.seed, str(session.id))
        result = replay(answers, guesses, words.get_allowed())
        session.score = max(0, result.state.score)
        session.save(update_fields=["score", "updated_at"])
