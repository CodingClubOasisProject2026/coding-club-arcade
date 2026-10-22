
import json
from uuid import UUID

from celery import current_app
from django.conf import settings
from django.http import Http404
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from hub.models import Session


ALLOWED_ACTIONS = {"move", "rotate", "soft_drop", "hard_drop", "tick"}
TETRIS_GUEST_USERNAME = "local_tetris_guest"


@require_POST
def game_api(request):
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Request body must be valid JSON."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "Request body must be a JSON object."},
            status=400,
        )

    session_id = data.get("session_id")
    actions = data.get("actions")

    if not session_id or not isinstance(actions, list):
        return JsonResponse(
            {"error": "session_id and an actions list are required."},
            status=400,
        )

    try:
        session_uuid = UUID(str(session_id))
    except (TypeError, ValueError, AttributeError):
        return JsonResponse({"error": "session_id must be a valid UUID."}, status=400)

    for action in actions:
        if not isinstance(action, dict) or action.get("type") not in ALLOWED_ACTIONS:
            return JsonResponse(
                {"error": "Each action must have a supported type."},
                status=400,
            )
        if action["type"] == "move" and action.get("direction") not in ("left", "right"):
            return JsonResponse(
                {"error": "move direction must be 'left' or 'right'."},
                status=400,
            )
        if action["type"] == "rotate" and action.get("direction") not in (
            "clockwise", "counterclockwise"
        ):
            return JsonResponse(
                {"error": "rotate direction must be 'clockwise' or 'counterclockwise'."},
                status=400,
            )

    session = Session.objects.filter(
        id=session_uuid,
        game__name="TETRIS",
    ).select_related("user").first()
    if session is None:
        raise Http404("Tetris session not found.")

    if request.user.is_authenticated:
        if session.user_id != request.user.pk:
            raise Http404("Tetris session not found.")
    elif not (
        settings.DEBUG
        and getattr(settings, "ALLOW_TETRIS_GUEST_SESSIONS", False)
        and session.user.username == TETRIS_GUEST_USERNAME
    ):
        return JsonResponse({"error": "Authentication is required."}, status=401)

    task = current_app.send_task(
        "tetris.tasks.calculate_score",
        args=[str(session_uuid), actions],
    )

    return JsonResponse(
        {"task_id": task.id, "status": "queued"},
        status=202,
    )
