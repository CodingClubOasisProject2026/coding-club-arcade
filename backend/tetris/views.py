
import json
from uuid import UUID

from celery import current_app
from django.http import Http404
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from hub.models import Session


ALLOWED_ACTIONS = {"move", "rotate", "soft_drop", "hard_drop", "tick"}


@require_POST
def game_api(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Authentication is required."}, status=401)

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

    try:
        Session.objects.get(
            id=session_uuid,
            user=request.user,
            game__name="TETRIS",
        )
    except Session.DoesNotExist:
        raise Http404("Tetris session not found.")

    task = current_app.send_task(
        "tetris.tasks.calculate_score",
        args=[str(session_uuid), actions],
    )

    return JsonResponse(
        {"task_id": task.id, "status": "queued"},
        status=202,
    )
