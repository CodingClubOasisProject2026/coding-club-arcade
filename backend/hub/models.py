from decimal import Decimal
from secrets import randbits

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from uuid6 import uuid7

# Create your models here.

class CustomUser(AbstractUser):
    tickets = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return self.username


class GameChoices(models.TextChoices):
    MINESWEEPER = "MINESWEEEPER"
    SNAKE = "SNAKE"
    TETRIS = "TETRIS"
    WORDLE = "WORDLE"


class Game(models.Model):
    name = models.CharField(choices=GameChoices.choices,  max_length=30, unique=True)
    ratio = models.DecimalField(default=Decimal("1.0"))

    def __str__(self) -> str:
        return self.name


def generate_seed():
    return randbits(63)


class Session(models.Model):
    id = models.UUIDField(default=uuid7, primary_key=True, editable=False)
    seed = models.PositiveBigIntegerField(default=generate_seed, editable=False)
    score = models.PositiveIntegerField(default=None, null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="sessions")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return str(f'Session: {self.id}')
