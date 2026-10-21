from decimal import Decimal

from django.core.management.base import BaseCommand

from hub.models import Game, GameChoices


class Command(BaseCommand):
    def handle(self, *args, **options):
        ratio = Decimal("1.0")
        for name, _ in GameChoices.choices:
            Game.objects.update_or_create(
                name=name,
                defaults={"ratio": ratio},
            )

        self.stdout.write(self.style.SUCCESS(f"Seeded all {len(GameChoices.choices)} games!"))
