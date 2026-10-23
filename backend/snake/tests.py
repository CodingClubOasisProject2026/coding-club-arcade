import copy
import json
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from hub.models import Game, GameChoices, Session
from snake import game_logic as gl
from snake.game_logic import (
    BOARD_HEIGHT,
    BOARD_WIDTH,
    MAX_TICKS,
    create_game,
    move_snake,
    next_random,
    replay_actions,
    seed_to_rng,
    tick_delay_ms,
)
from snake.tasks import calculate_score

# Generated from the TypeScript engine by frontend/scripts/gen-snake-fixtures.ts.
FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "parity.json").read_text())
BY_NAME = {}
for _fixture in FIXTURES:
    BY_NAME.setdefault(_fixture["name"], _fixture)


def fixture_log(name="greedy"):
    return copy.deepcopy(BY_NAME[name]["log"])


def game_with(snake, direction="RIGHT", apple=None):
    """A game in a hand-built position. Apple defaults to a far corner."""
    game = create_game(1)
    game["snake"] = [list(cell) for cell in snake]
    game["direction"] = direction
    game["apple"] = list(apple) if apple else [BOARD_WIDTH - 1, BOARD_HEIGHT - 1]
    return game


class EngineParityTests(SimpleTestCase):
    """The Python replay must reach exactly the state the TypeScript engine did."""

    def test_python_replay_matches_typescript(self):
        self.assertGreater(len(FIXTURES), 0)
        for fixture in FIXTURES:
            with self.subTest(name=fixture["name"], seed=fixture["seed"]):
                game = replay_actions(int(fixture["seed"]), fixture["log"])
                self.assertEqual(game["score"], fixture["score"])
                self.assertEqual(game["apples_eaten"], fixture["apples_eaten"])
                self.assertEqual(game["status"], fixture["status"])
                self.assertEqual(game["tick"], fixture["log"]["total_ticks"])
                self.assertEqual(game["apple"], fixture["apple"])
                self.assertEqual(game["snake"][0], fixture["head"])
                self.assertEqual(len(game["snake"]), fixture["length"])
                self.assertEqual(game["min_ms"], fixture["min_ms"])

    def test_fixtures_cover_each_ending(self):
        statuses = {f["status"] for f in FIXTURES}
        self.assertEqual(statuses, {"GAME_OVER", "WON"})
        self.assertTrue(any(f["score"] > 0 for f in FIXTURES if f["status"] == "GAME_OVER"))

    def test_winning_run_fills_the_board(self):
        win = BY_NAME["win"]
        self.assertEqual(win["length"], BOARD_WIDTH * BOARD_HEIGHT)
        self.assertIsNone(win["apple"])


class RngTests(SimpleTestCase):
    def test_xorshift_matches_reference_values(self):
        game = {"rng": 1}
        self.assertEqual([next_random(game) for _ in range(3)], [270369, 67634689, 2647435461])

    def test_zero_seed_uses_fallback_state(self):
        self.assertEqual(seed_to_rng(0), 0x6D2B79F5)
        self.assertEqual(seed_to_rng(2**32), 0x6D2B79F5)

    def test_seed_is_reduced_to_32_bits(self):
        self.assertEqual(seed_to_rng(2**32 + 5), 5)
        self.assertEqual(seed_to_rng(2**63 - 1), 0xFFFFFFFF)

    def test_output_stays_in_uint32(self):
        game = {"rng": 0xFFFFFFFF}
        for _ in range(1000):
            value = next_random(game)
            self.assertTrue(0 < value <= 0xFFFFFFFF)


