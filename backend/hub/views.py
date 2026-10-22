from django.contrib.auth import get_user_model
from django.conf import settings
from django.db.models import F, Sum
from django.db.transaction import atomic
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.exceptions import NotAuthenticated, ValidationError
from rest_framework.generics import CreateAPIView, ListAPIView, UpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.celery import app
from hub.models import Game, Session

from .serializers import GameSerializer, LeaderboardSerializer, SessionSerializer

User = get_user_model()
TETRIS_GUEST_USERNAME = "local_tetris_guest"


def tetris_guest_mode_enabled():
    return settings.DEBUG and settings.ALLOW_TETRIS_GUEST_SESSIONS


class LeaderboardView(ListAPIView):
    serializer_class = LeaderboardSerializer
    queryset = User.objects.annotate(score=Sum("sessions__score")).order_by("-score", "username")

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

    def get_permissions(self):
        game_is_tetris = Game.objects.filter(
            id=self.kwargs.get("game_id"), name="TETRIS"
        ).exists()
        if tetris_guest_mode_enabled() and game_is_tetris:
            return [AllowAny()]
        return super().get_permissions()

    @atomic
    def perform_create(self, serializer):
        game_id = self.kwargs["game_id"]
        if not self.request.user.is_authenticated:
            if not tetris_guest_mode_enabled() or not Game.objects.filter(
                id=game_id, name="TETRIS"
            ).exists():
                raise NotAuthenticated()
            guest_user, _ = User.objects.get_or_create(
                username=TETRIS_GUEST_USERNAME,
                defaults={"is_active": True},
            )
            serializer.save(user=guest_user, game_id=game_id)
            return
        used = User.objects.select_for_update().filter(id=self.request.user.pk,tickets__gt=0).update(tickets=F("tickets") - 1)
        if not used:
            raise ValidationError({"tickets": "You need at least one ticket to start a game."})
        serializer.save(user_id=self.request.user.pk, game_id=game_id)


class SessionSubmitView(UpdateAPIView):
    serializer_class = SessionSerializer
    permission_classes = (IsAuthenticated,)
    lookup_field = "id"
    lookup_url_kwarg = "session_id"

    def get_permissions(self):
        if tetris_guest_mode_enabled():
            return [AllowAny()]
        return super().get_permissions()

    def get_queryset(self):  # pyright: ignore[reportIncompatibleMethodOverride]
        if not self.request.user.is_authenticated:
            if tetris_guest_mode_enabled():
                return Session.objects.filter(
                    user__username=TETRIS_GUEST_USERNAME,
                    game__name="TETRIS",
                )
            return Session.objects.none()
        return Session.objects.filter(user_id=self.request.user.pk)

    def update(self, request, *args, **kwargs):
        session = self.get_object()
        if session.game.name == "TETRIS":
            actions = request.data.get("actions")
            if actions is None:
                raise ValidationError({"actions": "This field is required."})
            if not isinstance(actions, list):
                raise ValidationError({"actions": "Must be a list of actions."})
            task = app.send_task(
                "tetris.tasks.calculate_score",
                args=(str(session.id), actions),
            )
            return Response(
                {"status": "queued", "task_id": task.id},
                status=202,
            )
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        actions = serializer.validated_data.pop("actions", {})
        session: Session = serializer.save()
        app.send_task(
            f"{str(session.game.name).lower()}.tasks.calculate_score",
            args=(str(session.id), actions),
        )
