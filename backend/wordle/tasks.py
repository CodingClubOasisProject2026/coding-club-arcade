from celery import shared_task
from django.core.cache import cache
from django.db import transaction

from hub.models import GameChoices, Session

from . import words
from .engine import replay


@shared_task
def calculate_score(user_id: int, session_id: str, actions: dict) -> int:
    """Validate cached Wordle actions, then persist the server-replayed score."""
    key = f"wordle:session:{session_id}"
    state = cache.get(key)
    if state is None:
        raise ValueError("Wordle attempt expired from cache before score verification")
    cached_actions = state.get("guesses", [])
    submitted_actions = actions.get("guesses", []) if isinstance(actions, dict) else actions
    if submitted_actions != cached_actions:
        raise ValueError("Submitted Wordle actions do not match the server action log")

    with transaction.atomic():
        session = Session.objects.select_for_update().filter(
            pk=session_id, user_id=user_id, game__name=GameChoices.WORDLE
        ).first()
        if session is None:
            raise ValueError("Session not found")
        if session.score is not None:
            return session.score
        answers = words.pick_sequence(session.seed, str(session.id))
        result = replay(answers, cached_actions, words.get_allowed())
        score = max(0, result.state.score)
        Session.update_score(session_id, user_id, score)
        return score
