from django.contrib.auth import get_user_model
from django.test import TestCase

from hub.models import Game, GameChoices, Session

from .game import DIFFICULTIES

DIFFICULTY = next(iter(DIFFICULTIES))
MOVE = {"row": 0, "column": 0, "type": "reveal", "no": 0}


class AccessTests(TestCase):
    def setUp(self):
        users = get_user_model().objects
        self.owner = users.create_user(username="owner", password="x")
        self.other = users.create_user(username="other", password="x")
        game, _ = Game.objects.get_or_create(name=GameChoices.MINESWEEPER)
        self.session = Session.objects.create(user=self.owner, game=game)
        self.base = f"/minesweeper/{self.session.id}/"

    def start(self):
        return self.client.post(f"{self.base}start/", {"difficulty": DIFFICULTY}, content_type="application/json")

    def move(self):
        return self.client.post(f"{self.base}move/", MOVE, content_type="application/json")

    def test_anonymous_is_refused(self):
        self.assertIn(self.start().status_code, (401, 403))
        self.assertIn(self.client.get(self.base).status_code, (401, 403))
        self.assertIn(self.move().status_code, (401, 403))

    def test_other_user_cannot_touch_the_game(self):
        self.client.force_login(self.other)
        self.assertEqual(self.start().status_code, 404)

        self.client.force_login(self.owner)
        self.assertEqual(self.start().status_code, 201)

        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.base).status_code, 404)
        self.assertEqual(self.move().status_code, 404)

    def test_owner_can_play(self):
        self.client.force_login(self.owner)
        self.assertEqual(self.start().status_code, 201)
        self.assertEqual(self.client.get(self.base).status_code, 200)
        self.assertEqual(self.move().status_code, 200)
