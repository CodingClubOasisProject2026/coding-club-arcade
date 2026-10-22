from celery import shared_task
from django.db import transaction

from flappy_bird.game_logic import replay_actions
from hub.models import GameChoices, Session


@shared_task
def calculate_score(user_id: int, session_id: str, actions: dict) -> int:
    with transaction.atomic():
        try:
            session = (
                Session.objects.select_for_update()
                .select_related("game")
                .get(
                    id=session_id,
                    user_id=user_id,
                    game__name=GameChoices.FLAPPY_BIRD,
                )
            )
        except Session.DoesNotExist as exc:
            raise ValueError("Session not found") from exc
        if session.score is not None:
            return session.score

        game = replay_actions(seed=session.seed, action_log=actions)
        Session.update_score(session_id, user_id, game["score"])
        return game["score"]
