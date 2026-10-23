import random

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from hub.models import Game, GameChoices, Session

User = get_user_model()

PREFIX = "demo_"
NAMES = [
    "pixelpunk", "neonfox", "bytebandit", "glitchqueen", "retrorex",
    "arcadeace", "chiptune", "lagslayer", "joystickjo", "highscorehal",
    "blockbuster", "snakecharmer", "ghosthunter", "wordwizard", "flapmaster",
]
# Players who played but scored nothing
ZERO_NAMES = ["firsttimer", "butterfingers", "afkandy", "noobnoob"]
# Players with a null total: never played, or only unfinished games
NO_GAMES_NAMES = ["lurker", "justbrowsing"]
UNFINISHED_NAMES = ["ragequitter", "midgamemike"]

# Rough per-session score ranges so totals look plausible per game
SCORE_RANGES = {
    GameChoices.MINESWEEPER: (50, 1000),
    GameChoices.PACMAN: (500, 15000),
    GameChoices.SNAKE: (10, 400),
    GameChoices.TETRIS: (1000, 50000),
    GameChoices.WORDLE: (10, 100),
    GameChoices.FLAPPY_BIRD: (1, 80),
}


class Command(BaseCommand):
    help = "Create demo users with scored sessions so the leaderboard has data."

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Delete demo users and exit.")

    @transaction.atomic
    def handle(self, *args, clear=False, **options):
        deleted, _ = User.objects.filter(username__startswith=PREFIX).delete()
        if clear:
            self.stdout.write(self.style.SUCCESS(f"Removed demo data ({deleted} rows)."))
            return

        games = {g.name: g for g in Game.objects.all()}
        if not games:
            self.stderr.write("No games found. Run `seed_games` first.")
            return

        rng = random.Random(42)
        sessions = []
        for name in NAMES:
            user = User.objects.create_user(username=PREFIX + name, password="demo1234", tickets=5)
            for _ in range(rng.randint(3, 12)):
                game_name = rng.choice(list(games))
                lo, hi = SCORE_RANGES.get(game_name, (10, 1000))
                sessions.append(Session(user=user, game=games[game_name], score=rng.randint(lo, hi)))
        for name in ZERO_NAMES:
            user = User.objects.create_user(username=PREFIX + name, password="demo1234", tickets=5)
            for _ in range(rng.randint(1, 3)):
                sessions.append(Session(user=user, game=rng.choice(list(games.values())), score=0))
        for name in NO_GAMES_NAMES:
            User.objects.create_user(username=PREFIX + name, password="demo1234", tickets=5)
        for name in UNFINISHED_NAMES:
            user = User.objects.create_user(username=PREFIX + name, password="demo1234", tickets=5)
            for _ in range(rng.randint(1, 2)):
                sessions.append(Session(user=user, game=rng.choice(list(games.values())), score=None))
        Session.objects.bulk_create(sessions)

        total_users = len(NAMES) + len(ZERO_NAMES) + len(NO_GAMES_NAMES) + len(UNFINISHED_NAMES)
        self.stdout.write(self.style.SUCCESS(
            f"Created {total_users} demo users and {len(sessions)} sessions. "
            f"Remove with `seed_leaderboard --clear`."
        ))
