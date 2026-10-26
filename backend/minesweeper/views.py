from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from hub.models import GameChoices, Session

from .game import (
    DIFFICULTIES,
    MAX_MOVES,
    collect,
    count,
    moves_left,
    neighbors,
    reveal,
    score,
    set_mines,
    set_powerups,
    sonar,
    time_left,
)
from . import state as store
from .serializers import MoveSerializer, StartSerializer
from .state import IN_PROGRESS, LOST, WON, MinesweeperState

# Reasons a game was lost.
BY_MINE, BY_TIME, BY_MOVES = "mine", "time", "moves"


def _finish(game, result, reason=None):
    game.status = result
    game.end_reason = reason if result == LOST else None
    game.finishedAt = timezone.now()
    game.score = score(game)
    Session.update_score(game.pk, game.user_id, game.score)


def _out_of_time(game):
    left = time_left(game, timezone.now())
    return game.status == IN_PROGRESS and game.mines is not None and left is not None and left <= 0


def _live(game):
    # Everything a move can change, as the player sees it.
    flagged, detected, defused = set(game.flagged or []), set(game.detected), set(game.defused)
    data = {
        "status": game.status,
        "move_count": game.move_count,
        "flagged": game.flagged or [],
        "mines_left": game.mine_count - len(flagged | detected) - len(defused),
        "moves_used": game.moves_used,
        "moves_left": moves_left(game),
        "time_left": time_left(game, timezone.now()),
        "shields": game.shields,
        "sonars": game.sonars,
        "found": game.found,
        "detected": game.detected,
        "defused": game.defused,
        "end_reason": game.end_reason,
    }
    if game.status != IN_PROGRESS:
        data["mines"] = game.mines
        data["exploded"] = game.exploded or []
        data["score"] = game.score
        data["powerups"] = game.powerups
    return data


def _state(game):
    # Full board as the player sees it, so a client can rebuild after a refresh.
    mines = set(game.mines or [])
    return {
        "id": game.pk,
        "width": game.width,
        "height": game.height,
        "mine_count": game.mine_count,
        "time_limit": game.time_limit,
        "move_limit": game.move_limit,
        "cells": [[i, count(mines, i, game.width, game.height)] for i in game.revealed or []],
        "startedAt": game.startedAt if game.mines is not None else None,
        "finishedAt": game.finishedAt,
        **_live(game),
    }


def _move_result(game, cells=(), picked_up=(), blocked=(), pinged=()):
    return {
        **_live(game),
        # Only what this move changed.
        "cells": list(cells),
        "picked_up": list(picked_up),
        "blocked": list(blocked),
        "pinged": list(pinged),
    }


def _bad(detail):
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


def _load_or_404(game_id, user):
    game = store.load(game_id, user.id)
    if game is None:
        raise Http404
    return game


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_game(request, game_id):
    serializer = StartSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    config = DIFFICULTIES[serializer.validated_data["difficulty"]]

    session = get_object_or_404(
        Session, id=game_id, user=request.user, game__name=GameChoices.MINESWEEPER
    )
    game = MinesweeperState(
        id=str(session.id),
        user_id=request.user.id,
        seed=session.seed,
        width=config.width,
        height=config.height,
        mine_count=config.mine_count,
        time_limit=config.time_limit,
        move_limit=config.move_limit,
        powerup_count=config.powerups,
    )
    if not store.create(game):
        return Response({"detail": "Game already started."}, status=status.HTTP_409_CONFLICT)

    return Response(_state(game), status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def game_state(request, game_id):
    game = _load_or_404(game_id, request.user)
    if _out_of_time(game):
        # Nobody may move again, so end it here. If a move holds the lock it
        # will end the game itself.
        with store.lock(game_id) as acquired:
            if acquired:
                game = _load_or_404(game_id, request.user)
                if _out_of_time(game):
                    _finish(game, LOST, BY_TIME)
                    store.save(game)
    return Response(_state(game))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def play_move(request, game_id):
    serializer = MoveSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    move = serializer.validated_data

    with store.lock(game_id) as acquired:
        if not acquired:
            return Response({"detail": "Another move is in progress."}, status=status.HTTP_409_CONFLICT)
        game = _load_or_404(game_id, request.user)

        if game.status != IN_PROGRESS:
            return Response({"detail": "Game is already over."}, status=status.HTTP_409_CONFLICT)
        if _out_of_time(game):
            _finish(game, LOST, BY_TIME)
            store.save(game)
            return Response(_move_result(game))
        if move["no"] != game.move_count:
            return Response(
                {"detail": "Out of order move.", "move_count": game.move_count},
                status=status.HTTP_409_CONFLICT,
            )

        w, h = game.width, game.height
        row, column = move["row"], move["column"]
        if not (0 <= row < h and 0 <= column < w):
            return _bad("Cell out of bounds.")

        idx = row * w + column
        game.revealed = game.revealed or []
        game.flagged = game.flagged or []
        revealed, flagged = set(game.revealed), set(game.flagged)
        defused, detected = set(game.defused), set(game.detected)
        cells, picked_up, blocked, pinged = [], [], [], []

        if move["type"] == "flag":
            if idx in revealed or idx in defused:
                return _bad("Cell is already revealed.")
            if idx not in flagged and len(flagged) >= game.mine_count - len(defused):
                return _bad("No flags left.")
            flagged ^= {idx}
            game.flagged = sorted(flagged)

        elif move["type"] == "sonar":
            if game.mines is None:
                return _bad("Reveal a tile first.")
            if game.sonars < 1:
                return _bad("No sonar left.")
            game.sonars -= 1
            game.moves_used += 1
            pinged = sonar(game, idx)

        else:
            if game.mines is None:
                # First reveal places the mines so the opening click is always safe.
                game.mines = set_mines(game, idx)
                game.powerups = set_powerups(game, idx, game.powerup_count)
                # The clock starts on the first reveal, not when the board is created.
                game.startedAt = timezone.now()
            mines = set(game.mines)
            # Cells the player knows are mines.
            marked = flagged | defused | detected

            if move["type"] == "reveal":
                if idx in revealed or idx in marked:
                    return _bad("Cell cannot be revealed.")
                targets = [idx]
            else:  # chord
                if idx not in revealed:
                    return _bad("Can only chord a revealed cell.")
                around = list(neighbors(idx, w, h))
                if sum(1 for n in around if n in marked) != count(mines, idx, w, h):
                    return _bad("Flag count does not match.")
                targets = [n for n in around if n not in revealed and n not in marked]
                if not targets:
                    # Would waste a move for nothing.
                    return _bad("Nothing to reveal.")

            game.moves_used += 1
            hit = [t for t in targets if t in mines]
            if hit and game.shields > 0:
                # A shield blocks one mine; any other mine hit still explodes.
                game.shields -= 1
                blocked = hit[:1]
                game.defused = sorted(defused | set(blocked))
                hit = hit[1:]

            if hit:
                game.exploded = hit
                _finish(game, LOST, BY_MINE)
            else:
                for t in targets:
                    if t not in mines:
                        cells.extend(reveal(game, t, mines))
                picked_up = collect(game, cells)
                if len(game.revealed) == w * h - game.mine_count:
                    _finish(game, WON)

        game.move_count += 1
        if game.status == IN_PROGRESS and (moves_left(game) == 0 or game.move_count >= MAX_MOVES):
            _finish(game, LOST, BY_MOVES)
        store.save(game)

    return Response(_move_result(game, cells, picked_up, blocked, pinged))
