from django.db import models

class Game(models.Model):
    class Status(models.TextChoices):
        IN_PROGRESS = 'in_progress', 'In Progress'
        WON = 'won', 'Won'
        LOST = 'lost', 'Lost'

    # Shares its primary key with the hub session, so game.pk == session.id.
    session = models.OneToOneField(
        "hub.Session", on_delete=models.CASCADE, primary_key=True, related_name="minesweeper_game"
    )

    width = models.PositiveSmallIntegerField()
    height = models.PositiveSmallIntegerField()
    mine_count = models.PositiveSmallIntegerField()

    mines = models.JSONField(null = True, blank = True)
    revealed = models.JSONField(null = True, blank = True)
    flagged = models.JSONField(null = True, blank = True)
    exploded = models.JSONField(null = True, blank = True)
    move_count = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_PROGRESS)

    startedAt = models.DateTimeField(auto_now_add=True)
    finishedAt = models.DateTimeField(null=True, blank=True)

    score = models.IntegerField(null=True, blank=True)

    @property
    def seed(self):
        return self.session.seed

    



    

