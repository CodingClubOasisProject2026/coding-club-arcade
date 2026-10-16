from django.conf import settings
from django.db import models


class Player(models.Model):
	user = models.OneToOneField(
		settings.AUTH_USER_MODEL,
		on_delete=models.CASCADE,
		related_name="tetris_player",
	)
	created_at = models.DateTimeField(auto_now_add=True)

	def __str__(self) -> str:
		return self.user.get_username()


class Score(models.Model):
	player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="scores")
	score = models.PositiveIntegerField(default=0)
	lines_cleared = models.PositiveIntegerField(default=0)
	level = models.PositiveIntegerField(default=1)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-score", "created_at"]

	def __str__(self) -> str:
		return f"{self.player}: {self.score}"
