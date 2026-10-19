from django.shortcuts import render
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from hub.models import Session
from snake.game_logic import create_game, move_snake as update_game


# Temporary in-memory storage for active Snake games.
games = {}


def serialize_game(session_id, game):
    # Convert the game state into a JSON-compatible response.
    return {
        "session_id": str(session_id),
        "board": {
            "width": 20,
            "height": 20,
        },
        "snake": game["snake"],
        "direction": game["direction"],
        "apple": game["apple"],
        "score": game["score"],
        "apples_eaten": game["apples_eaten"],
        "status": game["status"],
        "game_over": game["status"] != "ACTIVE",
    }


@csrf_exempt
@require_POST
def start_game(request):
    # Initialize Snake for an existing arcade session.
    try:
        body = json.loads(request.body)
        session_id = body.get("session_id")

        if not isinstance(session_id, str) or not session_id:
            return JsonResponse(
                {"error": "session_id is required"},
                status=400,
            )

    except (json.JSONDecodeError, AttributeError):
        return JsonResponse(
            {"error": "Invalid request body"},
            status=400,
        )

    if not session.user.is_authenticated:
        return JsonResponse(
            {"error" : "Authentication required"},
             status = 401,
        )
    
    try:
        session = Session.objects.select_related("game").get(
            id=session_id,
        )
    except (Session.DoesNotExist, ValueError):
        return JsonResponse(
            {"error": "Session not found"},
            status=404,
        )

    if session.game.name != "SNAKE":
        return JsonResponse(
            {"error": "Session does not belong to Snake"},
            status=400,
        )

    # Reuse the arcade session's seed.
    game = create_game(session.seed)

    # Record direction changes for backend replay.
    game["actions"] = []
    game["initial_direction"] = game["direction"]

    games[str(session.id)] = game   

    return JsonResponse(
        serialize_game(session.id, game),
        status=201,
    )


@require_GET
def get_game(request, session_id):
    # Retrieve the current state of a Snake game.
    game = games.get(str(session_id))

    if game is None:
        return JsonResponse(
            {"error": "Game not found"},
            status=404,
        )

    return JsonResponse(serialize_game(session_id, game))


@csrf_exempt
@require_POST
def move_snake(request, session_id):
    # Process one movement tick.
    game = games.get(str(session_id))

    if game is None:
        return JsonResponse(
            {"error": "Game not found"},
            status=404,
        )

    if game["status"] != "ACTIVE":
        return JsonResponse(
            {"error": "Game is not active"},
            status=409,
        )

    try:
        body = json.loads(request.body)
        action = body.get("action")

        if not isinstance(action, str):
            raise ValueError

        action = action.upper()

        # Update the game using the shared game logic.
        previous_direction = game["direction"]

        update_game(game, action, game["rng"])

        if action != previous_direction and game["status"] != "GAME_OVER":
            game["actions"].append({
                "tick": game["tick"],
                "direction": action,
            })

    except json.JSONDecodeError:
        return JsonResponse(
            {"error": "Invalid JSON"},
            status=400,
        )

    except ValueError as exc:
        return JsonResponse(
            {"error": str(exc)},
            status=400,
        )

    return JsonResponse(serialize_game(session_id, game))


@csrf_exempt
@require_POST
def end_game(request, session_id):
    # End the game and return the action log for score calculation.
    game = games.get(str(session_id))

    if game is None:
        return JsonResponse(
            {"error": "Game not found"},
            status=404,
        )

    if game["status"] == "ACTIVE":
        game["status"] = "GAME_OVER"

    return JsonResponse({
        "session_id": str(session_id),
        "score": game["score"],
        "game_over": True,
        "actions": {
            "initial_direction": game["initial_direction"],
            "actions": game["actions"],
            "total_ticks": game["tick"],
        },
    })