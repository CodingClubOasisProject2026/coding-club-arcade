from django.contrib.auth import get_user_model
from django.db.models import F, Sum
from django.db.transaction import atomic
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView, UpdateAPIView
from rest_framework.permissions import IsAuthenticated

from config.celery import app
from hub.models import Game, Session

from .serializers import GameSerializer, LeaderboardSerializer, SessionSerializer

User = get_user_model()


class LeaderboardView(ListAPIView):
    serializer_class = LeaderboardSerializer
    queryset = User.objects.annotate(score=Sum("sessions__score")).order_by("-score", "username")

    @method_decorator(cache_page(10))
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)


class GameListView(ListAPIView):
    serializer_class = GameSerializer
    queryset = Game.objects.all()


class SessionStartView(CreateAPIView):
    serializer_class = SessionSerializer
    permission_classes = (IsAuthenticated,)

    @atomic
    def perform_create(self, serializer):
        game_id = self.kwargs["game_id"]
        used = User.objects.select_for_update().filter(id=self.request.user.pk,tickets__gt=0).update(tickets=F("tickets") - 1)
        if not used:
            raise ValidationError({"tickets": "You need at least one ticket to start a game."})
        serializer.save(user_id=self.request.user.pk, game_id=game_id)


class SessionSubmitView(UpdateAPIView):
    serializer_class = SessionSerializer
    permission_classes = (IsAuthenticated,)
    lookup_field = "session_id"

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        return Session.objects.filter(user_id=self.request.user.pk)

    def perform_update(self, serializer):
        actions = serializer.validated_data.pop("actions", {})
        session: Session = serializer.save()
        app.send_task(
            f"{str(session.game.name).lower()}.tasks.calculate_score",
            args=(str(session.id), actions),
        )
