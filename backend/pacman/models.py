from django.db import models

from hub.models import Session


class PacmanRun(models.Model):
    """A submitted Pac-Man action log and the outcome of replaying it."""

    class Status(models.TextChoices):
        VERIFIED = "verified"
        REJECTED = "rejected"

    session = models.OneToOneField(Session, on_delete=models.CASCADE, related_name="pacman_run")
    input_log = models.JSONField()
    status = models.CharField(max_length=10, choices=Status.choices)
    reason = models.CharField(max_length=200, blank=True)
    score = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Pac-Man run {self.session_id}: {self.status}"
