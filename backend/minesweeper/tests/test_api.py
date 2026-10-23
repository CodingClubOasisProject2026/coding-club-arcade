from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from hub.models import Game, GameChoices, Session
from minesweeper import state as store
from minesweeper.game import neighbors

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
        response = self.move(self.stored().mines[0])
        self.assertEqual(response.data["status"], "lost")
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])
        self.assertEqual(self.move(40).status_code, 409)

    def test_revealing_every_safe_cell_wins_and_saves_score(self):
        self.start()
        self.move(40)
        mines = set(self.stored().mines)
        response = None
        for idx in range(81):
            if idx not in mines and idx not in self.stored().revealed:
                response = self.move(idx)
        self.assertEqual(response.data["status"], "won")
        self.session.refresh_from_db()
        self.assertEqual(self.session.score, response.data["score"])
        self.assertGreaterEqual(self.session.score, 71 + 100)
