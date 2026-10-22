from django.contrib.auth import get_user_model
from django.test import TestCase

from flappy_bird.game_logic import create_game, step_game
from flappy_bird.tasks import calculate_score
from hub.models import Game, GameChoices, Session


class FlappyBirdScoreTaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="flappy-player")
        self.game = Game.objects.create(name=GameChoices.FLAPPY_BIRD)
        self.session = Session.objects.create(
            user=self.user,
            game=self.game,
            seed=42,
        )

    def test_calculate_score_saves_the_replayed_result(self):
        game = create_game(self.session.seed)
        while game["status"] == "ACTIVE":
            step_game(game)
        actions = {
            "actions": [],
            "total_ticks": game["tick"],
            "end_reason": "COLLISION",
        }

        score = calculate_score(self.user.id, str(self.session.id), actions)

        self.session.refresh_from_db()
        self.assertEqual(score, game["score"])
        self.assertEqual(self.session.score, game["score"])

    def test_calculate_score_rejects_a_different_user(self):
        other_user = get_user_model().objects.create_user(username="not-flappy-player")
        with self.assertRaisesMessage(ValueError, "Session not found"):
            calculate_score(
                other_user.id,
                str(self.session.id),
                {"actions": [], "total_ticks": 0, "end_reason": "QUIT"},
            )

        self.session.refresh_from_db()
        self.assertIsNone(self.session.score)
