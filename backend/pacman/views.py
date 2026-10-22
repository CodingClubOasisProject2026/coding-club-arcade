from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hub.models import GameChoices, Session

from .models import PacmanRun


class RunStatusView(APIView):
    """Verification status of the caller's Pac-Man run."""

    permission_classes = (IsAuthenticated,)

    def get(self, request, session_id):
        session = get_object_or_404(
            Session, id=session_id, user=request.user, game__name=GameChoices.PACMAN
        )
        run = PacmanRun.objects.filter(session=session).first()
        if run is None:
            return Response({"status": "pending", "score": None, "reason": ""})
        return Response({"status": run.status, "score": run.score, "reason": run.reason})
