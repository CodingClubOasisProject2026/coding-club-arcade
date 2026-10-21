import json
from functools import wraps

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from hub.models import GameChoices, Session
from snake.game_logic import create_game, move_snake as update_game


# Temporary in-memory storage for active Snake games.
games = {}

NOT_FOUND = {"error": "Game not found"}


def auth_required(view):
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse(
                {"error": "Authentication required"},
                status=401,
            )
        return view(request, *args, **kwargs)
    return wrapper


def get_owned_game(request, session_id):
    game = games.get(str(session_id))

    if game is None or game["owner_id"] != request.user.id:
        return None

    return game


def serialize_game(session_id, game):
    return {
        "session_id": str(session_id),
        "board": {"width": 20, "height": 20},
        "snake": game["snake"],
        "direction": game["direction"],
        "apple": game["apple"],
        "score": game["score"],
        "apples_eaten": game["apples_eaten"],
        "status": game["status"],
        "game_over": game["status"] != "ACTIVE",
        "tick": game["tick"],
    }


@csrf_exempt
@require_POST
@auth_required
def start_game(request):
    try:
        body = json.loads(request.body)
        session_id = body.get("session_id")
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse(
            {"error": "Invalid request body"},
            status=400,
        )

    if not isinstance(session_id, str) or not session_id:
        return JsonResponse(
            {"error": "session_id is required"},
            status=400,
        )

    try:
        session = Session.objects.select_related("game").get(
            id=session_id,
            user=request.user,
        )
    except (Session.DoesNotExist, ValueError, ValidationError):
        return JsonResponse(
            {"error": "Session not found"},
            status=404,
        )

    if session.game.name != GameChoices.SNAKE:
        return JsonResponse(
            {"error": "Session does not belong to Snake"},
            status=400,
        )

    if session.score is not None:
        return JsonResponse(
            {"error": "Session already completed"},
            status=409,
        )

    if str(session.id) in games:
        return JsonResponse(
            {"error": "Game already started for this session"},
            status=409,
        )

    game = create_game(session.seed)
    game["owner_id"] = request.user.id
    game["actions"] = []
    game["initial_direction"] = game["direction"]

    games[str(session.id)] = game

    return JsonResponse(
        serialize_game(session.id, game),
        status=201,
    )


@require_GET
@auth_required
def get_game(request, session_id):
    game = get_owned_game(request, session_id)

    if game is None:
        return JsonResponse(NOT_FOUND, status=404)

    return JsonResponse(serialize_game(session_id, game))


@csrf_exempt
@require_POST
@auth_required
def move_snake(request, session_id):
    game = get_owned_game(request, session_id)

    if game is None:
        return JsonResponse(NOT_FOUND, status=404)

    if game["status"] != "ACTIVE":
        return JsonResponse(
            {"error": "Game is not active"},
            status=409,
        )

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    action = body.get("action")

    if not isinstance(action, str):
        return JsonResponse(
            {"error": "action is required"},
            status=400,
        )

    action = action.upper()
    previous_direction = game["direction"]

    try:
        update_game(game, action, game["rng"])
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)

    # Record direction changes even when the move causes a collision.
    if action != previous_direction:
        game["actions"].append({
            "tick": game["tick"],
            "direction": action,
        })

    return JsonResponse(serialize_game(session_id, game))


@csrf_exempt
@require_POST
@auth_required
def end_game(request, session_id):
    game = get_owned_game(request, session_id)

    if game is None:
        return JsonResponse(NOT_FOUND, status=404)

    if game["status"] == "ACTIVE":
        end_reason = "QUIT"
        game["status"] = "QUIT"
    elif game["status"] == "WON":
        end_reason = "WON"
    elif game["status"] == "GAME_OVER":
        end_reason = "COLLISION"
    elif game["status"] == "QUIT":
        end_reason = "QUIT"
    else:
        return JsonResponse(
            {"error": "Invalid game state"},
            status=409,
        )

    return JsonResponse({
        "session_id": str(session_id),
        "score": game["score"],
        "game_over": True,
        "actions": {
            "initial_direction": game["initial_direction"],
            "actions": game["actions"],
            "total_ticks": game["tick"],
            "end_reason": end_reason,
        },
    })