class EngineRuleTests(SimpleTestCase):
    def test_initial_state(self):
        game = create_game(42)
        self.assertEqual(game["snake"], [[5, 5], [4, 5], [3, 5]])
        self.assertEqual(game["direction"], "RIGHT")
        self.assertEqual((game["score"], game["tick"], game["min_ms"]), (0, 0, 0))
        self.assertEqual(game["status"], "ACTIVE")
        self.assertNotIn(game["apple"], game["snake"])

    def test_same_seed_same_apples(self):
        self.assertEqual(create_game(99)["apple"], create_game(99)["apple"])
        apples = {tuple(create_game(seed)["apple"]) for seed in range(1, 50)}
        self.assertGreater(len(apples), 1)

    def test_plain_move_keeps_length(self):
        game = game_with([[5, 5], [4, 5], [3, 5]])
        move_snake(game, "DOWN")
        self.assertEqual(game["snake"], [[5, 6], [5, 5], [4, 5]])
        self.assertEqual((game["direction"], game["tick"], game["score"]), ("DOWN", 1, 0))

    def test_eating_grows_scores_and_respawns_apple(self):
        game = game_with([[5, 5], [4, 5], [3, 5]], apple=[6, 5])
        move_snake(game, "RIGHT")
        self.assertEqual(game["snake"], [[6, 5], [5, 5], [4, 5], [3, 5]])
        self.assertEqual((game["score"], game["apples_eaten"]), (gl.POINTS_PER_APPLE, 1))
        self.assertIsNotNone(game["apple"])
        self.assertNotIn(game["apple"], game["snake"])

    def test_walls_end_the_game(self):
        cases = {
            "RIGHT": [[BOARD_WIDTH - 1, 5], [BOARD_WIDTH - 2, 5]],
            "LEFT": [[0, 5], [1, 5]],
            "UP": [[5, 0], [5, 1]],
            "DOWN": [[5, BOARD_HEIGHT - 1], [5, BOARD_HEIGHT - 2]],
        }
        for direction, snake in cases.items():
            with self.subTest(direction=direction):
                game = game_with(snake, direction=direction)
                move_snake(game, direction)
                self.assertEqual(game["status"], "GAME_OVER")
                self.assertEqual(game["snake"], snake)  # head doesn't leave the board
                self.assertEqual(game["tick"], 1)

    def test_biting_own_body_ends_the_game(self):
        # Head at (5,5) moving UP into (5,4), which is mid-body.
        snake = [[5, 5], [6, 5], [6, 4], [5, 4], [4, 4]]
        game = game_with(snake, direction="LEFT")
        move_snake(game, "UP")
        self.assertEqual(game["status"], "GAME_OVER")

    def test_moving_into_the_tail_cell_is_allowed(self):
        # The tail moves away on the same tick, so chasing it is safe.
        snake = [[5, 5], [6, 5], [6, 4], [5, 4]]
        game = game_with(snake, direction="LEFT")
        move_snake(game, "UP")
        self.assertEqual(game["status"], "ACTIVE")
        self.assertEqual(game["snake"][0], [5, 4])

    def test_eating_into_the_tail_cell_is_a_collision(self):
        # When growing, the tail stays put, so the same move is fatal.
        snake = [[5, 5], [6, 5], [6, 4], [5, 4]]
        game = game_with(snake, direction="LEFT", apple=[5, 4])
        move_snake(game, "UP")
        self.assertEqual(game["status"], "GAME_OVER")

    def test_filling_the_board_wins(self):
        # Snake covers every cell but (0, 0), heading for it with the apple there.
        cells = [[x, y] for y in range(BOARD_HEIGHT) for x in range(BOARD_WIDTH) if (x, y) != (0, 0)]
        snake = [[1, 0]] + [c for c in cells if c != [1, 0]]
        game = game_with(snake, direction="LEFT", apple=[0, 0])
        move_snake(game, "LEFT")
        self.assertEqual(game["status"], "WON")
        self.assertIsNone(game["apple"])
        self.assertEqual(len(game["snake"]), BOARD_WIDTH * BOARD_HEIGHT)

    def test_reverse_invalid_and_inactive_moves_raise(self):
        game = create_game(1)
        with self.assertRaisesRegex(ValueError, "reverse"):
            move_snake(game, "LEFT")
        with self.assertRaisesRegex(ValueError, "Invalid direction"):
            move_snake(game, "up")
        game["status"] = "GAME_OVER"
        with self.assertRaisesRegex(ValueError, "not active"):
            move_snake(game, "UP")

    def test_tick_delay_speeds_up_then_floors(self):
        self.assertEqual(tick_delay_ms(0), 150)
        self.assertEqual(tick_delay_ms(5), 130)
        self.assertEqual(tick_delay_ms(15), 90)
        self.assertEqual(tick_delay_ms(400), 90)

    def test_min_ms_uses_speed_before_each_move(self):
        game = game_with([[5, 5], [4, 5], [3, 5]], apple=[6, 5])
        move_snake(game, "RIGHT")  # eats: this tick still costs 150
        move_snake(game, "RIGHT")  # now one apple eaten: 146
        self.assertEqual(game["min_ms"], 150 + 146)


