import copy
import json
from datetime import timedelta
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from hub.models import Game, GameChoices, Session
from pacman.engine import MAX_INPUTS, replay
from pacman.models import PacmanRun
from pacman.tasks import calculate_score

# Generated from the TypeScript engine by frontend/scripts/gen-pacman-fixtures.ts.
FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "parity.json").read_text())


class EngineParityTests(SimpleTestCase):
    def test_python_replay_matches_typescript(self):
        self.assertGreater(len(FIXTURES), 0)
        for fixture in FIXTURES:
            with self.subTest(seed=fixture["seed"]):
                state = replay(fixture["seed"], fixture["log"])
                self.assertEqual(state["score"], fixture["score"])
                self.assertEqual(state["tick"], fixture["ticks"])
                self.assertEqual(state["level"], fixture["level"])

    def test_fixtures_cover_level_clears(self):
        self.assertTrue(any(f["level"] > 1 for f in FIXTURES))


class EngineRejectionTests(SimpleTestCase):
    def setUp(self):
        self.fixture = FIXTURES[0]
        self.log = copy.deepcopy(self.fixture["log"])

    def assertRejected(self, log, message):
        with self.assertRaisesRegex(ValueError, message):
            replay(self.fixture["seed"], log)

    def test_tampered_score(self):
        self.log["claimed_score"] += 10
        self.assertRejected(self.log, "Claimed score")

    def test_wrong_seed(self):
        with self.assertRaises(ValueError):
            replay(int(self.fixture["seed"]) + 1, self.log)

    def test_ticks_out_of_order(self):
        self.log["inputs"][1], self.log["inputs"][2] = self.log["inputs"][2], self.log["inputs"][1]
        self.assertRejected(self.log, "non-decreasing")

    def test_inputs_after_game_over(self):
        self.log["total_ticks"] += 100
        self.assertRejected(self.log, "after game over")

    def test_run_cut_short(self):
        self.log["total_ticks"] -= 100
        self.log["inputs"] = [i for i in self.log["inputs"] if i[0] <= self.log["total_ticks"]]
        self.assertRejected(self.log, "does not end in game over")

    def test_bad_direction(self):
        self.log["inputs"][0][1] = "X"
        self.assertRejected(self.log, "direction")

    def test_wrong_version(self):
        self.log["version"] = 99
        self.assertRejected(self.log, "version")

    def test_oversized_log(self):
        self.log["inputs"] = [[1, "L"]] * (MAX_INPUTS + 1)
        self.assertRejected(self.log, "Too many inputs")

    def test_not_an_object(self):
        self.assertRejected([], "must be an object")


class TaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="player", password="x")
        self.game, _ = Game.objects.get_or_create(name=GameChoices.PACMAN)
        self.fixture = FIXTURES[0]

    def make_session(self, played_seconds=3600):
        session = Session.objects.create(user=self.user, game=self.game)
        Session.objects.filter(pk=session.pk).update(
            seed=int(self.fixture["seed"]),
            created_at=timezone.now() - timedelta(seconds=played_seconds),
        )
        session.refresh_from_db()
        return session

    def test_valid_run_is_verified_and_scored(self):
        session = self.make_session()
        result = calculate_score(str(session.id), self.fixture["log"])
        self.assertEqual(result, {"status": "verified", "score": self.fixture["score"]})
        session.refresh_from_db()
        self.assertEqual(session.score, self.fixture["score"])
        self.assertEqual(session.pacman_run.status, PacmanRun.Status.VERIFIED)

    def test_invalid_run_is_rejected_without_score(self):
        session = self.make_session()
        log = copy.deepcopy(self.fixture["log"])
        log["claimed_score"] += 1000
        result = calculate_score(str(session.id), log)
        self.assertEqual(result["status"], "rejected")
        session.refresh_from_db()
        self.assertIsNone(session.score)
        self.assertIn("Claimed score", session.pacman_run.reason)

    def test_run_faster_than_real_time_is_rejected(self):
        session = self.make_session(played_seconds=1)
        result = calculate_score(str(session.id), self.fixture["log"])
        self.assertEqual(result["status"], "rejected")
        self.assertIn("faster", result["reason"])

    def test_resubmission_keeps_first_result(self):
        session = self.make_session()
        calculate_score(str(session.id), self.fixture["log"])
        forged = copy.deepcopy(self.fixture["log"])
        forged["claimed_score"] = 999999
        result = calculate_score(str(session.id), forged)
        self.assertEqual(result, {"status": "verified", "score": self.fixture["score"]})
        self.assertEqual(PacmanRun.objects.filter(session=session).count(), 1)

    def test_other_game_sessions_are_ignored(self):
        other, _ = Game.objects.get_or_create(name=GameChoices.SNAKE)
        session = Session.objects.create(user=self.user, game=other)
        self.assertIsNone(calculate_score(str(session.id), self.fixture["log"]))
        self.assertFalse(PacmanRun.objects.exists())


class StatusViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="player", password="x")
        self.other = User.objects.create_user(username="other", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.PACMAN)
        self.session = Session.objects.create(user=self.user, game=game)
        self.url = f"/pacman/sessions/{self.session.id}/"

    def test_pending_before_task_runs(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.json(), {"status": "pending", "score": None, "reason": ""})

    def test_reports_result(self):
        PacmanRun.objects.create(
            session=self.session, input_log={}, status=PacmanRun.Status.REJECTED, reason="nope"
        )
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).json()["status"], "rejected")

    def test_other_users_cannot_see_run(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_requires_login(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))
