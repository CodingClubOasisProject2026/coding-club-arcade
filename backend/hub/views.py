from django.contrib.auth import get_user_model
from django.db.models import DecimalField, F, Sum
from django.db.models.functions import Round
from django.db.transaction import atomic
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView, UpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.celery import app
from hub.models import Game, Session

from .serializers import GameSerializer, LeaderboardSerializer, SessionSerializer

User = get_user_model()


class LeaderboardView(ListAPIView):
    serializer_class = LeaderboardSerializer
    # Each game's raw score is scaled by its ratio so every game counts about the same.
    queryset = (
        User.objects.annotate(
            score=Round(
                Sum(
                    F("sessions__score") * F("sessions__game__ratio"),
                    output_field=DecimalField(max_digits=20, decimal_places=5),
                )
            )
        )
        .exclude(score__isnull=True)
        .order_by("-score", "username")
    )

    @method_decorator(cache_page(10))
    def dispatch(self, request, *args, **kwargs):
        return super().dispatch(request, *args, **kwargs)


class MeView(APIView):
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        user = request.user
        if not user.is_authenticated:
            return Response({"authenticated": False})
        return Response({"authenticated": True, "username": user.username, "tickets": user.tickets})


class GameListView(ListAPIView):
    serializer_class = GameSerializer
    queryset = Game.objects.order_by("name")


class SessionStartView(CreateAPIView):
    serializer_class = SessionSerializer
    permission_classes = (IsAuthenticated,)

    @atomic
    def perform_create(self, serializer):
        game_id = self.kwargs["game_id"]
        used = User.objects.select_for_update().filter(
            id=self.request.user.pk, tickets__gt=0
        ).update(tickets=F("tickets") - 1)
        if not used:
            raise ValidationError({"tickets": "You need at least one ticket to start a game."})
        serializer.save(user_id=self.request.user.pk, game_id=game_id)


class SessionSubmitView(UpdateAPIView):
    serializer_class = SessionSerializer
    permission_classes = (IsAuthenticated,)
    lookup_field = "id"
    lookup_url_kwarg = "session_id"

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        return Session.objects.filter(user_id=self.request.user.pk)

    def perform_update(self, serializer):
        actions = serializer.validated_data.pop("actions", {})
        session: Session = serializer.save()
        app.send_task(
            f"{str(session.game.name).lower()}.tasks.calculate_score",
            args=(session.user_id, str(session.id), actions),  # pyright: ignore[reportAttributeAccessIssue]
        )