class ReplayValidationTests(SimpleTestCase):
    def setUp(self):
        self.fixture = BY_NAME["greedy"]
        self.seed = int(self.fixture["seed"])
        self.log = fixture_log()

    def assertRejected(self, log, message):
        with self.assertRaisesRegex(ValueError, message):
            replay_actions(self.seed, log)

    def test_log_must_be_an_object(self):
        for bad in ([], "x", None, 5):
            with self.subTest(bad=bad):
                self.assertRejected(bad, "JSON object")

    def test_actions_must_be_a_list(self):
        self.log["actions"] = {"tick": 1}
        self.assertRejected(self.log, "must be a list")

    def test_total_ticks_must_be_a_sane_int(self):
        for bad in (-1, MAX_TICKS + 1, "10", 10.0, True, None):
            with self.subTest(bad=bad):
                self.log["total_ticks"] = bad
                self.assertRejected(self.log, "total_ticks")

    def test_end_reason_must_be_known(self):
        for bad in ("DIED", "collision", None):
            with self.subTest(bad=bad):
                self.log["end_reason"] = bad
                self.assertRejected(self.log, "end_reason")

    def test_action_shape(self):
        self.log["actions"][0] = ["UP", 3]
        self.assertRejected(self.log, "must be an object")

    def test_action_tick_range(self):
        for bad in (0, -1, self.log["total_ticks"] + 1, "3", 2.0, True):
            with self.subTest(bad=bad):
                log = fixture_log()
                log["actions"][0]["tick"] = bad
                self.assertRejected(log, "action tick")

    def test_action_ticks_strictly_increase(self):
        log = fixture_log()
        log["actions"][1]["tick"] = log["actions"][0]["tick"]
        self.assertRejected(log, "strictly increasing")
        log = fixture_log()
        log["actions"][0], log["actions"][1] = log["actions"][1], log["actions"][0]
        self.assertRejected(log, "strictly increasing")

    def test_bad_direction(self):
        for bad in ("up", "NORTH", None, 1):
            with self.subTest(bad=bad):
                log = fixture_log()
                log["actions"][0]["direction"] = bad
                self.assertRejected(log, "Invalid direction")

    def test_reversing_is_rejected(self):
        log = {"actions": [{"tick": 1, "direction": "LEFT"}], "total_ticks": 1, "end_reason": "QUIT"}
        self.assertRejected(log, "reverse")

    def test_ticks_after_game_over(self):
        self.log["total_ticks"] += 1
        self.assertRejected(self.log, "after the game ended")

    def test_claiming_collision_on_a_run_cut_short(self):
        self.log["total_ticks"] -= 1
        self.log["actions"] = [a for a in self.log["actions"] if a["tick"] <= self.log["total_ticks"]]
        self.assertRejected(self.log, "did not end in a collision")

    def test_claiming_a_win_after_dying(self):
        self.log["end_reason"] = "WON"
        self.assertRejected(self.log, "did not end in a win")

    def test_quit_after_dying(self):
        self.log["end_reason"] = "QUIT"
        self.assertRejected(self.log, "already ended")

    def test_quit_mid_game_keeps_score_so_far(self):
        # Stop the winning run partway through; the snake is still alive.
        log = fixture_log("win")
        log["total_ticks"] = 2000
        log["actions"] = [a for a in log["actions"] if a["tick"] <= 2000]
        log["end_reason"] = "QUIT"
        game = replay_actions(int(BY_NAME["win"]["seed"]), log)
        self.assertEqual(game["status"], "QUIT")
        self.assertGreater(game["score"], 0)

    def test_empty_quit(self):
        game = replay_actions(1, {"actions": [], "total_ticks": 0, "end_reason": "QUIT"})
        self.assertEqual((game["score"], game["status"]), (0, "QUIT"))

    def test_client_claimed_score_is_ignored(self):
        self.log["score"] = 999_999
        game = replay_actions(self.seed, self.log)
        self.assertEqual(game["score"], self.fixture["score"])

    def test_log_does_not_replay_under_another_seed(self):
        # Apples land elsewhere, so the same moves can't produce the same run.
        other = self.seed + 1
        try:
            game = replay_actions(other, self.log)
        except ValueError:
            return
        self.assertNotEqual(
            (game["score"], game["apple"]), (self.fixture["score"], self.fixture["apple"])
        )

    def test_tampered_turn_changes_the_outcome(self):
        # Delay the first turn by one tick: the run diverges and is rejected or rescored.
        self.log["actions"][0]["tick"] += 1
        if len(self.log["actions"]) > 1 and self.log["actions"][1]["tick"] == self.log["actions"][0]["tick"]:
            self.log["actions"].pop(1)
        try:
            game = replay_actions(self.seed, self.log)
        except ValueError:
            return
        self.assertNotEqual(game["score"], self.fixture["score"])


class TaskTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="player", password="x")
        self.game, _ = Game.objects.get_or_create(name=GameChoices.SNAKE)

    def make_session(self, fixture=None, played_seconds=3 * 3600, user=None, game=None):
        fixture = fixture or BY_NAME["greedy"]
        session = Session.objects.create(user=user or self.user, game=game or self.game)
        Session.objects.filter(pk=session.pk).update(
            seed=int(fixture["seed"]),
            created_at=timezone.now() - timedelta(seconds=played_seconds),
        )
        session.refresh_from_db()
        return session

    def run_task(self, session, log, user=None):
        return calculate_score((user or self.user).pk, str(session.id), log)

    def test_every_fixture_is_scored(self):
        for fixture in FIXTURES:
            with self.subTest(name=fixture["name"], seed=fixture["seed"]):
                session = self.make_session(fixture)
                self.assertEqual(self.run_task(session, fixture["log"]), fixture["score"])
                session.refresh_from_db()
                self.assertEqual(session.score, fixture["score"])

    def test_invalid_log_saves_no_score(self):
        session = self.make_session()
        log = fixture_log()
        log["end_reason"] = "WON"
        with self.assertLogs("snake.tasks", "WARNING") as logs:
            self.assertIsNone(self.run_task(session, log))
        self.assertIn("did not end in a win", logs.output[0])
        session.refresh_from_db()
        self.assertIsNone(session.score)

    def test_garbage_payload_saves_no_score(self):
        session = self.make_session()
        for bad in ([], "nope", None, {"actions": "x"}):
            with self.subTest(bad=bad), self.assertLogs("snake.tasks", "WARNING"):
                self.assertIsNone(self.run_task(session, bad))
        session.refresh_from_db()
        self.assertIsNone(session.score)

    def test_run_faster_than_real_time_is_rejected(self):
        fixture = BY_NAME["win"]  # ~1 hour of minimum play time
        session = self.make_session(fixture, played_seconds=60)
        with self.assertLogs("snake.tasks", "WARNING") as logs:
            self.assertIsNone(self.run_task(session, fixture["log"]))
        self.assertIn("faster", logs.output[0])
        session.refresh_from_db()
        self.assertIsNone(session.score)

    def test_real_time_check_allows_clock_slack(self):
        fixture = BY_NAME["greedy"]
        just_enough = fixture["min_ms"] / 1000 * 0.92
        session = self.make_session(fixture, played_seconds=just_enough)
        self.assertEqual(self.run_task(session, fixture["log"]), fixture["score"])

        too_fast = fixture["min_ms"] / 1000 * 0.85
        session = self.make_session(fixture, played_seconds=too_fast)
        with self.assertLogs("snake.tasks", "WARNING"):
            self.assertIsNone(self.run_task(session, fixture["log"]))

    def test_resubmission_keeps_first_score(self):
        session = self.make_session()
        first = self.run_task(session, fixture_log())
        better = fixture_log("win")
        self.assertEqual(self.run_task(session, better), first)
        session.refresh_from_db()
        self.assertEqual(session.score, first)

    def test_other_game_sessions_are_ignored(self):
        pacman, _ = Game.objects.get_or_create(name=GameChoices.PACMAN)
        session = self.make_session(game=pacman)
        self.assertIsNone(self.run_task(session, fixture_log()))
        session.refresh_from_db()
        self.assertIsNone(session.score)

    def test_other_users_sessions_are_ignored(self):
        session = self.make_session()
        other = get_user_model().objects.create_user(username="other", password="x")
        self.assertIsNone(self.run_task(session, fixture_log(), user=other))
        session.refresh_from_db()
        self.assertIsNone(session.score)

    def test_unknown_session_is_ignored(self):
        self.assertIsNone(
            calculate_score(self.user.pk, "01900000-0000-7000-8000-000000000000", fixture_log())
        )


