from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from hub.models import Game, GameChoices, Session
from wordle.words import pick_sequence


class WordleSessionApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.seed = 12345
        self.user = get_user_model().objects.create_user(
            username=f"player-{uuid4()}", password="test-password"
        )
        game = Game.objects.create(name=GameChoices.WORDLE)
        self.session = Session.objects.create(
            game=game, user=self.user, seed=self.seed
        )
        self.session_id = str(self.session.id)
        self.answers = ["crane", "money"]
        self.allowed = {"crane", "money", "slate"}
        sequence_patch = patch("wordle.views.words.pick_sequence", return_value=self.answers)
        allowed_patch = patch("wordle.views.words.get_allowed", return_value=self.allowed)
        sequence_patch.start()
        allowed_patch.start()
        self.addCleanup(sequence_patch.stop)
        self.addCleanup(allowed_patch.stop)

    def initialize(self):
        return self.client.post(
            "/wordle/initialize",
            {"session_id": self.session_id, "seed": self.seed},
            format="json",
        )

    def submit(self, guess, forged_history=None):
        payload = {"session_id": self.session_id, "seed": self.seed, "guess": guess}
        if forged_history is not None:
            payload["guesses"] = forged_history
        return self.client.post("/wordle/guess", payload, format="json")

    def test_answer_sequence_is_repeatable_for_a_session_and_seed(self):
        self.assertEqual(
            pick_sequence(self.seed, self.session_id),
            pick_sequence(self.seed, self.session_id),
        )

    def test_initialize_returns_state_for_existing_hub_session(self):
        response = self.initialize()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session_id"], self.session_id)
        self.assertEqual(response.data["game_status"], "in_progress")
        self.assertEqual(response.data["time_remaining"], 120)
        self.assertNotIn("answers", response.data)
        self.assertNotIn("words", response.data)

    def test_six_misses_advance_and_cannot_be_reset_by_client_history(self):
        response = None
        for _ in range(6):
            response = self.submit("slate", forged_history=[])
            self.assertEqual(response.status_code, 200)

        self.assertEqual(response.data["game_status"], "in_progress")
        self.assertEqual(response.data["word_number"], 2)
        self.assertEqual(response.data["board"], [])
        restored = self.initialize()
        self.assertEqual(restored.data["word_number"], 2)

    def test_invalid_guess_does_not_consume_an_attempt(self):
        self.initialize()
        response = self.submit("zzzzz")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["error"]["code"], "invalid_guess")
        restored = self.initialize()
        self.assertEqual(restored.data["attempts"], 0)

    def test_server_deadline_rejects_late_guesses(self):
        self.initialize()
        self.session.refresh_from_db()
        self.session.wordle_state["deadline"] = timezone.now().timestamp() - 1
        self.session.save(update_fields=["wordle_state"])

        response = self.submit("slate")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["game_status"], "time_up")
        self.assertEqual(response.data["time_remaining"], 0)
        self.session.refresh_from_db()
        self.assertEqual(self.session.wordle_state["guesses"], [])

    def test_nonexistent_session_or_wrong_seed_is_rejected(self):
        response = self.client.post(
            "/wordle/initialize",
            {"session_id": str(uuid4()), "seed": self.seed},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.post(
            "/wordle/initialize",
            {"session_id": self.session_id, "seed": self.seed + 1},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
