from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from wordle import words
from wordle.models import WordleSession

ALLOWED = frozenset({"crane", "money", "slate", "stone"})


def make_user(name="u1"):
    # Adjust if your custom user model needs other required fields.
    return get_user_model().objects.create_user(username=name, password="pw")


def make_session(user, answers=("crane", "money")):
    return WordleSession.objects.create(
        user=user, words=list(answers), list_version="abc123abc123"
    )


class ApiTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters
        self.user = make_user()
        self.client.force_authenticate(self.user)
        for p in (
            patch.object(words, "get_allowed", lambda: ALLOWED),
            patch("wordle.services._enqueue_scoring"),
        ):
            p.start()
            self.addCleanup(p.stop)

    def guess(self, session, word):
        return self.client.post(
            "/wordle/guess", {"session_id": str(session.id), "guess": word}, format="json"
        )


class AuthTests(ApiTestCase):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        for path in ("/wordle/start", "/wordle/guess", "/wordle/finish"):
            self.assertIn(self.client.post(path, {}, format="json").status_code, (401, 403))
        self.assertIn(self.client.get("/wordle/state").status_code, (401, 403))


class StartTests(ApiTestCase):
    def test_start_then_resume(self):
        first = self.client.post("/wordle/start")
        self.assertEqual(first.status_code, 201)
        self.assertFalse(first.data["resumed"])
        self.assertEqual(first.data["total_words"], words.SEQUENCE_LENGTH)

        second = self.client.post("/wordle/start")
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["resumed"])
        self.assertEqual(first.data["session_id"], second.data["session_id"])

    def test_response_has_no_words_key(self):
        self.assertNotIn("words", self.client.post("/wordle/start").data)


class GuessTests(ApiTestCase):
    def test_wrong_guess(self):
        s = make_session(self.user)
        r = self.guess(s, "slate")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.data["solved"])
        self.assertEqual(r.data["attempts"], 1)
        self.assertEqual(len(r.data["mask"]), 5)
        self.assertIsNone(r.data["answer"])

    def test_response_never_leaks_answers(self):
        s = make_session(self.user)
        body = self.guess(s, "slate").content.decode()
        self.assertNotIn("crane", body)
        self.assertNotIn("money", body)

    def test_solve_moves_to_next_word(self):
        s = make_session(self.user)
        r = self.guess(s, "crane")
        self.assertTrue(r.data["solved"])
        self.assertEqual(r.data["mask"], [2] * 5)
        self.assertEqual((r.data["word_number"], r.data["attempts"]), (2, 0))

    def test_invalid_word_is_422_and_free(self):
        s = make_session(self.user)
        r = self.guess(s, "zzzzz")
        self.assertEqual(r.status_code, 422)
        self.assertEqual(r.data["error"]["code"], "invalid_guess")
        s.refresh_from_db()
        self.assertEqual(s.attempts, 0)

    def test_wrong_length_is_422(self):
        self.assertEqual(self.guess(make_session(self.user), "cat").status_code, 422)

    def test_guess_after_game_over_is_409(self):
        s = make_session(self.user, answers=("crane",))
        self.guess(s, "crane")
        r = self.guess(s, "slate")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.data["error"]["code"], "session_not_active")

    def test_losing_reveals_answer(self):
        s = make_session(self.user)
        for _ in range(6):
            r = self.guess(s, "slate")
        self.assertEqual(r.data["game_status"], "lost")
        self.assertEqual(r.data["answer"], "crane")

    def test_someone_elses_session_is_404(self):
        s = make_session(make_user("other"))
        self.assertEqual(self.guess(s, "slate").status_code, 404)

    def test_malformed_session_id_is_400(self):
        r = self.client.post(
            "/wordle/guess", {"session_id": "nope", "guess": "slate"}, format="json"
        )
        self.assertEqual(r.status_code, 400)

    def test_missing_guess_is_400(self):
        s = make_session(self.user)
        r = self.client.post("/wordle/guess", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 400)


class FinishAndStateTests(ApiTestCase):
    def test_finish_is_idempotent(self):
        s = make_session(self.user)
        for _ in range(2):
            r = self.client.post("/wordle/finish", {"session_id": str(s.id)}, format="json")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.data["status"], "finished")

    def test_state_404_without_game_then_200(self):
        r = self.client.get("/wordle/state")
        self.assertEqual((r.status_code, r.data["error"]["code"]), (404, "no_active_session"))
        make_session(self.user)
        self.assertEqual(self.client.get("/wordle/state").status_code, 200)

    def test_state_restores_board_after_reload(self):
        s = make_session(self.user)
        self.guess(s, "slate")
        self.guess(s, "stone")
        board = self.client.get("/wordle/state").data["board"]
        self.assertEqual([row["word"] for row in board], ["slate", "stone"])
