from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import services
from .serializers import FinishRequestSerializer, GuessRequestSerializer

_ERROR_STATUS = {
    services.SessionNotFound: status.HTTP_404_NOT_FOUND,
    services.SessionNotActive: status.HTTP_409_CONFLICT,
    services.InvalidGuess: status.HTTP_422_UNPROCESSABLE_ENTITY,
}


def _error(code: str, message: str, http_status: int) -> Response:
    return Response({"error": {"code": code, "message": message}}, status=http_status)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class PlayView(TemplateView):
    template_name = "wordle/index.html"


class WordleAPIView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = None  # each subclass sets its own scope

    def handle_exception(self, exc):
        if isinstance(exc, services.WordleError):
            return _error(
                exc.code, str(exc), _ERROR_STATUS.get(type(exc), status.HTTP_400_BAD_REQUEST)
            )
        return super().handle_exception(exc)


class StartView(WordleAPIView):
    """Start a game, or resume the active one (201 new, 200 resumed)."""

    throttle_scope = "wordle_start"

    def post(self, request):
        session, created = services.start_session(request.user)
        body = {"resumed": not created, **services.snapshot(session)}
        return Response(
            body, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class GuessView(WordleAPIView):
    throttle_scope = "wordle_guess"

    def post(self, request):
        data = GuessRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        outcome = services.submit_guess(
            request.user, data.validated_data["session_id"], data.validated_data["guess"]
        )
        return Response(
            {
                "mask": outcome.mask,
                "solved": outcome.solved,
                "answer": outcome.answer,  # only set when this guess lost the game
                **services.snapshot(outcome.session),
            }
        )


class FinishView(WordleAPIView):
    throttle_scope = "wordle_finish"

    def post(self, request):
        data = FinishRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)

        session = services.finish_session(request.user, data.validated_data["session_id"])
        return Response(services.snapshot(session))


class StateView(WordleAPIView):
    """Snapshot for page reloads."""

    throttle_scope = "wordle_state"

    def get(self, request):
        session = services.get_active_session(request.user)
        if session is None:
            return _error(
                "no_active_session", "no active wordle session", status.HTTP_404_NOT_FOUND
            )
        return Response(services.snapshot(session))
