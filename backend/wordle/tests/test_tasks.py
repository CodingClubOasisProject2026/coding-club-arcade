from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from wordle import services, tasks, words
from wordle.models import WordleSession

ALLOWED = frozenset({"crane", "money", "slate", "stone"})


def make_user(name="u1"):
    # Adjust if your custom user model needs other required fields.
    return get_user_model().objects.create_user(username=name, password="pw")


class TaskTestCase(TestCase):
    def setUp(self):
        self.user = make_user()
        for p in (
            patch.object(words, "get_allowed", lambda: ALLOWED),
            patch("wordle.services._enqueue_scoring"),
        ):
            p.start()
            self.addCleanup(p.stop)
        p = patch("wordle.tasks._enqueue_scoring")
        self.sweep_enqueue = p.start()
        self.addCleanup(p.stop)

    def make_session(self, answers=("crane", "money")):
        return WordleSession.objects.create(
            user=self.user, words=list(answers), list_version="abc123abc123"
        )

    def play(self, session, guesses):
        for g in guesses:
            services.submit_guess(self.user, session.id, g)
        session.refresh_from_db()
        return session

    def lost_game(self):
        """Solve word 1 in two tries, then lose on word 2."""
        s = self.make_session()
        return self.play(s, ["slate", "crane"] + ["slate"] * 6)


class ScoreSessionTests(TaskTestCase):
    def test_clean_game_verifies(self):
        s = self.lost_game()
        out = tasks.score_session(str(s.id))
        self.assertEqual((out["outcome"], out["matched"]), ("scored", True))
        s.refresh_from_db()
        self.assertEqual(s.status, WordleSession.Status.SCORED)
        self.assertIs(s.replay_matched, True)
        self.assertEqual(s.replay_error, "")
        self.assertIsNotNone(s.scored_at)

    def test_tampered_score_is_flagged_not_overwritten(self):
        s = self.lost_game()
        WordleSession.objects.filter(pk=s.id).update(score=9999)
        tasks.score_session(str(s.id))
        s.refresh_from_db()
        self.assertIs(s.replay_matched, False)
        self.assertIn("score: live=9999", s.replay_error)
        self.assertEqual(s.score, 9999)  # live value untouched
        self.assertEqual(s.status, WordleSession.Status.SCORED)

    def test_tampered_event_mask_is_flagged(self):
        s = self.lost_game()
        ev = s.events.get(seq=1)
        ev.mask = [2, 2, 2, 2, 2]
        ev.save(update_fields=["mask"])
        tasks.score_session(str(s.id))
        s.refresh_from_db()
        self.assertIs(s.replay_matched, False)
        self.assertIn("stored mask", s.replay_error)

    def test_deleted_event_is_flagged(self):
        s = self.lost_game()
        s.events.get(seq=1).delete()
        tasks.score_session(str(s.id))
        s.refresh_from_db()
        self.assertIs(s.replay_matched, False)
        self.assertIn("not gapless", s.replay_error)

    def test_idempotent(self):
        s = self.lost_game()
        tasks.score_session(str(s.id))
        s.refresh_from_db()
        first_scored_at = s.scored_at
        out = tasks.score_session(str(s.id))
        self.assertEqual(out["outcome"], "already_scored")
        s.refresh_from_db()
        self.assertEqual(s.scored_at, first_scored_at)

    def test_active_session_is_skipped(self):
        s = self.make_session()
        out = tasks.score_session(str(s.id))
        self.assertEqual(out["outcome"], "not_finished")
        s.refresh_from_db()
        self.assertEqual(s.status, WordleSession.Status.ACTIVE)

    def test_unknown_session(self):
        self.assertEqual(tasks.score_session(str(uuid4()))["outcome"], "missing")

    def test_other_rules_version_is_not_verified(self):
        s = self.lost_game()
        WordleSession.objects.filter(pk=s.id).update(rules_version=99)
        tasks.score_session(str(s.id))
        s.refresh_from_db()
        self.assertIsNone(s.replay_matched)
        self.assertIn("not verified", s.replay_error)
        self.assertEqual(s.status, WordleSession.Status.SCORED)

    def test_abandoned_game_verifies(self):
        s = self.play(self.make_session(), ["slate", "crane", "slate"])
        services.finish_session(self.user, s.id)
        out = tasks.score_session(str(s.id))
        self.assertTrue(out["matched"])


class SweeperTests(TaskTestCase):
    def backdate_session(self, session, minutes=60):
        old = timezone.now() - timedelta(minutes=minutes)
        WordleSession.objects.filter(pk=session.id).update(started_at=old)
        session.events.update(created_at=old)

    def test_idle_session_is_abandoned_and_enqueued(self):
        s = self.make_session()
        self.backdate_session(s)
        with self.captureOnCommitCallbacks(execute=True):
            out = tasks.sweep_stale_sessions()
        self.assertEqual(out["abandoned"], 1)
        s.refresh_from_db()
        self.assertEqual(s.status, WordleSession.Status.FINISHED)
        self.assertEqual(s.game_status, "in_progress")
        self.sweep_enqueue.assert_called_once_with(s.id)

    def test_idle_session_with_old_events_is_abandoned(self):
        s = self.play(self.make_session(), ["slate"])
        self.backdate_session(s)
        self.assertEqual(tasks.sweep_stale_sessions()["abandoned"], 1)

    def test_recent_session_is_left_alone(self):
        s = self.make_session()
        self.assertEqual(tasks.sweep_stale_sessions()["abandoned"], 0)
        s.refresh_from_db()
        self.assertEqual(s.status, WordleSession.Status.ACTIVE)

    def test_old_session_with_recent_guess_is_left_alone(self):
        s = self.make_session()
        WordleSession.objects.filter(pk=s.id).update(
            started_at=timezone.now() - timedelta(hours=2)
        )
        self.play(s, ["slate"])  # event created just now
        self.assertEqual(tasks.sweep_stale_sessions()["abandoned"], 0)

    def test_finished_unscored_session_is_requeued(self):
        s = self.lost_game()
        WordleSession.objects.filter(pk=s.id).update(
            finished_at=timezone.now() - timedelta(minutes=10)
        )
        with patch.object(tasks.score_session, "delay") as delay:
            out = tasks.sweep_stale_sessions()
        self.assertEqual(out["requeued"], 1)
        delay.assert_called_once_with(str(s.id))

    def test_just_finished_and_already_scored_are_not_requeued(self):
        fresh = self.lost_game()  # finished_at = now: inside the grace window
        other = make_user("u2")
        done = WordleSession.objects.create(
            user=other, words=["crane"], list_version="abc123abc123",
            status=WordleSession.Status.SCORED,
            finished_at=timezone.now() - timedelta(hours=1),
        )
        with patch.object(tasks.score_session, "delay") as delay:
            out = tasks.sweep_stale_sessions()
        self.assertEqual(out["requeued"], 0)
        delay.assert_not_called()

    def test_failures_are_surfaced_not_swallowed(self):
        s = self.make_session()
        self.backdate_session(s)
        with patch("wordle.tasks._abandon_if_idle", side_effect=RuntimeError("boom")):
            with self.assertRaisesMessage(RuntimeError, "sweeper failed for 1"):
                tasks.sweep_stale_sessions()
