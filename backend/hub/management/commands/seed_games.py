from decimal import Decimal

from django.core.management.base import BaseCommand

from hub.models import Game, GameChoices

# Score multipliers that make an average casual game worth about 100 points in
# every game (100 / mean raw score of simulated casual players).
RATIOS = {
    GameChoices.FLAPPY_BIRD: Decimal("8.6"),  # ~12 pipes
    GameChoices.SNAKE: Decimal("0.44"),  # ~230 (23 apples)
    GameChoices.TETRIS: Decimal("0.027"),  # ~3,700 (~35 lines)
    GameChoices.WORDLE: Decimal("0.68"),  # ~150
    GameChoices.MINESWEEPER: Decimal("0.35"),  # ~285 on Beginner
    GameChoices.PACMAN: Decimal("0.0175"),  # ~5,700
}


class Command(BaseCommand):
    def handle(self, *args, **options):
        for name, _ in GameChoices.choices:
            Game.objects.update_or_create(
                name=name,
                defaults={"ratio": RATIOS[name]},
            )

        self.stdout.write(self.style.SUCCESS(f"Seeded all {len(GameChoices.choices)} games!"))
