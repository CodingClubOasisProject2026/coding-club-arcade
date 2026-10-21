from celery import shared_task
from django.db import transaction

from hub.models import GameChoices, Session
from snake.game_logic import replay_actions


@shared_task
def calculate_score(session_id: str, actions: dict) -> int:

    # Lock the session while processing its score.
    with transaction.atomic():
        try:
            session = (
                Session.objects
                .select_for_update()
                .select_related("game")
                .get(id=session_id)
            )
        except Session.DoesNotExist:
            raise ValueError("Session not found")

        if session.game.name != GameChoices.SNAKE:
            raise ValueError("Session does not belong to Snake")

        if session.score is not None:
            return session.score

        game = replay_actions(
            seed=session.seed,
            action_log=actions,
        )

        session.score = game["score"]
        session.save(update_fields=["score", "updated_at"])

        return game["score"]
