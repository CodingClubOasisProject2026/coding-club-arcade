from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from hub.models import Game, GameChoices, Session
from wordle.tasks import calculate_score


class WordleScoreTaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="wordle-task-player")
        self.game = Game.objects.create(name=GameChoices.WORDLE)
        self.session = Session.objects.create(
            user=self.user,
            game=self.game,
            seed=42,
            wordle_state={"guesses": []},
        )

    @patch("wordle.tasks.words.get_allowed", return_value=set())
    @patch("wordle.tasks.words.pick_sequence", return_value=[])
    @patch(
        "wordle.tasks.replay",
        return_value=SimpleNamespace(state=SimpleNamespace(score=17)),
    )
    def test_calculate_score_saves_the_server_replayed_result(
        self, _replay, _pick_sequence, _get_allowed
    ):
        score = calculate_score(self.user.id, str(self.session.id), {})

        self.session.refresh_from_db()
        self.assertEqual(score, 17)
        self.assertEqual(self.session.score, 17)

    def test_calculate_score_rejects_a_different_user(self):
        other_user = get_user_model().objects.create_user(username="not-wordle-player")

        with self.assertRaisesMessage(ValueError, "Session not found"):
            calculate_score(other_user.id, str(self.session.id), {})
