import copy
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from hub.models import Game, GameChoices, Session
from tetris.engine import check_collision, move_piece, rotate_tetromino
from tetris.pieces import SeededPieceRandomizer, create_grid
from tetris.scoring import ScoringSystem
from tetris.tasks import (
    MAX_ACTIONS,
    calculate_score,
    make_tetromino,
    replay,
    resolve_piece,
    validate_actions,
)

SEED = 12345


def _drop_and_lock(grid, piece):
    """Hard-drop piece onto grid in place; return lines cleared and the new grid."""
    while not check_collision(grid, piece):
        piece.y += 1
    piece.y -= 1
    return resolve_piece(grid, piece)


def _can_fall(grid, piece):
    piece.y += 1
    fits = not check_collision(grid, piece)
    piece.y -= 1
    return fits


def _apply(grid, piece, tick, rotations, shift):
    """Run the same steps the replay does for 'T'*tick + 'C'*rotations + 'L'/'R'*shift."""
    if tick:
        move_piece(grid, piece, "down")
    for _ in range(rotations):
        rotate_tetromino(grid, piece, "clockwise")
    for _ in range(abs(shift)):
        move_piece(grid, piece, "right" if shift > 0 else "left")


def play_bot(seed, max_pieces=60):
    """
    A simple bot that tries every rotation and shift and keeps the placement that
    clears the most lines with the lowest stack. Returns (actions, score).
    After max_pieces it hard-drops until it tops out, since a run must end in game over.
    """
    grid = create_grid()
    randomizer = SeededPieceRandomizer(seed)
    scoring = ScoringSystem()
    actions = []
    pieces = 0

    while True:
        piece_type, color = randomizer.next_piece()
        piece = make_tetromino(piece_type, color, len(grid[0]))
        if check_collision(grid, piece):
            return "".join(actions), scoring.total_score

        # A tick on a piece that can't fall would lock it, so only tick when it can.
        tick = _can_fall(grid, piece)
        best = (None, 0, 0)
        if pieces < max_pieces:
            for rotations in range(4):
                for shift in range(-5, 6):
                    trial_grid, trial = copy.deepcopy(grid), copy.deepcopy(piece)
                    _apply(trial_grid, trial, tick, rotations, shift)
                    trial_grid, lines = _drop_and_lock(trial_grid, trial)
                    height = next((len(trial_grid) - y for y, row in enumerate(trial_grid) if any(row)), 0)
                    holes = sum(
                        1
                        for x in range(len(trial_grid[0]))
                        for y in range(1, len(trial_grid))
                        if not trial_grid[y][x] and any(trial_grid[k][x] for k in range(y))
                    )
                    rank = (lines, -holes, -height)
                    if best[0] is None or rank > best[0]:
                        best = (rank, rotations, shift)

        _, rotations, shift = best
        _apply(grid, piece, tick, rotations, shift)
        grid, lines = _drop_and_lock(grid, piece)
        scoring.register_lines_cleared(lines)
        actions.append("T" * tick + "C" * rotations + ("R" if shift > 0 else "L") * abs(shift) + "H")
        pieces += 1


class ValidateActionsTests(SimpleTestCase):
    def test_accepts_every_action_code(self):
        validate_actions("TLRCcSH")

    def test_rejects_empty_actions(self):
        with self.assertRaises(ValueError):
            validate_actions("")

    def test_rejects_non_strings(self):
        for bad in (None, ["T"], [{"type": "tick"}], 5):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_actions(bad)

    def test_rejects_unknown_characters(self):
        for bad in ("TX", "t", "T H", "T\n"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_actions(bad)

    def test_rejects_too_many_actions(self):
        validate_actions("T" * MAX_ACTIONS)
        with self.assertRaises(ValueError):
            validate_actions("T" * (MAX_ACTIONS + 1))


class ReplayTests(SimpleTestCase):
    def test_hard_drops_only_top_out_with_zero_score(self):
        # Find where the game ends, then replay exactly that many drops.
        for length in range(1, 31):
            try:
                scoring, game_over = replay(SEED, "H" * length)
                break
            except ValueError:
                continue
        self.assertEqual(scoring.total_score, 0)
        self.assertTrue(game_over)

    def test_replay_matches_bot_score_with_line_clears(self):
        actions, score = play_bot(SEED)
        self.assertGreater(score, 0)
        scoring, _ = replay(SEED, actions)
        self.assertEqual(scoring.total_score, score)
        self.assertGreater(scoring.total_lines_cleared, 0)

    def test_bot_run_includes_a_bomb(self):
        randomizer = SeededPieceRandomizer(SEED)
        self.assertIn("B", [randomizer.next_piece()[0] for _ in range(60)])

    def test_soft_drops_lock_like_ticks(self):
        actions, score = play_bot(SEED)
        scoring, _ = replay(SEED, actions.replace("T", "S"))
        self.assertEqual(scoring.total_score, score)

    def test_actions_after_game_over_are_rejected(self):
        actions, _ = play_bot(SEED)
        with self.assertRaises(ValueError):
            replay(SEED, actions + "H")

    def test_run_must_end_in_game_over(self):
        with self.assertRaises(ValueError):
            replay(SEED, "TLRCcS")


class CalculateScoreTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="player", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.TETRIS)
        self.session = Session.objects.create(user=self.user, game=game)
        Session.objects.filter(pk=self.session.pk).update(seed=SEED)
        self.session.refresh_from_db()

    def score(self, actions, user_id=None):
        return calculate_score(user_id or self.user.pk, str(self.session.id), actions)

    def test_saves_score_through_update_score(self):
        actions, score = play_bot(SEED)
        with patch.object(Session, "update_score", wraps=Session.update_score) as update_score:
            result = self.score(actions)
        update_score.assert_called_once_with(str(self.session.id), self.user.pk, score)
        self.assertEqual(result["score"], score)
        self.assertEqual(set(result), {"score", "lines_cleared", "game_over"})
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, score)

    def test_resubmit_never_overwrites_score(self):
        actions, score = play_bot(SEED)
        self.score(actions)
        self.assertEqual(self.score("H" * 30)["score"], score)
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, score)

    def test_invalid_runs_leave_score_empty(self):
        actions, _ = play_bot(SEED)
        for bad in (actions + "H", "TLRCcS", "HHX", [{"type": "hard_drop"}], {}):
            with self.subTest(bad=bad):
                self.assertIsNone(self.score(bad))
        self.session.refresh_from_db()
        self.assertIsNone(self.session.score)

    def test_other_users_session_is_ignored(self):
        other = get_user_model().objects.create_user(username="other", password="x")
        actions, _ = play_bot(SEED)
        self.assertIsNone(self.score(actions, user_id=other.pk))
        self.session.refresh_from_db()
        self.assertIsNone(self.session.score)


class SubmitEndpointTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="player", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.TETRIS)
        session = Session.objects.create(user=self.user, game=game)
        Session.objects.filter(pk=session.pk).update(seed=SEED)
        self.session = Session.objects.get(pk=session.pk)
        self.url = f"/sessions/submit/{self.session.id}/"
        self.client.force_login(self.user)

    def test_hub_queues_a_string_the_task_accepts(self):
        actions, score = play_bot(SEED)
        with patch("hub.views.app.send_task") as send_task:
            response = self.client.put(self.url, {"actions": actions}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(send_task.call_args.args[0], "tetris.tasks.calculate_score")
        result = calculate_score(*send_task.call_args.kwargs["args"])
        self.assertEqual(result["score"], score)
