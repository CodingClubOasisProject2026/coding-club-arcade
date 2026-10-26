from datetime import timedelta
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from hub.models import Game, GameChoices, Session
from minesweeper import state as store
from minesweeper.game import (
    EXTEND_MOVES,
    EXTEND_SECONDS,
    POWERUP_TYPES,
    count,
    neighbors,
    score,
    set_powerups,
)

LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


@override_settings(CACHES=LOCMEM)
class MinesweeperApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = self.make_user()
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        game = Game.objects.create(name=GameChoices.MINESWEEPER)
        self.session = Session.objects.create(game=game, user=self.user, seed=12345)
        self.base = f"/minesweeper/{self.session.id}/"
        self.no = 0

    def make_user(self):
        return get_user_model().objects.create_user(username=f"player-{uuid4()}", password="pw")

    def start(self, difficulty="beginner"):
        return self.client.post(self.base + "start/", {"difficulty": difficulty}, format="json")

    def move(self, idx, type="reveal", no=None):
        row, column = divmod(idx, 9)
        payload = {"row": row, "column": column, "type": type, "no": self.no if no is None else no}
        response = self.client.post(self.base + "move/", payload, format="json")
        if response.status_code == 200:
            self.no += 1
        return response

    def stored(self):
        return store.load(str(self.session.id), self.user.id)

    def edit(self, **fields):
        """Change the cached game directly, to set up a scenario."""
        game = self.stored()
        for name, value in fields.items():
            setattr(game, name, value)
        store.save(game)
        return game

    def test_start_stores_game_in_cache(self):
        response = self.start()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["width"], 9)
        game = self.stored()
        self.assertEqual(game.seed, 12345)
        self.assertIsNone(game.mines)

    def test_start_twice_conflicts(self):
        self.start()
        self.assertEqual(self.start().status_code, 409)

    def test_state_is_hidden_from_other_users(self):
        self.start()
        self.client.force_authenticate(self.make_user())
        self.assertEqual(self.client.get(self.base).status_code, 404)

    def test_missing_game_is_404(self):
        self.assertEqual(self.client.get(self.base).status_code, 404)

    def test_first_reveal_is_safe_and_places_mines(self):
        self.start()
        response = self.move(40)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "in_progress")
        game = self.stored()
        self.assertEqual(len(game.mines), 10)
        self.assertNotIn(40, game.mines)
        self.assertEqual(self.client.get(self.base).data["move_count"], 1)

    def test_out_of_order_move_conflicts(self):
        self.start()
        self.assertEqual(self.move(40, no=5).status_code, 409)

    def test_move_while_locked_conflicts(self):
        self.start()
        with store.lock(str(self.session.id)):
            self.assertEqual(self.move(40).status_code, 409)
        self.assertEqual(self.move(40).status_code, 200)

    def test_flag_limit(self):
        self.start()
        for idx in range(10):
            self.assertEqual(self.move(idx, "flag").status_code, 200)
        response = self.move(10, "flag")
        self.assertEqual(response.status_code, 400)

    def test_chord_reveals_neighbors(self):
        self.start()
        self.move(40)
        game = self.stored()
        mines = set(game.mines)
        target = next(
            i for i in game.revealed
            if any(n in mines for n in neighbors(i, 9, 9))
            and any(n not in mines and n not in game.revealed for n in neighbors(i, 9, 9))
        )
        for n in neighbors(target, 9, 9):
            if n in mines:
                self.move(n, "flag")
        response = self.move(target, "chord")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["cells"])

    def test_hitting_a_mine_loses_and_saves_score(self):
        self.start()
        self.move(40)
        self.edit(shields=0)
        response = self.move(self.stored().mines[0])
        self.assertEqual(response.data["status"], "lost")
        self.assertEqual(response.data["end_reason"], "mine")
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])
        self.assertEqual(self.move(40).status_code, 409)

    def test_revealing_every_safe_cell_wins_and_saves_score(self):
        self.start()
        self.move(40)
        # One move per cell can run past the beginner move limit.
        self.edit(move_limit=1000)
        mines = set(self.stored().mines)
        response = None
        for idx in range(81):
            if idx not in mines and idx not in self.stored().revealed:
                response = self.move(idx)
        self.assertEqual(response.data["status"], "won")
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])
        self.assertGreaterEqual(self.session.score, 71 + 100)

    # --- Limits and power-ups -------------------------------------------

    def hidden_safe(self, avoid=()):
        """A hidden, unflagged safe cell, preferring one that doesn't flood-fill."""
        game = self.stored()
        mines, revealed = set(game.mines), set(game.revealed)
        cells = [
            i for i in range(81)
            if i not in mines and i not in revealed and i not in game.flagged and i not in avoid
        ]
        cells.sort(key=lambda i: count(mines, i, 9, 9) == 0)
        return cells[0]

    def test_start_reports_limits(self):
        data = self.start().data
        self.assertEqual(data["time_limit"], 90)
        self.assertEqual(data["move_limit"], 45)
        self.assertEqual(data["moves_left"], 45)
        self.assertEqual(data["time_left"], 90.0)
        self.assertEqual(data["shields"], 0)
        self.assertEqual(data["sonars"], 0)
        self.assertNotIn("powerups", data)

    def test_powerups_are_hidden_on_safe_cells_outside_the_opening(self):
        self.start()
        response = self.move(40)
        self.assertNotIn("powerups", response.data)
        game = self.stored()
        placed = sorted(game.powerups + game.found)
        self.assertEqual(len(placed), 2)
        opening = set(neighbors(40, 9, 9)) | {40}
        for cell, kind in placed:
            self.assertNotIn(cell, game.mines)
            self.assertNotIn(cell, opening)
            self.assertIn(kind, POWERUP_TYPES)
        # Two power-ups are always two different types.
        self.assertEqual(len({kind for _, kind in placed}), 2)
        # The same seed gives the same layout.
        self.assertEqual(set_powerups(game, 40, 2), placed)

    def test_reveal_uses_a_move_and_flag_is_free(self):
        self.start()
        response = self.move(40)
        # The opening flood-fill may pick up an extender.
        left = 44 + self.stored().bonus_moves
        self.assertEqual(response.data["moves_used"], 1)
        self.assertEqual(response.data["moves_left"], left)
        cell = self.hidden_safe()
        response = self.move(cell, "flag")
        self.assertEqual(response.data["moves_used"], 1)
        self.assertEqual(response.data["moves_left"], left)

    def test_revealing_a_powerup_picks_it_up(self):
        self.start()
        self.move(40)
        cell = self.hidden_safe()
        self.edit(powerups=[[cell, "shield"]], found=[], shields=0)
        response = self.move(cell)
        self.assertEqual(response.data["picked_up"], [[cell, "shield"]])
        self.assertEqual(response.data["shields"], 1)
        self.assertEqual(response.data["found"], [[cell, "shield"]])
        self.assertEqual(self.stored().powerups, [])

    def test_flood_fill_picks_up_powerups(self):
        self.start()
        self.move(40)
        game = self.stored()
        mines, revealed = set(game.mines), set(game.revealed)
        start = next(
            (
                i for i in range(81)
                if i not in mines and i not in revealed and count(mines, i, 9, 9) == 0
                and any(n not in revealed for n in neighbors(i, 9, 9))
            ),
            None,
        )
        if start is None:
            self.skipTest("Seed leaves no hidden empty cell.")
        nearby = next(n for n in neighbors(start, 9, 9) if n not in revealed)
        self.edit(powerups=[[nearby, "sonar"]], found=[], sonars=0)
        response = self.move(start)
        self.assertEqual(response.data["picked_up"], [[nearby, "sonar"]])
        self.assertEqual(response.data["sonars"], 1)

    def test_extender_adds_time_and_moves(self):
        self.start()
        self.move(40)
        cell = self.hidden_safe()
        self.edit(powerups=[[cell, "extender"]], found=[], bonus_moves=0, bonus_seconds=0)
        response = self.move(cell)
        self.assertEqual(response.data["moves_left"], 45 - 2 + EXTEND_MOVES)
        self.assertGreater(response.data["time_left"], 90)
        self.assertLessEqual(response.data["time_left"], 90 + EXTEND_SECONDS)

    def test_shield_blocks_one_mine(self):
        self.start()
        self.move(40)
        mine = self.stored().mines[0]
        before = self.edit(shields=1, detected=[]).mine_count - len(self.stored().flagged)
        response = self.move(mine)
        self.assertEqual(response.data["status"], "in_progress")
        self.assertEqual(response.data["blocked"], [mine])
        self.assertEqual(response.data["shields"], 0)
        self.assertIn(mine, response.data["defused"])
        self.assertEqual(response.data["mines_left"], before - 1)
        self.assertNotIn("mines", response.data)
        # A defused mine can't be revealed or flagged again.
        self.assertEqual(self.move(mine).status_code, 400)
        self.assertEqual(self.move(mine, "flag").status_code, 400)
        # Without a shield the next mine ends the game.
        other = self.stored().mines[1]
        response = self.move(other)
        self.assertEqual(response.data["status"], "lost")
        self.assertEqual(response.data["exploded"], [other])

    def test_shield_blocks_only_one_mine_in_a_chord(self):
        self.start()
        self.move(40)
        game = self.stored()
        mines, revealed = set(game.mines), set(game.revealed)
        # A revealed number with two or more hidden mines and a hidden safe cell
        # around it; flag the safe cells so the flag count matches but is wrong.
        target = next(
            (
                i for i in revealed
                if sum(1 for n in neighbors(i, 9, 9) if n in mines) >= 2
                and sum(1 for n in neighbors(i, 9, 9) if n not in mines and n not in revealed) >= 2
            ),
            None,
        )
        if target is None:
            self.skipTest("Seed has no suitable cell to chord.")
        wrong = [n for n in neighbors(target, 9, 9) if n not in mines and n not in revealed]
        need = count(mines, target, 9, 9)
        if len(wrong) < need:
            self.skipTest("Not enough safe cells to mis-flag.")
        self.edit(flagged=sorted(wrong[:need]), shields=1)
        response = self.move(target, "chord")
        self.assertEqual(response.data["status"], "lost")
        self.assertEqual(len(response.data["blocked"]), 1)
        self.assertTrue(response.data["exploded"])
        self.assertEqual(response.data["end_reason"], "mine")

    def test_sonar_detects_mines_in_3x3(self):
        self.start()
        self.move(40)
        game = self.stored()
        mines = set(game.mines)
        center = next(i for i in range(81) if any(n in mines for n in neighbors(i, 9, 9)))
        self.edit(sonars=1, detected=[], defused=[])
        used = self.stored().moves_used
        response = self.move(center, "sonar")
        area = set(neighbors(center, 9, 9)) | {center}
        expected = sorted(i for i in area if i in mines)
        self.assertEqual(response.data["pinged"], expected)
        self.assertEqual(response.data["detected"], expected)
        self.assertEqual(response.data["sonars"], 0)
        self.assertEqual(response.data["moves_used"], used + 1)
        # Out of sonar.
        self.assertEqual(self.move(center, "sonar").status_code, 400)
        # A detected mine can't be dug, but can be flagged.
        self.assertEqual(self.move(expected[0]).status_code, 400)
        self.assertEqual(self.move(expected[0], "flag").status_code, 200)

    def test_sonar_needs_a_started_board(self):
        self.start()
        self.edit(sonars=1)
        self.assertEqual(self.move(40, "sonar").status_code, 400)

    def test_chord_with_nothing_to_open_is_rejected(self):
        self.start()
        self.move(40)
        game = self.stored()
        revealed = set(game.revealed)
        # An opened empty cell whose neighbours are all open.
        target = next(
            i for i in revealed
            if count(set(game.mines), i, 9, 9) == 0 and all(n in revealed for n in neighbors(i, 9, 9))
        )
        used = game.moves_used
        self.assertEqual(self.move(target, "chord").status_code, 400)
        self.assertEqual(self.stored().moves_used, used)

    def test_running_out_of_moves_loses(self):
        self.start()
        self.move(40)
        self.edit(moves_used=44, bonus_moves=0, powerups=[])
        response = self.move(self.hidden_safe())
        self.assertEqual(response.data["status"], "lost")
        self.assertEqual(response.data["end_reason"], "moves")
        self.assertEqual(response.data["moves_left"], 0)
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])

    def test_move_after_time_runs_out_loses(self):
        self.start()
        self.move(40)
        self.edit(startedAt=timezone.now() - timedelta(seconds=91), bonus_seconds=0)
        response = self.move(self.hidden_safe())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "lost")
        self.assertEqual(response.data["end_reason"], "time")
        self.assertEqual(response.data["cells"], [])
        self.assertEqual(response.data["time_left"], 0)
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])

    def test_state_after_time_runs_out_ends_the_game(self):
        self.start()
        self.move(40)
        self.edit(startedAt=timezone.now() - timedelta(seconds=91), bonus_seconds=0)
        data = self.client.get(self.base).data
        self.assertEqual(data["status"], "lost")
        self.assertEqual(data["end_reason"], "time")
        self.assertEqual(self.stored().status, "lost")
        self.session.refresh_from_db()
        self.assertIsNotNone(self.session.score)

    def test_clock_waits_for_first_reveal(self):
        self.start()
        self.edit(startedAt=timezone.now() - timedelta(seconds=500))
        data = self.client.get(self.base).data
        self.assertEqual(data["status"], "in_progress")
        self.assertEqual(data["time_left"], 90.0)

    def test_win_score_adds_time_and_moves_left(self):
        self.start()
        self.move(40)
        now = timezone.now()
        game = self.edit(
            status="won", startedAt=now - timedelta(seconds=30), finishedAt=now,
            moves_used=10, bonus_moves=0, bonus_seconds=0,
        )
        expected = len(game.revealed) + 10 * 10 + (90 - 30) * 1 + (45 - 10) * 2
        self.assertEqual(score(game), expected)
