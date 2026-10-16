from unittest.mock import patch
from uuid import uuid4

from django.test import SimpleTestCase
from rest_framework.test import APIClient

from wordle.words import pick_sequence


class StatelessWordleApiTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        self.session_id = str(uuid4())
        self.seed = 12345
        self.answers = ["crane", "money"]
        self.allowed = {"crane", "money", "slate"}
        self.sequence_patch = patch("wordle.views.words.pick_sequence", return_value=self.answers)
        self.allowed_patch = patch("wordle.views.words.get_allowed", return_value=self.allowed)
        self.sequence_patch.start()
        self.allowed_patch.start()
        self.addCleanup(self.sequence_patch.stop)
        self.addCleanup(self.allowed_patch.stop)

    def initialize(self, guesses=None):
        return self.client.post(
            "/wordle/initialize",
            {
                "session_id": self.session_id,
                "seed": self.seed,
                "guesses": guesses or [],
            },
            format="json",
        )

    def test_answer_sequence_is_repeatable_for_a_seed(self):
        self.assertEqual(pick_sequence(self.seed), pick_sequence(self.seed))

    def test_initialize_returns_engine_state_without_persistence(self):
        response = self.initialize()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session_id"], self.session_id)
        self.assertEqual(response.data["game_status"], "in_progress")
        self.assertNotIn("answers", response.data)
        self.assertNotIn("words", response.data)

    def test_guess_endpoint_replays_client_history_and_loses_after_six_wrong_guesses(self):
        history = []
        response = None
        for _ in range(6):
            response = self.client.post(
                "/wordle/guess",
                {
                    "session_id": self.session_id,
                    "seed": self.seed,
                    "guesses": history,
                    "guess": "slate",
                },
                format="json",
            )
            self.assertEqual(response.status_code, 200)
            history.append("slate")

        self.assertEqual(response.data["game_status"], "lost")
        self.assertEqual(response.data["answer"], "crane")
        self.assertEqual(len(response.data["board"]), 6)
        restored = self.initialize(history)
        self.assertEqual(restored.data["game_status"], "lost")
        self.assertEqual(restored.data["answer"], "crane")

    def test_invalid_guess_does_not_change_history_or_attempts(self):
        response = self.client.post(
            "/wordle/guess",
            {
                "session_id": self.session_id,
                "seed": self.seed,
                "guesses": [],
                "guess": "zzzzz",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["error"]["code"], "invalid_guess")
