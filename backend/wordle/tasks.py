from celery import shared_task
from django.db import transaction

from hub.models import GameChoices, Session

from . import words
from .engine import replay


@shared_task
def calculate_score(user_id: int, session_id: str, actions: dict) -> int:
    """Submit the server-replayed Wordle score through the hub's task flow."""
    with transaction.atomic():
        session = (
            Session.objects.select_for_update()
            .filter(
                pk=session_id,
                user_id=user_id,
                game__name=GameChoices.WORDLE,
            )
            .first()
        )
        if session is None:
            raise ValueError("Session not found")

        if session.score is not None:
            return session.score

        guesses = (session.wordle_state or {}).get("guesses", [])
        answers = words.pick_sequence(session.seed, str(session.id))
        result = replay(answers, guesses, words.get_allowed())
        score = max(0, result.state.score)
        Session.update_score(session_id, user_id, score)
        return score
