from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from wordle import services, words
from wordle.engine import CLEARED, LOST, MAX_ATTEMPTS, word_score
from wordle.models import WordleSession
from wordle.services import InvalidGuess, SessionNotActive, SessionNotFound

ALLOWED = frozenset({"crane", "money", "slate", "stone"})


def make_user(name="u1"):
    # Adjust if your custom user model needs other required fields.
    return get_user_model().objects.create_user(username=name, password="pw")


def make_session(user, answers=("crane", "money")):
    return WordleSession.objects.create(
        user=user, words=list(answers), list_version="abc123abc123"
    )


class ServiceTestCase(TestCase):
    def setUp(self):
        self.user = make_user()
        for target, kwargs in (
            (words, {"get_allowed": lambda: ALLOWED}),
        ):
            for name, fn in kwargs.items():
                p = patch.object(target, name, fn)
                p.start()
                self.addCleanup(p.stop)
        p = patch("wordle.services._enqueue_scoring")
        self.enqueue = p.start()
        self.addCleanup(p.stop)


class StartTests(ServiceTestCase):
    def test_creates_session_with_full_sequence(self):
        session, created = services.start_session(self.user)
        self.assertTrue(created)
        self.assertEqual(len(session.words), words.SEQUENCE_LENGTH)
        self.assertEqual(session.status, WordleSession.Status.ACTIVE)

    def test_second_start_resumes_same_session(self):
        first, _ = services.start_session(self.user)
        second, created = services.start_session(self.user)
        self.assertFalse(created)
        self.assertEqual(first.id, second.id)

    def test_snapshot_never_contains_words(self):
        session, _ = services.start_session(self.user)
        snap = services.snapshot(session)
        self.assertNotIn("words", snap)
        for answer in session.words:
            self.assertNotIn(answer, str(snap))


class GuessTests(ServiceTestCase):
    def test_wrong_guess_consumes_an_attempt_and_logs_event(self):
        s = make_session(self.user)
        out = services.submit_guess(self.user, s.id, "slate")
        self.assertFalse(out.solved)
        self.assertEqual(out.session.attempts, 1)
        self.assertEqual(s.events.count(), 1)

    def test_guess_is_normalized(self):
        s = make_session(self.user)
        services.submit_guess(self.user, s.id, "  SLATE ")
        self.assertEqual(s.events.get().word, "slate")

    def test_invalid_word_is_free(self):
        s = make_session(self.user)
        with self.assertRaisesMessage(InvalidGuess, "not in the allowed"):
            services.submit_guess(self.user, s.id, "zzzzz")
        s.refresh_from_db()
        self.assertEqual(s.attempts, 0)
        self.assertEqual(s.events.count(), 0)

    def test_solve_advances_and_resets_attempts(self):
        s = make_session(self.user)
        services.submit_guess(self.user, s.id, "slate")
        out = services.submit_guess(self.user, s.id, "crane")
        self.assertTrue(out.solved)
        snap = services.snapshot(out.session)
        self.assertEqual(
            (snap["word_number"], snap["attempts"], snap["board"]), (2, 0, [])
        )
        self.assertEqual(out.session.score, word_score(2))

    def test_board_shows_current_word_only(self):
        s = make_session(self.user)
        services.submit_guess(self.user, s.id, "crane")   # solves word 1
        services.submit_guess(self.user, s.id, "slate")
        services.submit_guess(self.user, s.id, "stone")
        board = services.snapshot(WordleSession.objects.get(pk=s.id))["board"]
        self.assertEqual([r["word"] for r in board], ["slate", "stone"])

    def test_losing_reveals_answer_and_enqueues_scoring(self):
        s = make_session(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            for _ in range(MAX_ATTEMPTS - 1):
                out = services.submit_guess(self.user, s.id, "slate")
                self.assertIsNone(out.answer)
            out = services.submit_guess(self.user, s.id, "slate")
        self.assertEqual(out.session.game_status, LOST)
        self.assertEqual(out.answer, "crane")
        self.assertEqual(out.session.status, WordleSession.Status.FINISHED)
        self.assertIsNotNone(out.session.finished_at)
        self.enqueue.assert_called_once_with(s.id)

    def test_clearing_every_word_finishes_the_game(self):
        s = make_session(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            services.submit_guess(self.user, s.id, "crane")
            out = services.submit_guess(self.user, s.id, "money")
        self.assertEqual(out.session.game_status, CLEARED)
        self.assertEqual(out.session.status, WordleSession.Status.FINISHED)
        self.assertEqual(out.session.score, 2 * word_score(1))
        self.enqueue.assert_called_once_with(s.id)

    def test_guess_after_game_over_rejected(self):
        s = make_session(self.user, answers=("crane",))
        services.submit_guess(self.user, s.id, "crane")
        with self.assertRaises(SessionNotActive):
            services.submit_guess(self.user, s.id, "slate")

    def test_other_users_session_looks_nonexistent(self):
        s = make_session(self.user)
        with self.assertRaises(SessionNotFound):
            services.submit_guess(make_user("intruder"), s.id, "slate")

    def test_malformed_session_id(self):
        with self.assertRaises(SessionNotFound):
            services.submit_guess(self.user, "not-a-uuid", "slate")


class FinishTests(ServiceTestCase):
    def test_abandon_finishes_and_enqueues_once(self):
        s = make_session(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            services.finish_session(self.user, s.id)
            services.finish_session(self.user, s.id)  # idempotent
        s.refresh_from_db()
        self.assertEqual(s.status, WordleSession.Status.FINISHED)
        self.assertEqual(s.game_status, "in_progress")
        self.enqueue.assert_called_once_with(s.id)

    def test_new_game_allowed_after_finish(self):
        s = make_session(self.user)
        services.finish_session(self.user, s.id)
        _, created = services.start_session(self.user)
        self.assertTrue(created)