class SubmitEndpointTests(TestCase):
    """The frontend submits through the hub; it must hand the task usable args."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(username="player", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.SNAKE)
        self.fixture = BY_NAME["greedy"]
        session = Session.objects.create(user=self.user, game=game)
        Session.objects.filter(pk=session.pk).update(
            seed=int(self.fixture["seed"]),
            created_at=timezone.now() - timedelta(hours=1),
        )
        self.session = Session.objects.get(pk=session.pk)
        self.url = f"/sessions/submit/{self.session.id}/"

    def submit(self, body):
        with patch("hub.views.app.send_task") as send_task:
            response = self.client.patch(self.url, body, content_type="application/json")
        return response, send_task

    def test_submit_queues_the_snake_task_with_args_it_accepts(self):
        self.client.force_login(self.user)
        response, send_task = self.submit({"actions": self.fixture["log"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(send_task.call_args.args[0], "snake.tasks.calculate_score")
        result = calculate_score(*send_task.call_args.kwargs["args"])
        self.assertEqual(result, self.fixture["score"])
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, self.fixture["score"])

    def test_client_cannot_set_score_directly(self):
        self.client.force_login(self.user)
        self.submit({"actions": self.fixture["log"], "score": 999_999})
        self.session.refresh_from_db()
        self.assertIsNone(self.session.score)

    def test_other_users_cannot_submit(self):
        other = get_user_model().objects.create_user(username="other", password="x")
        self.client.force_login(other)
        response, send_task = self.submit({"actions": self.fixture["log"]})
        self.assertEqual(response.status_code, 404)
        send_task.assert_not_called()

    def test_requires_login(self):
        response, send_task = self.submit({"actions": self.fixture["log"]})
        self.assertIn(response.status_code, (401, 403))
        send_task.assert_not_called()


class StatusViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="player", password="x")
        self.other = User.objects.create_user(username="other", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.SNAKE)
        self.session = Session.objects.create(user=self.user, game=game)
        self.url = f"/snake/sessions/{self.session.id}/"

    def test_pending_before_task_runs(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).json(), {"status": "pending", "score": None})

    def test_verified_after_task_runs(self):
        Session.update_score(str(self.session.id), self.user.pk, 120)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).json(), {"status": "verified", "score": 120})

    def test_zero_score_is_still_verified(self):
        Session.update_score(str(self.session.id), self.user.pk, 0)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).json(), {"status": "verified", "score": 0})

    def test_other_users_cannot_see_run(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_other_games_sessions_are_not_found(self):
        pacman, _ = Game.objects.get_or_create(name=GameChoices.PACMAN)
        session = Session.objects.create(user=self.user, game=pacman)
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(f"/snake/sessions/{session.id}/").status_code, 404)

    def test_requires_login(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))

    def test_old_server_side_game_endpoints_are_gone(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.post("/snake/start/").status_code, 404)
        self.assertEqual(self.client.post(f"/snake/session/{self.session.id}/move/").status_code, 404)
