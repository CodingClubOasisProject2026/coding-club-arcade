from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from hub.models import GameChoices, Session


class RunStatusView(APIView):
    """Score of the caller's Snake run; null until the Celery task verifies it."""

    permission_classes = (IsAuthenticated,)

    def get(self, request, session_id):
        session = get_object_or_404(
            Session, id=session_id, user=request.user, game__name=GameChoices.SNAKE
        )
        return Response({
            "status": "pending" if session.score is None else "verified",
            "score": session.score,
        })
