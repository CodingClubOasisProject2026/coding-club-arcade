import json
from pathlib import Path

from django.test import SimpleTestCase

from snake.game_logic import (
    LOCKED_APPLE_CHANCE,
    POINTS_PER_APPLE,
    create_game,
    generate_cell,
    move_snake,
    next_random,
    replay_actions,
    seed_to_rng,
    spawn_apple,
)

PARITY = Path(__file__).parent / "fixtures" / "parity.json"


def make_game(apple, key=None, locked=False):
    game = create_game(1)
    game["apple"] = list(apple)
    game["key"] = list(key) if key else None
    game["apple_locked"] = locked
    return game


class AppleMechanicTests(SimpleTestCase):
    def test_spawn_not_on_snake_or_each_other(self):
        for seed in range(1, 50):
            game = create_game(seed)
            self.assertNotIn(game["apple"], game["snake"])
            self.assertNotIn("has_key", game)
            if game["apple_locked"]:
                self.assertNotIn(game["key"], game["snake"])
                self.assertNotEqual(game["apple"], game["key"])
            else:
                self.assertIsNone(game["key"])

    def test_generate_cell_respects_blocked_and_full_board(self):
        game = create_game(3)
        before = game["rng"]
        game["snake"] = [[x, y] for x in range(20) for y in range(20)]
        self.assertIsNone(generate_cell(game, []))
        self.assertEqual(game["rng"], before)

    def test_normal_apple_eaten_directly(self):
        game = make_game(apple=[6, 5])
        move_snake(game, "RIGHT")
        self.assertEqual(game["score"], POINTS_PER_APPLE)
        self.assertEqual(game["apples_eaten"], 1)
        self.assertEqual(len(game["snake"]), 4)
        self.assertNotIn(game["apple"], game["snake"])
        self.assertEqual(game["status"], "ACTIVE")

    def test_hitting_locked_apple_is_game_over(self):
        game = make_game(apple=[6, 5], key=[10, 10], locked=True)
        move_snake(game, "RIGHT")
        self.assertEqual(game["status"], "GAME_OVER")
        self.assertEqual(game["score"], 0)

    def test_key_unlocks_without_growing(self):
        game = make_game(apple=[10, 10], key=[6, 5], locked=True)
        move_snake(game, "RIGHT")
        self.assertFalse(game["apple_locked"])
        self.assertIsNone(game["key"])
        self.assertEqual(game["apple"], [10, 10])
        self.assertEqual(len(game["snake"]), 3)
        self.assertEqual(game["snake"][0], [6, 5])
        self.assertEqual(game["score"], 0)
        self.assertEqual(game["status"], "ACTIVE")

    def test_unlocked_apple_then_eaten(self):
        game = make_game(apple=[7, 5], key=[6, 5], locked=True)
        move_snake(game, "RIGHT")
        move_snake(game, "RIGHT")
        self.assertEqual(game["score"], POINTS_PER_APPLE)
        self.assertEqual(len(game["snake"]), 4)

    def test_key_only_exists_when_locked(self):
        for seed in range(1, 300):
            game = create_game(seed)
            self.assertEqual(game["key"] is not None, game["apple_locked"])

    def test_normal_move_keeps_length(self):
        game = make_game(apple=[10, 10], key=[12, 12], locked=True)
        move_snake(game, "RIGHT")
        self.assertEqual(len(game["snake"]), 3)

    def test_spawn_apple_rng_order(self):
        for seed in range(1, 60):
            game = create_game(seed)
            game["rng"] = seed_to_rng(seed * 7919)
            ref = {"rng": game["rng"]}
            next_random(ref)  # apple pick
            roll = next_random(ref)  # lock roll
            locked = roll % LOCKED_APPLE_CHANCE == 0
            if locked:
                next_random(ref)  # key pick
            spawn_apple(game)
            self.assertEqual(game["rng"], ref["rng"])
            self.assertEqual(game["apple_locked"], locked)
            self.assertEqual(game["key"] is not None, locked)

    def test_spawn_apple_full_board_consumes_nothing(self):
        game = create_game(3)
        game["snake"] = [[x, y] for x in range(20) for y in range(20)]
        before = game["rng"]
        spawn_apple(game)
        self.assertIsNone(game["apple"])
        self.assertFalse(game["apple_locked"])
        self.assertIsNone(game["key"])
        self.assertEqual(game["rng"], before)

    def test_mix_of_locked_and_normal(self):
        locked = sum(create_game(seed)["apple_locked"] for seed in range(1, 301))
        self.assertGreater(locked, 50)
        self.assertLess(locked, 150)


class ParityTests(SimpleTestCase):
    def test_fixtures(self):
        for case in json.loads(PARITY.read_text()):
            with self.subTest(case["name"]):
                game = replay_actions(case["seed"], case["log"])
                self.assertEqual(game["score"], case["score"])
                self.assertEqual(game["apples_eaten"], case["apples_eaten"])
                self.assertEqual(game["status"], case["status"])
                self.assertEqual(game["min_ms"], case["min_ms"])
                self.assertEqual(game["apple"], case["apple"])
                self.assertEqual(game["snake"][0], case["head"])
                self.assertEqual(len(game["snake"]), case["length"])
                if "key" in case:
                    self.assertEqual(game["key"], case["key"])
                if "apple_locked" in case:
                    self.assertEqual(game["apple_locked"], case["apple_locked"])
